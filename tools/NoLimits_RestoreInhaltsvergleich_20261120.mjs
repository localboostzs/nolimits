// NoLimits: compare sensitive Postgres source and isolated-restore TABLE CONTENT
// using server-side SHA-256 row fingerprints. No raw rows or fingerprints logged.
// Run ONLY on the private Home Server, never in a public GitHub Action with real DB credentials.
// The source is strictly READ ONLY; this tool makes ZERO database changes.
import {spawnSync} from 'node:child_process';
import {statSync} from 'node:fs';

const ref='jcctdjjunxmxaphjkrsz';
const synthetic=process.env.NL_SYNTHETIC_TEST==='1';
const sourceHost=process.env.PGHOST||'';
const restoreHost=process.env.NL_RESTORE_HOST||'';
const restorePort=Number(process.env.NL_RESTORE_PORT||0);
const abort=reason=>{console.error('FAIL: '+reason);process.exit(2);};
const credentials=['PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSFILE'];
if(credentials.some(k=>!process.env[k]))abort('Source connection settings incomplete');
if(!restoreHost||!Number.isInteger(restorePort)||!process.env.NL_RESTORE_DATABASE||
   !process.env.NL_RESTORE_USER||!process.env.NL_RESTORE_PGPASSFILE)
  abort('Isolated restore connection settings incomplete');
if(!['127.0.0.1','localhost','::1'].includes(restoreHost)||restorePort<1025||
    restorePort>65535)abort('Restore connection must use a loopback-only high port');
if(!synthetic){
  const direct=sourceHost==='db.'+ref+'.supabase.co';
  const pooler=sourceHost.endsWith('.pooler.supabase.com')&&
    process.env.PGUSER==='postgres.'+ref;
  if(!(direct||pooler)||process.env.PGPORT!=='5432'||process.env.PGDATABASE!=='postgres')
    abort('Source must be precisely the approved NoLimits Supabase project');
  if(process.env.PGSSLMODE!=='verify-full'||!process.env.PGSSLROOTCERT)
    abort('Production source requires verified TLS');
  if(process.env.NL_RESTORE_ISOLATED_ACK!=='YES')
    abort('Explicitly confirm the restore is a separate disposable local container');
  if(process.env.PGPASSWORD)abort('Use PGPASSFILE rather than PGPASSWORD');
}
for(const file of [process.env.PGPASSFILE,process.env.NL_RESTORE_PGPASSFILE]){
  let mode;
  try{mode=statSync(file).mode&0o777;}catch{abort('Private password file unavailable');}
  if(mode!==0o600)abort('Connection password files must have mode 0600');
}
function psql(label,sql) {
  const isSource=label==='source';
  const env={...process.env,
    PGHOST:isSource?process.env.PGHOST:restoreHost,
    PGPORT:isSource?process.env.PGPORT:String(restorePort),
    PGUSER:isSource?process.env.PGUSER:process.env.NL_RESTORE_USER,
    PGDATABASE:isSource?process.env.PGDATABASE:process.env.NL_RESTORE_DATABASE,
    PGPASSFILE:isSource?process.env.PGPASSFILE:process.env.NL_RESTORE_PGPASSFILE,
    PGSSLMODE:isSource?process.env.PGSSLMODE:(synthetic?'disable':'disable'),
    PGOPTIONS:'-c default_transaction_read_only=on -c timezone=UTC -c DateStyle=ISO,MDY'
  };
  delete env.PGPASSWORD;
  const child=spawnSync('psql',
    ['-X','-q','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],
    {env,encoding:'utf8',maxBuffer:1024*1024,timeout:300000});
  if(child.error||child.status!==0)abort(label+' SELECT failed (no SQL data printed).');
  return String(child.stdout||'').trim().split('\n').filter(Boolean);
}
function quoteIdentifier(s){
  if(!/^[a-z_][a-z0-9_]*$/.test(s))abort('Unexpected SQL table identifier');
  return '"'+s+'"';
}
const schemas=['public','auth','storage','vault'];
const queryTables=`SELECT n.nspname,c.relname
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
WHERE n.nspname IN (${schemas.map(s=>"'"+s+"'").join(',')})
  AND c.relkind IN ('r','p') AND NOT c.relispartition
ORDER BY n.nspname,c.relname;`;
const tables={};
for(const label of ['source','restore']){
  const names=psql(label,queryTables).map(line=>{
    const parts=line.split('\t');
    if(parts.length!==2)abort('Unexpected table list');
    return parts;
  });
  if(!names.length)abort('No tables found in '+label);
  tables[label]=names.map(([schema,table])=>schema+'.'+table);
}
const src=new Set(tables.source), dst=new Set(tables.restore);
const absent=[...src].filter(t=>!dst.has(t));
const extra=[...dst].filter(t=>!src.has(t));
if(absent.length||extra.length)
  abort('Schema table inventory differs: '+absent.length+' missing, '+extra.length+' unexpected tables');
const sql=tables.source.map((name)=>{
  const [schema,table]=name.split('.');
  const ident=quoteIdentifier(schema)+'.'+quoteIdentifier(table);
  // to_jsonb(table_row)::text is normalized by PostgreSQL, including key order.
  // HASHES remain inside each DB. Only table names/counts/hash values cross
  // a private psql pipe into this process; hashes are never printed or persisted.
  return `SELECT '${name}', count(*)::bigint,
     encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h COLLATE "C"),''),'UTF8')),'hex')
   FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h
         FROM ${ident} AS t) AS hashes`;
}).join(' UNION ALL ')+';';
const fingerprints={};
for(const label of ['source','restore']){
  const rows=psql(label,sql);
  fingerprints[label]=new Map(rows.map(line=>{
    const fields=line.split('\t');
    if(fields.length!==3||!/^\d+$/.test(fields[1])||
       !/^[0-9a-f]{64}$/.test(fields[2]))abort('Unexpected fingerprint response');
    return [fields[0],{count:fields[1],digest:fields[2]}];
  }));
}
let errors=0;
for(const name of tables.source){
  const a=fingerprints.source.get(name),b=fingerprints.restore.get(name);
  if(!a||!b||a.count!==b.count||a.digest!==b.digest){
    console.error('FAIL: restore differs for '+name+' (content/count; fingerprints hidden)');
    errors++;
  }
}
if(errors)process.exit(1);
console.log('PASS: identical source/restore SHA-256 content fingerprints across '+
  tables.source.length+' tables (public, auth, storage, vault); no data/hash printed.');
console.log('NOTE: source may change after the backup snapshot; compare immediately after a fresh backup/restore.');
