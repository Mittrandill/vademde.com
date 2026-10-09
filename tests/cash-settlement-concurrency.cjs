// Independent PostgreSQL sessions; disposable reduced fixture only. Creates synthetic rows.
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const executable='/usr/local/Cellar/postgresql@17/17.11/bin/psql';
const ws='00000000-0000-0000-0000-000000000010',actor='00000000-0000-0000-0000-000000000020';
const cp='00000000-0000-0000-0000-000000000040',account='00000000-0000-0000-0000-000000000001';
function sql(query){return new Promise(resolve=>{
 const child=spawn(executable,['-h','/private/tmp/vademde-pg-tests.6JZ7Fw','-p','55439','-d','vademde_finance_test','-v','ON_ERROR_STOP=1','-At','-c',query]);
 let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
 child.on('error',e=>resolve({code:-1,out,err:String(e)}));child.on('close',code=>resolve({code,out:out.trim(),err}));
});}
const literal=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
function input(target){
 const header={account_id:account,counterparty_id:cp,currency_code:'TRY',value_unit_type:'fiat',amount_minor:2000000,direction:'receivable',method:'havale',paid_at:'2026-10-09T12:00:00Z',fx_rate_try_minor:null};
 const items=target?[{payment:{workspace_id:ws,obligation_id:target,account_id:account,amount_minor:2000000,paid_at:header.paid_at,fx_rate_try_minor:null},transaction:{workspace_id:ws,account_id:account,counterparty_id:cp,currency_code:'TRY',direction:'income',amount_minor:2000000,payment_method:'havale',fx_rate_try_minor:null}}]:[];
 return {header,items,expected:target?[{id:target,remaining_amount_minor:3000000}]:[]};
}
const session="SET statement_timeout='15s'; SET ROLE authenticated; ";
function submit(req,data){return sql(session+`SELECT public.settle_cash_atomic('${actor}','${req}','${ws}',${literal(data.header)},${literal(data.items)},${literal(data.expected)});`);}
async function target(){const id=randomUUID();const r=await sql(`INSERT INTO public.obligations(id,workspace_id,counterparty_id,title,document_type,direction,currency_code,total_amount_minor) VALUES('${id}','${ws}','${cp}','Race fixture','fatura','receivable','TRY',3000000);`);assert.equal(r.code,0,r.err);return id;}
(async()=>{
 const first=await target(),data=input(first);
 const competing=await Promise.all([submit(randomUUID(),data),submit(randomUUID(),data)]);
 assert.equal(competing.filter(x=>x.code===0).length,1);assert.match(competing.find(x=>x.code!==0).err,/kalan tutarı değişti/);
 const balance=await sql(`SELECT remaining_amount_minor FROM public.obligations WHERE id='${first}';`);assert.equal(balance.out,'1000000');
 console.log('PASS concurrent different IDs: one payment, stale second rejected, 10k remains');
 const second=await target(),retry=randomUUID(),same=input(second);
 const duplicated=await Promise.all([submit(retry,same),submit(retry,same)]);
 assert.ok(duplicated.every(x=>x.code===0),duplicated.map(x=>x.err).join('\n'));
 const count=await sql(`SELECT count(*) FROM public.payments WHERE obligation_id='${second}';`);assert.equal(count.out,'1');
 console.log('PASS concurrent same ID: single payment, both callers receive success');
 const cancelId=randomUUID(),prepayment=input(null);
 const racing=await Promise.all([submit(cancelId,prepayment),sql(session+`SELECT public.cancel_cash_settlement_request('${actor}','${ws}','${cancelId}');`)]);
 assert.equal(racing[1].code,0,racing[1].err);
 const state=await sql(`SELECT result FROM finance_private.cash_settlement_requests WHERE workspace_id='${ws}' AND request_id='${cancelId}';`);assert.equal(state.code,0,state.err);
 const receipt=JSON.parse(state.out);
 if(receipt.cancelled){assert.notEqual(racing[0].code,0);assert.match(racing[0].err,/iptal edildi/);}
 else{assert.equal(racing[0].code,0,racing[0].err);const movement=await sql(`SELECT count(*) FROM public.transactions WHERE source_obligation_id='${receipt.advance_obligation.id}';`);assert.equal(movement.out,'1');}
 console.log('PASS cancellation/submit race: either one complete advance or terminal cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
