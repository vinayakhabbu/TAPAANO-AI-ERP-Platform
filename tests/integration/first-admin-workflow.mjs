import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

// Called only on the verified empty local CLI project, before the finance fixture.
// Real GoTrue creates the first user through the deployed database trigger.
export async function qualifyFirstAdmin({db,status,api,email,password}) {
  assert.ok(["127.0.0.1","localhost"].includes(new URL(api).hostname));
  const token=randomBytes(32).toString("hex"),hash=createHash("sha256").update(token).digest("hex");
  const args=["Synthetic A",email,"Synthetic administrator","integration-first-admin",hash];
  const sql="SELECT * FROM public.prepare_first_admin_invitation($1,$2,$3,$4,$5)";
  const {rows:[invitation]}=await db.query(sql,args);
  assert.deepEqual((await db.query(sql,args)).rows,[invitation]);
  const admin=createClient(api,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const anonymous=createClient(api,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ok((await admin.rpc("prepare_first_admin_invitation",{p_company_name:"Forbidden",p_email:email,p_display_name:"Denied",p_idempotency_key:"api",p_token_hash:hash})).error);
  assert.ok((await anonymous.rpc("prepare_first_admin_invitation",{p_company_name:"Forbidden",p_email:email,p_display_name:"Denied",p_idempotency_key:"api",p_token_hash:hash})).error);
  const wrong=await admin.auth.admin.generateLink({type:"invite",email:"wrong-first-admin@tapaano.test",options:{data:{tapaano_invitation_id:invitation.invitation_id,tapaano_invitation_token:token}}});
  assert.ok(wrong.error,"A different inbox must not consume the first-admin authorization");
  assert.equal((await db.query("SELECT count(*)::int n FROM auth.users")).rows[0].n,0);
  const link=await admin.auth.admin.generateLink({type:"invite",email,options:{data:{tapaano_invitation_id:invitation.invitation_id,tapaano_invitation_token:token,role:"viewer"}}});
  assert.equal(link.error,null,link.error?.message);
  const activated=await anonymous.auth.verifyOtp({type:"invite",token_hash:link.data.properties.hashed_token});
  assert.equal(activated.error,null,activated.error?.message);
  assert.ok(activated.data.user.email_confirmed_at);
  const userId=activated.data.user.id;
  assert.equal((await db.query(sql,args)).rows[0].status,"CONSUMED");
  await assert.rejects(db.query(sql,[...args.slice(0,3),"second-bootstrap",hash]),/closed/);
  assert.ok((await anonymous.auth.verifyOtp({type:"invite",token_hash:link.data.properties.hashed_token})).error,"Invite link is single-use");
  let server,browser;
  try {
    server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","4174","--strictPort"],{env:{...process.env,VITE_SUPABASE_URL:api,VITE_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY},stdio:"ignore"});
    const origin="http://127.0.0.1:4174";
    let ready=false;
    for(let attempt=0;attempt<100;attempt++){if(server.exitCode!==null)throw Error("Activation app exited");try{if((await fetch(origin)).ok){ready=true;break;}}catch{/* startup */}await delay(200);}
    assert.ok(ready);
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(origin+"/auth/setup");
    await page.getByText("This invitation is missing, expired, or has already been used.",{exact:false}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save password",exact:true}).count(),0);
    const session=activated.data.session;
    const fragment=new URLSearchParams({access_token:session.access_token,refresh_token:session.refresh_token,token_type:"bearer",expires_in:"3600",type:"invite"});
    // An email opens a fresh document. A hash-only navigation on the already
    // initialized missing-link page would not rerun Supabase URL initialization.
    await page.goto("about:blank");
    await page.goto(origin+"/auth/setup#"+fragment);
    await page.getByLabel("New password",{exact:true}).fill(password);
    await page.getByLabel("Confirm password",{exact:true}).fill(password+"-mismatch");
    await page.getByRole("button",{name:"Save password",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"same password twice"}).waitFor();
    await page.getByLabel("Confirm password",{exact:true}).fill(password);
    await page.route("**/auth/v1/user",route=>route.request().method()==="PUT"?route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({msg:"Synthetic failure"})}):route.continue());
    await page.getByRole("button",{name:"Save password",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"could not be saved"}).waitFor();
    await page.unroute("**/auth/v1/user");
    await page.getByRole("button",{name:"Save password",exact:true}).click();
    await page.getByText("Password saved. Sign in with your new password.",{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem("tapaano-auth-session")),null);
    await page.getByLabel("Email",{exact:true}).fill(email);
    await page.getByLabel("Password",{exact:true}).fill(password);
    await page.getByRole("button",{name:"Sign In",exact:true}).click();
    await page.getByText("Journal-linked posted invoices",{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    const signedIn=await anonymous.auth.signInWithPassword({email,password});
    assert.equal(signedIn.error,null,signedIn.error?.message);
    const profile=await anonymous.from("profiles").select("id,org_id,role").single();
    assert.equal(profile.error,null,profile.error?.message);
    assert.deepEqual(profile.data,{id:userId,org_id:invitation.org_id,role:"admin"});
    return {userId,orgId:invitation.org_id};
  }finally{await browser?.close();if(server){server.kill("SIGTERM");await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",resolve);});}}
}
