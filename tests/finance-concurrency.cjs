// Requires the isolated SQL fixture. Never connects to the project's Supabase.
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const psql = process.env.TEST_PSQL_BIN || '/usr/local/Cellar/postgresql@17/17.11/bin/psql';
const host = process.env.TEST_PGHOST;
const port = process.env.TEST_PGPORT;
if (!host?.startsWith('/private/tmp/vademde-pg-tests.') || !/^\d+$/.test(port??'')) {
 throw Error('TEST_PGHOST must identify the disposable local test socket; TEST_PGPORT is required.');
}
function sql(query){return new Promise((resolve,reject)=>{
 const p=spawn(psql,['-h',host,'-p',port,'-d','vademde_finance_test','-v','ON_ERROR_STOP=1','-At','-c',query]);
 let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);
 p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));
});}
(async()=>{
 // Unique test row avoids modifying the other integration test scenarios.
 const id='00000000-0000-0000-0000-000000000199';
 const setup=await sql(`insert into public.obligations values('${id}','00000000-0000-0000-0000-000000000010',3000000,3000000,'TRY','receivable','bekliyor')`);
 assert.equal(setup.code,0,setup.stderr);
 const query=`begin; insert into public.payments(workspace_id,obligation_id,amount_minor) values
 ('00000000-0000-0000-0000-000000000010','${id}',2000000); select pg_sleep(0.3); commit;`;
 const result=await Promise.all([sql(query),sql(query)]);
 assert.equal(result.filter(x=>x.code===0).length,1,JSON.stringify(result));
 const rejected=result.find(x=>x.code!==0);assert.match(rejected.stderr,/kalan tutarı/);
 const balance=await sql(`select remaining_amount_minor from public.obligations where id='${id}'; select count(*) from public.payments where obligation_id='${id}'`);
 assert.equal(balance.code,0,balance.stderr);assert.equal(balance.stdout.trim(),'1000000\n1');
 console.log('PASS: two concurrent 20k payments against 30k debt -> one accepted, one rejected, 10k remaining');
})().catch(e=>{console.error(e);process.exitCode=1;});
