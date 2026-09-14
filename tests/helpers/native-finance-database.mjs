import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

// Run the same financial assertions on PostgreSQL when the disposable CI service
// is supplied. Every fixture owns a separate database; no source schema is reset.
export async function nativeFinanceDatabase(fixture){
 const url=new URL(process.env.TAPAANO_TEST_DATABASE_URL);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Finance regression databases must be local');
 assert.equal(url.pathname,'/tapaano_regression_fixture','Use only the dedicated empty regression service');
 const maintenance=new pg.Client({connectionString:url.href});await maintenance.connect();
 const name='tapaano_finance_'+randomUUID().replaceAll('-','');let client,created=false;
 try{
  assert.equal(Number((await maintenance.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count),0,'The regression service bootstrap database must remain empty');
  await maintenance.query('BEGIN');await maintenance.query("SELECT pg_advisory_xact_lock(hashtext('tapaano regression roles'))");
  await maintenance.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;END $$;");
  assert.equal(Number((await maintenance.query("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls")).rows[0].count),3,'Synthetic finance roles must retain their restricted attributes');await maintenance.query('COMMIT');
  await maintenance.query('CREATE DATABASE "'+name+'"');created=true;const dbUrl=new URL(url);dbUrl.pathname='/'+name;client=new pg.Client({connectionString:dbUrl.href});await client.connect();
  // PostgreSQL roles are cluster-wide; their exact bootstrap statements were
  // executed under a lock above. All schema, grants and policies are unchanged.
  for(const role of ['anon','authenticated','service_role']){const sql='CREATE ROLE '+role+' NOLOGIN;';assert.equal(fixture.split(sql).length,2);fixture=fixture.replace(sql,'');}
  await client.query(fixture);
  return {query:(sql,args)=>client.query(sql,args),exec:async sql=>{const r=await client.query(sql);return Array.isArray(r)?r:[r];},close:async()=>{try{await client.end();await maintenance.query('DROP DATABASE "'+name+'"');}finally{await maintenance.end();}}};
 }catch(error){if(client)await client.end().catch(()=>{});await maintenance.query('ROLLBACK').catch(()=>{});if(created)await maintenance.query('DROP DATABASE "'+name+'"').catch(()=>{});await maintenance.end();throw error;}
}
