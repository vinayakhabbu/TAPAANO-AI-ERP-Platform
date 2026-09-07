import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { captureRecoverySnapshot, verifyRecoveryForeignKeys, requireLocalRecovery } from "./helpers/recovery-snapshot.mjs";

const status={DB_URL:"postgresql://postgres:synthetic@127.0.0.1:54322/postgres",API_URL:"http://127.0.0.1:54321"};
const inspection={Name:"/supabase_db_fixture",State:{Running:true},NetworkSettings:{Ports:{"5432/tcp":[{HostPort:"54322"}]}}};
test("recovery accepts only the matching running local database container and rejects endpoint overrides",()=>{
 assert.equal(requireLocalRecovery(status,"fixture",inspection),"supabase_db_fixture");
 for(const url of ["postgresql://postgres:synthetic@example.com:54322/postgres","postgresql://postgres@127.0.0.1:54322/other","postgresql://postgres@127.0.0.1:54322/postgres?host=example.com","postgresql://postgres@127.0.0.1:54323/postgres"]) assert.throws(()=>requireLocalRecovery({...status,DB_URL:url},"fixture",inspection));
 assert.throws(()=>requireLocalRecovery({...status,API_URL:"https://live.supabase.co"},"fixture",inspection));
 assert.throws(()=>requireLocalRecovery(status,"fixture",{...inspection,Name:"/another_database"}));
 assert.throws(()=>requireLocalRecovery(status,"fixture",{...inspection,State:{Running:false}}));
 assert.throws(()=>requireLocalRecovery(status,"../fixture",inspection));
});
test("recovery fingerprints detect same-count edits, missing rows, privilege drift and disabled triggers",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE SCHEMA auth;CREATE ROLE authenticated;CREATE TABLE public.docs(id int PRIMARY KEY,amount numeric(15,2));
   INSERT INTO public.docs VALUES(1,15000.00),(2,21500.00);
   ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;CREATE POLICY read_docs ON public.docs FOR SELECT TO authenticated USING(true);
   GRANT SELECT ON public.docs TO authenticated;
   CREATE FUNCTION public.watch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
   CREATE TRIGGER watch_doc BEFORE INSERT ON public.docs FOR EACH ROW EXECUTE FUNCTION public.watch();`);
  const baseline=await captureRecoverySnapshot(db);
  assert.deepEqual(await captureRecoverySnapshot(db),baseline);
  await db.exec("UPDATE public.docs SET amount=amount+0.01 WHERE id=1");
  const edited=await captureRecoverySnapshot(db);assert.equal(edited.tables[0].count,baseline.tables[0].count);assert.notEqual(edited.tables[0].fingerprint,baseline.tables[0].fingerprint);
  await db.exec("UPDATE public.docs SET amount=15000 WHERE id=1;DELETE FROM public.docs WHERE id=2");
  assert.notEqual((await captureRecoverySnapshot(db)).tables[0].count,baseline.tables[0].count);
  await db.exec("INSERT INTO public.docs VALUES(2,21500);GRANT UPDATE ON public.docs TO authenticated");
  assert.notDeepEqual((await captureRecoverySnapshot(db)).tables,baseline.tables);
  await db.exec("REVOKE UPDATE ON public.docs FROM authenticated;ALTER TABLE public.docs DISABLE TRIGGER watch_doc");
  assert.notDeepEqual((await captureRecoverySnapshot(db)).triggers,baseline.triggers);
  await assert.rejects(verifyRecoveryForeignKeys(db),/disabled triggers/);
 }finally{await db.close();}
});
test("recovery checks foreign-key rows copied with triggers disabled, including composite MATCH FULL nulls",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE SCHEMA auth;CREATE TABLE public.parent(a int,b int,PRIMARY KEY(a,b));
    CREATE TABLE public.child(a int,b int,FOREIGN KEY(a,b) REFERENCES public.parent(a,b) MATCH FULL);
    INSERT INTO public.parent VALUES(1,2);INSERT INTO public.child VALUES(1,2),(null,null);`);
  assert.equal(await verifyRecoveryForeignKeys(db),1);
  await db.exec("SET session_replication_role=replica;INSERT INTO public.child VALUES(9,9);SET session_replication_role=origin");
  await assert.rejects(verifyRecoveryForeignKeys(db),/foreign-key violation/);
  await db.exec("DELETE FROM public.child WHERE a=9;SET session_replication_role=replica;INSERT INTO public.child VALUES(1,null);SET session_replication_role=origin");
  await assert.rejects(verifyRecoveryForeignKeys(db),/foreign-key violation/);
 }finally{await db.close();}
});
