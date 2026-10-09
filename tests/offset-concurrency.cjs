// Connects only to the disposable local fixture, never Supabase.
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
 const replayQuery="begin; set local role authenticated; select public.test_offset('00000000-0000-0000-0000-000000000440'); select pg_sleep(0.3); commit;";
 const replay=await Promise.all([sql(replayQuery),sql(replayQuery)]);
 assert.ok(replay.every(x=>x.code===0),JSON.stringify(replay));
 const counts=await sql("select count(*) from finance_private.offset_requests where request_id='00000000-0000-0000-0000-000000000440'; select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000403';");
 assert.equal(counts.stdout.trim(),'1\n1000000');
 console.log('PASS concurrent identical offset requests -> one receipt, one balanced closure');
 const workspace='00000000-0000-0000-0000-000000000010',party='00000000-0000-0000-0000-000000000040';
 const source='00000000-0000-0000-0000-000000000450',target='00000000-0000-0000-0000-000000000451';
 const setup=await sql(`insert into public.obligations(id,workspace_id,counterparty_id,total_amount_minor,remaining_amount_minor,currency_code,direction,status)
 values('${source}','${workspace}','${party}',3000000,3000000,'TRY','receivable','bekliyor'),
 ('${target}','${workspace}','${party}',3000000,3000000,'TRY','payable','bekliyor') on conflict do nothing;`);
 assert.equal(setup.code,0,setup.stderr);
 const submit=request=>`begin; set local role authenticated; select public.settle_offset_atomic(auth.uid(),'${request}','${workspace}','${party}','payable','TRY',2000000,'2026-10-09T12:00:00Z',null,
 '[{"source_id":"${source}","target_id":"${target}","amount_minor":2000000}]',
 '[{"id":"${source}","remaining_amount_minor":3000000},{"id":"${target}","remaining_amount_minor":3000000}]'); select pg_sleep(0.3); commit;`;
 const result=await Promise.all([sql(submit('00000000-0000-0000-0000-000000000452')),sql(submit('00000000-0000-0000-0000-000000000453'))]);
 assert.equal(result.filter(x=>x.code===0).length,1,JSON.stringify(result));
 assert.match(result.find(x=>x.code!==0).stderr,/kalan tutarı değişti/);
 const remaining=await sql(`select remaining_amount_minor from public.obligations where id in ('${source}','${target}') order by id;`);
 assert.equal(remaining.stdout.trim(),'1000000\n1000000');
 console.log('PASS concurrent different 20k offsets against 30k -> one accepted, both sides remain 10k');
 const cancelSource='00000000-0000-0000-0000-000000000470',cancelTarget='00000000-0000-0000-0000-000000000471',cancelId='00000000-0000-0000-0000-000000000472';
 const cancelSetup=await sql(`insert into public.obligations(id,workspace_id,counterparty_id,total_amount_minor,remaining_amount_minor,currency_code,direction,status)
 values('${cancelSource}','${workspace}','${party}',3000000,3000000,'TRY','receivable','bekliyor'),
 ('${cancelTarget}','${workspace}','${party}',3000000,3000000,'TRY','payable','bekliyor') on conflict do nothing;`);
 assert.equal(cancelSetup.code,0,cancelSetup.stderr);
 const delayed=submit(cancelId).replaceAll(source,cancelSource).replaceAll(target,cancelTarget);
 const cancelling=`begin; set local role authenticated; select public.cancel_offset_request(auth.uid(),'${workspace}','${cancelId}'); select pg_sleep(0.3); commit;`;
 const raced=await Promise.all([sql(delayed),sql(cancelling)]);
 assert.equal(raced[1].code,0,raced[1].stderr);
 const outcome=JSON.parse(raced[1].stdout.split('\n').find(x=>x.startsWith('{')));
 const final=await sql(`select remaining_amount_minor from public.obligations where id in ('${cancelSource}','${cancelTarget}') order by id;
 select count(*) from finance_private.offset_requests where request_id='${cancelId}';`);
 if(outcome.state==='confirmed'){
  assert.equal(raced[0].code,0,raced[0].stderr);assert.equal(final.stdout.trim(),'1000000\n1000000\n1');
 }else{
  assert.equal(outcome.state,'cancelled');assert.notEqual(raced[0].code,0);assert.match(raced[0].stderr,/iptal edildi/);
  assert.equal(final.stdout.trim(),'3000000\n3000000\n1');
 }
 console.log('PASS cancellation racing submission -> either one complete offset or no closure, never both');
})().catch(e=>{console.error(e);process.exitCode=1;});
