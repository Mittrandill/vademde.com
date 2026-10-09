// Runs only against the isolated local fixture; no Supabase connection.
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const host=process.env.TEST_PGHOST,port=process.env.TEST_PGPORT;
if(!host?.startsWith('/private/tmp/vademde-pg-tests.')||!/^\d+$/.test(port??''))throw Error('Disposable test socket required');
function sql(query){return new Promise((resolve,reject)=>{
 const p=spawn(process.env.TEST_PSQL_BIN||'/usr/local/Cellar/postgresql@17/17.11/bin/psql',['-h',host,'-p',port,'-d','vademde_finance_test','-v','ON_ERROR_STOP=1','-At','-c',query]);
 let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);
 p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));
});}
(async()=>{
 const id='00000000-0000-0000-0000-000000000530';
 const setup=await sql(`set role authenticated; do $$ begin perform public.test_reverse_offset('${id}'); end $$;`);
 assert.equal(setup.code,0,setup.stderr);
 const query=`begin; set local role authenticated; select public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','${id}'); select pg_sleep(0.3); commit;`;
 const result=await Promise.all([sql(query),sql(query)]);
 assert.ok(result.every(x=>x.code===0),JSON.stringify(result));
 const remaining=await sql(`select remaining_amount_minor from public.obligations where id in (
 '00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000503') order by id;
 select count(*) from finance_private.offset_reversals where request_id='${id}';`);
 assert.equal(remaining.stdout.trim(),'1500000\n1000000\n1000000\n2000000\n1');
 console.log('PASS two concurrent reversals -> one reversal receipt, both sides reopened once');
})().catch(e=>{console.error(e);process.exitCode=1;});
