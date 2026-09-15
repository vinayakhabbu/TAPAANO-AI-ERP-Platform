import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20260915010000_managed_access_hardening.sql", import.meta.url), "utf8");

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.organizations(id int PRIMARY KEY, name text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), secret text);
    ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_read ON public.organizations FOR SELECT TO authenticated
      USING (id = nullif(current_setting('test.org',true),'')::int);
    GRANT SELECT(id,name,created_at,updated_at) ON public.organizations TO authenticated,service_role;
    INSERT INTO public.organizations(id,name,secret) VALUES (1,'A','private A'),(2,'B','private B');
    CREATE VIEW public.organizations_safe AS SELECT id,name,created_at,updated_at FROM public.organizations;
    GRANT ALL ON public.organizations_safe TO anon,authenticated,service_role;
    CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
      AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
    CREATE TABLE public.timestamp_probe(id int PRIMARY KEY, updated_at timestamptz);
    INSERT INTO public.timestamp_probe VALUES(1,'2000-01-01');
    CREATE TRIGGER update_probe BEFORE UPDATE ON public.timestamp_probe FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    GRANT SELECT,UPDATE ON public.timestamp_probe TO authenticated;
  `);
  return db;
}

test("organization view closes the inherited owner bypass and stays read-only across tenants", async () => {
  const db = await fixture();
  try {
    await db.exec("SET ROLE anon");
    assert.equal((await db.query("SELECT id FROM public.organizations_safe")).rows.length, 2, "Reproduce the legacy owner bypass");
    await db.exec("RESET ROLE");
    await db.exec(migration);
    await db.exec("SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM public.organizations_safe"), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    for (const id of [1, 2]) {
      await db.query("SELECT set_config('test.org',$1,false)", [String(id)]);
      assert.deepEqual((await db.query("SELECT id FROM public.organizations_safe")).rows, [{ id }]);
      await assert.rejects(db.query("UPDATE public.organizations_safe SET name='changed'"), /permission denied/);
      await assert.rejects(db.query("DELETE FROM public.organizations_safe"), /permission denied/);
      await assert.rejects(db.query("INSERT INTO public.organizations_safe(id,name) VALUES(3,'new')"), /permission denied/);
      await assert.rejects(db.query("SELECT secret FROM public.organizations"), /permission denied/);
    }
    await db.query("SELECT set_config('test.org','',false)");
    assert.deepEqual((await db.query("SELECT * FROM public.organizations_safe")).rows, []);
  } finally { await db.close(); }
});

test("trigger execution survives revoked direct access and optional hosted helper stays private", async () => {
  const db = await fixture();
  try {
    await db.exec(`CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RETURN; END; $$;
      GRANT EXECUTE ON FUNCTION public.rls_auto_enable(), public.update_updated_at() TO anon,authenticated,service_role;`);
    await db.exec(migration);
    await db.exec(migration);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows: [grants] } = await db.query(`SELECT has_function_privilege($1,'public.update_updated_at()','EXECUTE') AS timestamp,
        has_function_privilege($1,'public.rls_auto_enable()','EXECUTE') AS ddl`, [role]);
      assert.deepEqual(grants, { timestamp: false, ddl: false });
    }
    await db.exec("SET ROLE authenticated; UPDATE public.timestamp_probe SET updated_at='2001-01-01' WHERE id=1");
    assert.equal((await db.query("SELECT updated_at > '2020-01-01' AS maintained FROM public.timestamp_probe")).rows[0].maintained, true);
    await assert.rejects(db.query("SELECT public.update_updated_at()"), /permission denied/);
  } finally { await db.close(); }
});
