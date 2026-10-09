// Disposable local fixture only. Run after card-payment-bootstrap and the card RPC migration.
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const psql = process.env.TEST_PSQL_BIN || '/usr/local/Cellar/postgresql@17/17.11/bin/psql';
const host = process.env.TEST_PGHOST, port = process.env.TEST_PGPORT;
if (!host?.startsWith('/private/tmp/vademde-pg-tests.') || !/^\d+$/.test(port ?? '')) {
 throw Error('Only a disposable vademde test socket is allowed');
}
function sql(query){return new Promise((resolve,reject)=>{
 const p=spawn(psql,['-h',host,'-p',port,'-d','vademde_finance_test','-v','ON_ERROR_STOP=1','-At','-c',query]);
 let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);
 p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));
});}
const workspace='00000000-0000-0000-0000-000000000010';
const card='00000000-0000-0000-0000-000000000301';
const statement='00000000-0000-0000-0000-000000000313';
(async()=>{
 const setup=await sql(`insert into public.obligations(id,workspace_id,account_id,total_amount_minor,remaining_amount_minor,currency_code,direction,status,document_type,due_date)
 values('${statement}','${workspace}','${card}',3000000,3000000,'TRY','payable','bekliyor','kredi_karti_ekstresi','2026-10-10');`);
 assert.equal(setup.code,0,setup.stderr);
 const query=`begin; set local role authenticated; select public.test_card_request('00000000-0000-0000-0000-000000000323',1000000); select pg_sleep(0.3); commit;`;
 const result=await Promise.all([sql(query),sql(query)]);
 assert.ok(result.every(x=>x.code===0),JSON.stringify(result));
 const balance=await sql(`select remaining_amount_minor from public.obligations where id='${statement}';
 select count(*) from finance_private.card_payment_requests where request_id='00000000-0000-0000-0000-000000000323';`);
 assert.equal(balance.stdout.trim(),'2000000\n1');
 console.log('PASS concurrent identical requests -> one transfer, 20k remaining');
 const rollback=await sql(`begin;
 create function public.test_reject_card_payment() returns trigger language plpgsql as $$ begin raise exception 'Injected payment failure'; end $$;
 create trigger test_card_payment_failure before insert on public.payments for each row execute function public.test_reject_card_payment();
 set local role authenticated;
 do $$ declare before_count bigint; rejected boolean:=false;
 begin
 select count(*) into before_count from public.transactions;
 begin perform public.test_card_request('00000000-0000-0000-0000-000000000324',1000000);
 exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.transactions)<>before_count
 or (select remaining_amount_minor from public.obligations where id='${statement}')<>2000000
 or exists(select 1 from finance_private.card_payment_requests where request_id='00000000-0000-0000-0000-000000000324')
 then raise exception 'Payment failure left a partial result'; end if;
 end $$;
 rollback;`);
 assert.equal(rollback.code,0,rollback.stderr);
 console.log('PASS payment-step failure -> no transfer, no receipt, unchanged statement');
})().catch(e=>{console.error(e);process.exitCode=1;});
