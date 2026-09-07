import assert from "node:assert/strict";

const identifier = value => '"' + value.replaceAll('"', '""') + '"';
export const qualify = (schema, table) => `${identifier(schema)}.${identifier(table)}`;

export function requireLocalRecovery(status, projectId, inspection) {
  assert.match(projectId, /^[a-zA-Z0-9_-]{1,80}$/, "Invalid local test project identifier");
  const database = new URL(status.DB_URL), api = new URL(status.API_URL);
  for (const url of [database, api]) {
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Recovery rehearsal requires loopback endpoints");
    assert.equal(url.search, "", "Recovery endpoints cannot contain connection overrides");
    assert.equal(url.hash, "");
  }
  assert.ok(["postgres:", "postgresql:"].includes(database.protocol));
  assert.equal(database.pathname, "/postgres"); assert.equal(database.username, "postgres");
  assert.equal(api.protocol, "http:"); assert.equal(api.username, ""); assert.equal(api.password, "");
  assert.equal(inspection.Name, "/supabase_db_" + projectId, "Recovery must use the CLI's local database container");
  assert.ok(inspection.State?.Running, "Local database container must be running");
  const ports = inspection.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert.ok(database.port && ports.some(port => port.HostPort === database.port), "Container port must match the checked local database");
  return "supabase_db_" + projectId;
}

export async function captureRecoverySnapshot(db) {
  const { rows: tables } = await db.query(`SELECT n.nspname AS schema,c.relname AS name,
    c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,COALESCE(c.relacl::text,'') AS acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','auth') AND c.relkind IN ('r','p') AND NOT c.relispartition
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
    ORDER BY n.nspname,c.relname`);
  const rows = [];
  for (const table of tables) {
    const result = await db.query(`SELECT count(*)::text AS count,
      encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS fingerprint
      FROM ${qualify(table.schema, table.name)} t`);
    rows.push({ ...table, ...result.rows[0] });
  }
  const { rows: policies } = await db.query("SELECT schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','auth') ORDER BY schemaname,tablename,policyname");
  const { rows: triggers } = await db.query(`SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,
    pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','auth') ORDER BY n.nspname,c.relname,t.tgname`);
  // Internal FK trigger names contain generated OIDs. Their constraints are
  // compared separately; application trigger names and enabled state are stable.
  const applicationTriggers = triggers.filter(t => !t.name.startsWith("RI_ConstraintTrigger_"));
  const { rows: constraints } = await db.query(`SELECT n.nspname AS schema,c.relname AS table_name,k.conname AS name,k.convalidated AS validated,
    pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','auth') ORDER BY n.nspname,c.relname,k.conname`);
  const { rows: functions } = await db.query(`SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
    COALESCE(p.proacl::text,'') AS acl,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth') AND p.prokind IN ('f','p')
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`);
  const { rows: sequenceNames } = await db.query("SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND c.relkind='S' ORDER BY n.nspname,c.relname");
  const sequences=[];
  for(const sequence of sequenceNames) {
    const {rows:[state]}=await db.query(`SELECT last_value::text,is_called FROM ${qualify(sequence.schema,sequence.name)}`);
    sequences.push({...sequence,...state});
  }
  return { tables: rows, policies, triggers: applicationTriggers, constraints, functions, sequences };
}

export async function verifyRecoveryForeignKeys(db) {
  const { rows: keys } = await db.query(`SELECT k.conname AS name,k.confmatchtype AS match_type,
    nc.nspname AS child_schema,c.relname AS child_table,np.nspname AS parent_schema,p.relname AS parent_table,
    ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY x(num,pos) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.num ORDER BY x.pos) AS child_columns,
    ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY x(num,pos) JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=x.num ORDER BY x.pos) AS parent_columns
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace nc ON nc.oid=c.relnamespace
    JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace np ON np.oid=p.relnamespace
    WHERE k.contype='f' AND nc.nspname IN ('public','auth') ORDER BY nc.nspname,c.relname,k.conname`);
  for (const key of keys) {
    assert.ok(["s","f"].includes(key.match_type), "Unsupported foreign-key match mode in recovery verification");
    const child = key.child_columns.map(column => "c." + identifier(column));
    const nonnull = child.map(column => column + " IS NOT NULL").join(" AND ");
    const joined = child.map((column, i) => `${column}=p.${identifier(key.parent_columns[i])}`).join(" AND ");
    const partialNull = key.match_type === "f" ? ` OR ((${child.map(column => column + " IS NULL").join(" OR ")}) AND (${child.map(column => column + " IS NOT NULL").join(" OR ")}))` : "";
    const { rows: [result] } = await db.query(`SELECT EXISTS(SELECT 1 FROM ${qualify(key.child_schema,key.child_table)} c WHERE
      ((${nonnull}) AND NOT EXISTS(SELECT 1 FROM ${qualify(key.parent_schema,key.parent_table)} p WHERE ${joined}))${partialNull}) AS invalid`);
    assert.equal(result.invalid, false, `Recovery foreign-key violation: ${key.child_schema}.${key.child_table}.${key.name}`);
  }
  const { rows: [disabled] } = await db.query(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','auth') AND t.tgenabled='D'`);
  assert.equal(disabled.count, 0, "Recovery must not leave disabled triggers");
  return keys.length;
}
