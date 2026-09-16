import assert from "node:assert/strict";
import test from "node:test";
import { readBootstrapConfig, provisionFirstAdmin } from "../scripts/provision-first-admin.mjs";

const config = { company:"Test",email:"admin@example.com",name:"Admin",requestKey:"one",token:"a".repeat(64),callback:"https://app.example.com/auth/setup" };
test("operator refuses unverified delivery and unsafe callback destinations", () => {
  const env = { SUPABASE_URL:"https://project.supabase.co",TAPAANO_ACCOUNT_SETUP_URL:config.callback,TAPAANO_BOOTSTRAP_TOKEN:config.token,TAPAANO_ADMIN_EMAIL:config.email,
    TAPAANO_AUTH_DELIVERY_READY:"yes",TAPAANO_OWNER_DATABASE_URL:"postgres://postgres:synthetic@db.project.supabase.co/postgres?sslmode=verify-full",SUPABASE_SERVICE_ROLE_KEY:"synthetic-server-only",TAPAANO_COMPANY_NAME:"Test",TAPAANO_ADMIN_NAME:"Admin",TAPAANO_BOOTSTRAP_REQUEST_KEY:"one" };
  assert.equal(readBootstrapConfig(env).callback,config.callback);
  for (const callback of ["http://app.example.com/auth/setup","https://app.example.com/auth/setup?next=https://evil.test","https://user:secret@app.example.com/auth/setup","https://app.example.com/"]) assert.throws(()=>readBootstrapConfig({...env,TAPAANO_ACCOUNT_SETUP_URL:callback}));
  assert.throws(()=>readBootstrapConfig({...env,TAPAANO_AUTH_DELIVERY_READY:"no"}));
  assert.throws(()=>readBootstrapConfig({...env,TAPAANO_BOOTSTRAP_TOKEN:"short"}));
  assert.throws(()=>readBootstrapConfig({...env,TAPAANO_OWNER_DATABASE_URL:env.TAPAANO_OWNER_DATABASE_URL.replace("db.project.","db.other.")}));
  assert.throws(()=>readBootstrapConfig({...env,TAPAANO_OWNER_DATABASE_URL:env.TAPAANO_OWNER_DATABASE_URL.replace("verify-full","require")}));
});
test("operator binds the reviewed recipient, verifies roles, and does not resend a consumed request", async () => {
  let calls=0,queries=0;
  const db={query:async(sql,args)=>{queries++;if(sql.includes("prepare_first")){assert.equal(args[1],config.email);assert.notEqual(args[4],config.token);return {rows:[{invitation_id:"synthetic-id",status:"PENDING"}]};}return {rows:[{status:"CONSUMED",profile_role:"admin",membership_role:"admin",email_matches:true}]};}};
  const auth={admin:{inviteUserByEmail:async(email,options)=>{calls++;assert.equal(email,config.email);assert.equal(options.redirectTo,config.callback);assert.equal(options.data.tapaano_invitation_token,config.token);assert.equal(options.data.role,undefined);return {error:null};}}};
  assert.deepEqual(await provisionFirstAdmin(config,db,auth),{status:"invitation_accepted_by_auth",emailSentThisRun:true});
  assert.equal(calls,1);assert.equal(queries,2);
  assert.deepEqual(await provisionFirstAdmin(config,{query:async()=>({rows:[{status:"CONSUMED"}]})},auth),{status:"account_already_created",emailSentThisRun:false});
  assert.equal(calls,1);
});
test("operator never reports delivery when Auth fails or membership verification fails", async () => {
  let queries=0;
  const db={query:async()=>{queries++;return {rows:[{invitation_id:"id",status:"PENDING"}]};}};
  await assert.rejects(provisionFirstAdmin(config,db,{admin:{inviteUserByEmail:async()=>({error:{message:"private provider payload"}})}}),error=>!error.message.includes("private provider") && /Auth invitation failed/.test(error.message));
  assert.equal(queries,1);
  await assert.rejects(provisionFirstAdmin(config,db,{admin:{inviteUserByEmail:async()=>({error:null})}}), /verification failed/);
});
