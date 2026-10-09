/* global __dirname */
// Real TS functions with a deterministic query fake. SQL tests are separate.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
let tables = {}, rpcCalls = [], insertCalls = [], rpcError = null, storageRemovals = 0, authUserId = 'alice', storageFailOnWrite = 0, storageWrites = 0, uuidSequence = 0, cancelState='cancelled', reverseState='reversed', malformedCash=false;
const cashReceipts=new Map();
const storage = new Map();
const asyncStorage = {getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>{
 storageWrites++;if(storageFailOnWrite===storageWrites)throw Error('Injected storage failure');storage.set(k,v);
},removeItem:async k=>storage.delete(k)};
class Query {
 constructor(table){this.table=table;this.filters=[];this.start=0;this.end=999;}
 select(){return this;}
 insert(input){this.insertRows=(Array.isArray(input)?input:[input]).map(r=>({id:`fake-insert-${++uuidSequence}`,remaining_amount_minor:r.total_amount_minor,status:'bekliyor',...r}));insertCalls.push({table:this.table,rows:this.insertRows});return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 neq(k,v){this.filters.push(r=>r[k]!==v);return this;}
 gt(k,v){this.filters.push(r=>r[k]>v);return this;}
 gte(k,v){this.filters.push(r=>r[k]>=v);return this;}
 lt(k,v){this.filters.push(r=>r[k]<v);return this;}
 lte(k,v){this.filters.push(r=>r[k]<=v);return this;}
 in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
 not(k,_op,v){this.filters.push(r=>r[k]!==v);return this;}
 is(k,v){return this.eq(k,v);}
 or(){return this;}
 order(){return this;}
 range(a,b){this.start=a;this.end=b;return this;}
 limit(n){this.end=Math.min(n,1000)-1;return this;}
 single(){this.one=true;return this;}
 maybeSingle(){this.one=true;return this;}
 then(resolve,reject){if(this.insertRows&&!this.inserted){tables[this.table]=[...(tables[this.table]??[]),...this.insertRows];this.inserted=true;}const rows=(this.insertRows??tables[this.table]??[]).filter(r=>this.filters.every(f=>f(r))).slice(this.start,this.end+1);return Promise.resolve({data:this.one?rows[0]??null:rows,error:null}).then(resolve,reject);}
}
const supabase={auth:{getSession:async()=>({data:{session:authUserId?{user:{id:authUserId}}:null},error:null})},from:t=>new Query(t),rpc:(name,args)=>{
 rpcCalls.push({name,args});
 if(name==='settle_cash_atomic'){
  const key=args.p_workspace_id+args.p_request_id,h=args.p_header;
  if(!cashReceipts.has(key)){
   const applied=args.p_items.reduce((sum,x)=>sum+x.payment.amount_minor,0),leftover=h.amount_minor-applied;
   const payments=args.p_items.map((x,i)=>({...x.payment,id:`${key}:p:${i}`,transaction_id:`${key}:t:${i}`}));
   cashReceipts.set(key,{payments,leftover_minor:leftover,advance_obligation:leftover>0?{id:`${key}:advance`,workspace_id:args.p_workspace_id,counterparty_id:h.counterparty_id,direction:h.direction==='payable'?'receivable':'payable',document_type:'avans',currency_code:h.currency_code,total_amount_minor:leftover,remaining_amount_minor:leftover,due_date:null,title:'Avans',status:'bekliyor'}:null,transaction_ids:[...payments.map(p=>p.transaction_id),...(leftover>0?[`${key}:advance-tx`]:[])]});
  }
  return Promise.resolve({data:malformedCash?{}:cashReceipts.get(key),error:rpcError});
 }
 if(name==='cancel_cash_settlement_request')return Promise.resolve({data:{state:cancelState},error:rpcError});
 const grouped=new Map();
 if(name==='settle_offset_atomic')for(const x of args.p_pairs)grouped.set(x.target_id,(grouped.get(x.target_id)??0)+x.amount_minor);
 const result={data:name==='record_payments_v2'?args.p_items.map(x=>x.payment):name==='settle_offset_atomic'?{allocations:[...grouped].map(([id,amount])=>({amount_minor:amount,obligation_id:id}))}:name==='cancel_offset_request'?{state:cancelState}:name==='reverse_offset_atomic'?{state:reverseState}:{},error:rpcError};
 return {then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject),single:()=>Promise.resolve(result)};
}};
const modules = new Map();
function load(relative){
 const filename=path.join(root,relative);if(modules.has(filename))return modules.get(filename).exports;
 const module={exports:{}};modules.set(filename,module);
 const customRequire=name=>{
  if(name==='@/services/supabase')return {supabase};
  if(name==='expo-sharing'||name==='expo-file-system')return {};
  if(name==='expo-crypto')return {randomUUID:()=>`00000000-0000-4000-8000-${String(++uuidSequence).padStart(12,'0')}`};
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:asyncStorage};
  if(name==='@tanstack/query-async-storage-persister')return {createAsyncStoragePersister:()=>({removeClient:async()=>{storageRemovals++;}})};
  if(name==='@react-native-community/netinfo')return {__esModule:true,default:{addEventListener:()=>()=>{}}};
  if(name==='react-native')return {AppState:{addEventListener:()=>({remove(){}})}};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),name))+'.ts');
  return require(name);
 };
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(customRequire,module,module.exports);
 return module.exports;
}
let passed=0;
async function check(name,run){await run();passed++;console.log(`PASS ${name}`);}
(async()=>{
 const reports=load('features/reports/api.ts'),dashboard=load('features/dashboard/api.ts');
 const payments=load('features/payments/api.ts'),values=load('features/valueUnits/api.ts');
 const cards=load('features/cardInstallments/api.ts'),obligations=load('features/obligations/api.ts');
 const exporting=load('features/export/api.ts'),cache=load('services/queryClient.ts');
 const base={id:'o',workspace_id:'w',title:'Fatura',document_type:'fatura',direction:'receivable',currency_code:'TRY',remaining_amount_minor:3000000,status:'bekliyor',due_date:'2026-10-01'};
 await check('30k invoice, 10k receipt, 20k remaining allocation',()=>{
  const r=payments.allocateAcrossObligations(1000000,[base]);assert.equal(base.remaining_amount_minor-r.allocations[0].amountMinor,2000000);
 });
 // These are real API orchestration checks, NOT a simulation of PostgreSQL triggers or RLS.
 for(const method of ['nakit','havale','kredi_karti','online_odeme'])for(const direction of ['payable','receivable'])for(const withInvoice of [false,true]){
  await check(`${method} ${direction}: ${withInvoice?'20k invoice + 10k advance':'30k advance without invoice'}`,async()=>{
   const target={...base,id:'advance-invoice',direction,counterparty_id:'cp',total_amount_minor:2000000,remaining_amount_minor:2000000};
   tables={obligations:withInvoice?[target]:[],installments:[]};rpcCalls=[];insertCalls=[];
   const draft={workspaceId:'w',counterpartyId:'cp',counterpartyName:'Cari',direction,currencyCode:'TRY',amountMinor:3000000,paidAt:'2026-10-09T12:00:00Z',method,accountId:'a',targets:withInvoice?[target]:[]};
   const result=await payments.settleObligations({...draft,actorId:'alice',requestId:`matrix-${method}-${direction}-${withInvoice}`,cashPayload:await payments.prepareCashSettlement(draft)});
   const advance=result.advanceObligation;
   assert.equal(advance.document_type,'avans');assert.equal(advance.direction,direction==='payable'?'receivable':'payable');
   assert.equal(advance.total_amount_minor,withInvoice?1000000:3000000);assert.equal(advance.due_date,null);assert.equal(advance.counterparty_id,'cp');
   assert.equal(insertCalls.length,0);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'settle_cash_atomic');
   const header=rpcCalls[0].args.p_header;assert.equal(header.method,method);assert.equal(header.direction,direction);
   const applied=rpcCalls[0].args.p_items;
   assert.equal(applied.reduce((sum,x)=>sum+x.transaction.amount_minor,0)+result.leftoverMinor,3000000);
   assert.equal(applied.reduce((sum,x)=>sum+x.payment.amount_minor,0),withInvoice?2000000:0);
   // Using the advance later must be a cashless offset, independent of its original method.
   const future={...target,id:'future-invoice',remaining_amount_minor:2000000};rpcCalls=[];insertCalls=[];
   const offset=await payments.settleObligations({workspaceId:'w',counterpartyId:'cp',counterpartyName:'Cari',direction,currencyCode:'TRY',amountMinor:Math.min(advance.total_amount_minor,2000000),paidAt:'2026-10-10T12:00:00Z',method:'mahsup',actorId:'alice',requestId:`${method}-${direction}-${withInvoice}`,targets:[future],sources:[advance]});
   assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'settle_offset_atomic');assert.equal(insertCalls.length,0);
   assert.equal(offset.allocations[0].amountMinor,Math.min(advance.total_amount_minor,2000000));
   assert.equal(advance.total_amount_minor-offset.allocations[0].amountMinor,withInvoice?0:1000000);
  });
 }
 await check('invalid allocation values and duplicate records cannot inflate an advance',()=>{
  for(const amount of [-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>payments.allocateAcrossObligations(amount,[base]));
  for(const remaining of [-1,NaN,Infinity,0.5])assert.throws(()=>payments.allocateAcrossObligations(3000000,[{...base,remaining_amount_minor:remaining}]));
  assert.throws(()=>payments.allocateAcrossObligations(6000000,[base,base]));
  assert.equal(payments.allocateAcrossObligations(0,[base]).leftoverMinor,0);
 });
 await check('invalid settlement amount rejects before ANY financial write',async()=>{
  rpcCalls=[];insertCalls=[];
  for(const amountMinor of [0,-1,NaN,Infinity,0.5])await assert.rejects(payments.settleObligations({workspaceId:'w',counterpartyId:'cp',direction:'receivable',currencyCode:'TRY',amountMinor,paidAt:'2026-10-09T12:00:00Z',method:'nakit',accountId:'a',targets:[]}));
  assert.equal(rpcCalls.length,0);assert.equal(insertCalls.length,0);
 });
 let cashQueue=load('features/payments/cashSettlementQueue.ts');
 const cashDraft={workspaceId:'cash-durable',counterpartyId:'cp',counterpartyName:'Cari',direction:'receivable',currencyCode:'TRY',amountMinor:3000000,paidAt:'2026-10-09T12:00:00Z',method:'havale',accountId:'a',targets:[{...base,id:'cash-target',counterparty_id:'cp',category_id:null,total_amount_minor:2000000,remaining_amount_minor:2000000}]};
 await check('cash lost response preserves full payload across restart and changed installment data',async()=>{
  tables={obligations:[{...cashDraft.targets[0],workspace_id:'cash-durable'}],installments:[]};rpcCalls=[];rpcError={message:'Response lost after commit'};
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',cashDraft));rpcError=null;
  const original=rpcCalls.at(-1).args;tables={};
  modules.delete(path.join(root,'features/payments/cashSettlementQueue.ts'));cashQueue=load('features/payments/cashSettlementQueue.ts');
  const saved=await cashQueue.loadStoredCashSettlement('alice',cashDraft.workspaceId);assert.equal(saved.state,'pending');
  await cashQueue.submitDurableCashSettlement('alice',saved.input);assert.deepEqual(rpcCalls.at(-1).args,original);
 });
 await check('cash confirmed receipt requires explicit acknowledgement before a fresh UUID',async()=>{
  const before=rpcCalls.length;await cashQueue.submitDurableCashSettlement('alice',cashDraft);assert.equal(rpcCalls.length,before);
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',{...cashDraft,amountMinor:1000000}));
  const oldId=(await cashQueue.loadStoredCashSettlement('alice',cashDraft.workspaceId)).input.requestId;
  await cashQueue.acknowledgeCashSettlement('alice',cashDraft.workspaceId);
  tables={obligations:[cashDraft.targets[0]],installments:[]};await cashQueue.submitDurableCashSettlement('alice',cashDraft);
  assert.notEqual((await cashQueue.loadStoredCashSettlement('alice',cashDraft.workspaceId)).input.requestId,oldId);
 });
 await check('cash durable save failure prevents RPC; pending input cannot change or be discarded',async()=>{
  const draft={...cashDraft,workspaceId:'cash-save-fail',targets:[]};const before=rpcCalls.length;
  storageFailOnWrite=storageWrites+1;await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));storageFailOnWrite=0;assert.equal(rpcCalls.length,before);
  rpcError={message:'Uncertain network'};await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));rpcError=null;
  await assert.rejects(cashQueue.acknowledgeCashSettlement('alice',draft.workspaceId));
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',{...draft,accountId:'other'}));
 });
 await check('cash confirmation storage failure keeps original pending ID',async()=>{
  const draft={...cashDraft,workspaceId:'cash-confirm-fail',targets:[]};storageFailOnWrite=storageWrites+2;
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));storageFailOnWrite=0;
  const original=rpcCalls.at(-1).args;assert.equal((await cashQueue.loadStoredCashSettlement('alice',draft.workspaceId)).state,'pending');
  await cashQueue.submitDurableCashSettlement('alice',draft);assert.deepEqual(rpcCalls.at(-1).args,original);
 });
 await check('cash concurrent submissions use a single RPC and cannot recover under another user',async()=>{
  const draft={...cashDraft,workspaceId:'cash-concurrent',targets:[]};const before=rpcCalls.length;
  await Promise.all([cashQueue.submitDurableCashSettlement('alice',draft),cashQueue.submitDurableCashSettlement('alice',draft)]);assert.equal(rpcCalls.length,before+1);
  authUserId='bob';await assert.rejects(cashQueue.loadStoredCashSettlement('alice',draft.workspaceId));authUserId='alice';
 });
 await check('cash cancelled request unlocks only after server confirmation and explicit acknowledgement',async()=>{
  const draft={...cashDraft,workspaceId:'cash-cancel',targets:[]};rpcError={message:'Lost response'};
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));rpcError=null;cancelState='cancelled';
  await cashQueue.cancelStoredCashSettlement('alice',draft.workspaceId);assert.equal((await cashQueue.loadStoredCashSettlement('alice',draft.workspaceId)).state,'cancelled');
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));await cashQueue.acknowledgeCashSettlement('alice',draft.workspaceId);
 });
 await check('cash already-committed cancellation recovers the ORIGINAL receipt, never reverses money',async()=>{
  const draft={...cashDraft,workspaceId:'cash-cancel-confirmed',targets:[]};rpcError={message:'Lost response'};
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));rpcError=null;const original=rpcCalls.at(-1).args;
  cancelState='confirmed';const recovered=await cashQueue.cancelStoredCashSettlement('alice',draft.workspaceId);cancelState='cancelled';
  assert.equal(recovered.state,'confirmed');assert.deepEqual(rpcCalls.at(-1).args,original);
 });
 await check('cash malformed receipt and corrupt local slices fail closed',async()=>{
  const draft={...cashDraft,workspaceId:'cash-malformed',targets:[]};malformedCash=true;
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));malformedCash=false;
  assert.equal((await cashQueue.loadStoredCashSettlement('alice',draft.workspaceId)).state,'pending');
  const key='vademde-cash-settlement-v1:alice:cash-malformed',record=JSON.parse(storage.get(key));record.input.cashPayload.header.amount_minor=1;storage.set(key,JSON.stringify(record));
  const before=rpcCalls.length;await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));assert.equal(rpcCalls.length,before);
 });
 await check('cash cancellation final-storage failure retains pending identity for safe retry',async()=>{
  const draft={...cashDraft,workspaceId:'cash-cancel-storage',targets:[]};rpcError={message:'Lost response'};
  await assert.rejects(cashQueue.submitDurableCashSettlement('alice',draft));rpcError=null;
  const id=(await cashQueue.loadStoredCashSettlement('alice',draft.workspaceId)).input.requestId;
  storageFailOnWrite=storageWrites+1;await assert.rejects(cashQueue.cancelStoredCashSettlement('alice',draft.workspaceId));storageFailOnWrite=0;
  const pending=await cashQueue.loadStoredCashSettlement('alice',draft.workspaceId);assert.equal(pending.state,'pending');assert.equal(pending.input.requestId,id);
  await cashQueue.cancelStoredCashSettlement('alice',draft.workspaceId);assert.equal(rpcCalls.at(-1).args.p_request_id,id);
 });
 await check('cash invalid drafts and bypassing durable preparation cause no financial RPC',async()=>{
  const draft={...cashDraft,workspaceId:'cash-invalid',targets:[]};const before=rpcCalls.length;
  for(const change of [{method:'ciro'},{amountMinor:NaN},{accountId:null},{paidAt:'invalid'},{fxRateTryMinor:-1}])await assert.rejects(cashQueue.submitDurableCashSettlement('alice',{...draft,...change}));
  await assert.rejects(payments.settleObligations(draft));assert.equal(rpcCalls.length,before);
 });
 for(const documentType of ['fatura','avans'])for(const direction of ['payable','receivable']){
  await check(`${documentType} ${direction}: open balance follows current FX, paid movement stays fixed`,async()=>{
   const counterparties=load('features/counterparties/api.ts');
   const open={...base,id:'fx-open',counterparty_id:'cp',direction,document_type:documentType,currency_code:'USD',total_amount_minor:30000,remaining_amount_minor:20000,due_date:documentType==='avans'?null:'2026-10-20',fx_rate_try_minor:4000};
   tables={obligations:[open],installments:[],value_unit_rates:[{unit_code:'USD',try_equivalent_minor:4500}],transactions:[{id:'fx-paid',workspace_id:'w',account_id:'a',direction:direction==='payable'?'expense':'income',amount_minor:10000,financing_minor:0,currency_code:'USD',fx_rate_try_minor:4000,occurred_at:'2026-10-09T12:00:00Z'}]};
   const before=await counterparties.getCounterpartyLedger('w','cp');
   assert.equal(before.netMinor,direction==='receivable'?900000:-900000);
   const balances=await counterparties.getCounterpartyBalances('w');assert.equal(balances.cp,before.netMinor);
   const summary=await obligations.getObligationSummary({workspaceId:'w'});assert.equal(direction==='receivable'?summary.receivableMinor:summary.payableMinor,900000);
   const previousReport=await reports.getIncomeExpenseTotals('w');
   tables.value_unit_rates=[{unit_code:'USD',try_equivalent_minor:6000}];
   const after=await counterparties.getCounterpartyLedger('w','cp');assert.equal(after.netMinor,direction==='receivable'?1200000:-1200000);
   assert.deepEqual(await reports.getIncomeExpenseTotals('w'),previousReport);
   assert.deepEqual(await dashboard.getMonthTransactionTotals('w',new Date('2026-10-09T12:00:00Z')),previousReport);
   if(documentType==='avans'){const due=await obligations.getDueBreakdown({workspaceId:'w'});assert.equal(due.payable.remainingTotalMinor+due.receivable.remainingTotalMinor,0);assert.equal(after.nearestDueDate,null);}
  });
 }
 tables={transactions:Array.from({length:1001},(_,i)=>({id:String(i),workspace_id:'w',direction:'expense',amount_minor:100,financing_minor:0,currency_code:'TRY',occurred_at:new Date().toISOString()})),value_unit_rates:[]};
 await check('1001 movements: dashboard and reports agree',async()=>{
  const a=await dashboard.getMonthTransactionTotals('w'),b=await reports.getIncomeExpenseTotals('w');assert.equal(a.expenseMinor,100100);assert.equal(a.expenseMinor,b.expenseMinor);
 });
 await check('export has every row and card/document tables',async()=>{
  const x=await exporting.buildWorkspaceExport('w');assert.equal(x.tables.transactions.length,1001);assert.ok('card_installment_purchases' in x.tables);assert.ok('document_fields' in x.tables);
 });
 await check('calendar progress is NOT payment progress',()=>{
  const x=cards.progressOf({total_minor:1200000,installment_count:12,first_statement_month:'2026-01-01'},new Date(2026,9,9));assert.equal(x.elapsedStatementCount,9);assert.equal(x.futureStatementMinor,300000);assert.equal(x.paidCount,undefined);
 });
 await check('cancelled installment does not reappear as parent debt',async()=>{
  tables={obligations:[base],installments:[{obligation_id:'o',workspace_id:'w',due_date:'2026-10-01',remaining_amount_minor:10000,status:'iptal_edildi'}],value_unit_rates:[]};
  const x=await obligations.getDueBreakdown({workspaceId:'w'});assert.equal(x.receivable.remainingTotalMinor,0);
  const due=await obligations.getDueInfoByObligation('w',[base]);assert.equal(due.o.overdueMinor,0);assert.equal(due.o.hasInstallments,true);
 });
 await check('missing rate fails explicitly, TRY still works',()=>{
  assert.throws(()=>values.sumToReferenceMinor([{amountMinor:10000,unitCode:'USD'}],[]),/USD/);
  assert.equal(values.sumToReferenceMinor([{amountMinor:3000000,unitCode:'TRY'}],[]),3000000);
 });
 await check('payment creation routes to v2 with same custom FX',async()=>{
  tables={obligations:[{...base,currency_code:'USD'}],installments:[]};rpcCalls=[];
  await payments.recordPayment({workspace_id:'w',obligation_id:'o',account_id:'a',amount_minor:100,fx_rate_try_minor:4000,obligationDirection:'receivable',obligationTitle:'USD',obligationCurrencyCode:'USD'});
  const {name,args}=rpcCalls[0];assert.equal(name,'record_payments_v2');assert.equal(args.p_items[0].transaction.fx_rate_try_minor,args.p_items[0].payment.fx_rate_try_minor);
 });
 await check('payment edit/delete only call atomic RPCs, reject RPC errors',async()=>{
  tables={obligations:[base],installments:[]};rpcCalls=[];
  const p={id:'p',obligation_id:'o',amount_minor:100,paid_at:'2026-10-09',fx_rate_try_minor:null};
  const input={amount_minor:100,paid_at:p.paid_at,account_id:'a',obligationDirection:'receivable',obligationTitle:'Fatura',obligationCurrencyCode:'TRY'};
  await payments.updatePayment(p,input);await payments.deletePayment(p);
  assert.deepEqual(rpcCalls.map(x=>x.name),['update_payment_atomic','delete_payment_atomic']);
  rpcError={message:'Injected RPC failure'};await assert.rejects(payments.updatePayment(p,input));rpcError=null;
 });
 await check('card payment only calls atomic RPC and preserves retry request ID',async()=>{
  rpcCalls=[];
  const input={actorId:'alice',requestId:'retry-key',workspaceId:'w',cardAccountId:'c',sourceAccountId:'a',amountMinor:1000000,currencyCode:'TRY',paidAt:'2026-10-09T12:00:00Z'};
  await payments.recordCardPayment(input);await payments.recordCardPayment(input);
  assert.deepEqual(rpcCalls.map(x=>x.name),['record_card_payment_owned','record_card_payment_owned']);
  assert.equal(rpcCalls[0].args.p_request_id,rpcCalls[1].args.p_request_id);
  rpcError={message:'Injected failure'};await assert.rejects(payments.recordCardPayment(input));rpcError=null;
 });
 let queue=load('features/payments/cardPaymentQueue.ts');
 const cardDraft={workspaceId:'w',cardAccountId:'durable-card',sourceAccountId:'a',amountMinor:1000000,currencyCode:'TRY',paidAt:'2026-10-09T12:00:00Z'};
 await check('lost card response survives module restart with original ID/payload',async()=>{
  rpcCalls=[];rpcError={message:'Response lost after possible commit'};
  await assert.rejects(queue.submitDurableCardPayment('alice',cardDraft));rpcError=null;
  const original=rpcCalls[0].args;
  modules.delete(path.join(root,'features/payments/cardPaymentQueue.ts'));queue=load('features/payments/cardPaymentQueue.ts');
  const recovered=await queue.loadStoredCardPayment('alice','w','durable-card');
  assert.equal(recovered.state,'pending');assert.equal(recovered.input.requestId,original.p_request_id);
  await queue.submitDurableCardPayment('alice',recovered.input);
  assert.deepEqual(rpcCalls[1].args,original);
  assert.equal((await queue.loadStoredCardPayment('alice','w','durable-card')).state,'confirmed');
 });
 await check('confirmed card receipt needs explicit acknowledgement before new payment',async()=>{
  const before=rpcCalls.length;await queue.submitDurableCardPayment('alice',cardDraft);assert.equal(rpcCalls.length,before);
  await assert.rejects(queue.submitDurableCardPayment('alice',{...cardDraft,amountMinor:500000}));
  await queue.acknowledgeCardPayment('alice','w','durable-card');
  await queue.submitDurableCardPayment('alice',cardDraft);
  assert.notEqual(rpcCalls.at(-1).args.p_request_id,rpcCalls[0].args.p_request_id);
 });
 await check('failed durable save prevents any card RPC',async()=>{
  const before=rpcCalls.length;storageFailOnWrite=storageWrites+1;
  await assert.rejects(queue.submitDurableCardPayment('alice',{...cardDraft,cardAccountId:'storage-fail'}));
  storageFailOnWrite=0;assert.equal(rpcCalls.length,before);
 });
 await check('invalid card draft is rejected before durable save or RPC',async()=>{
  const before=rpcCalls.length,writesBefore=storageWrites;
  await assert.rejects(queue.submitDurableCardPayment('alice',{...cardDraft,cardAccountId:'invalid-draft',sourceAccountId:''}));
  assert.equal(rpcCalls.length,before);assert.equal(storageWrites,writesBefore);
 });
 await check('confirmation storage failure retains original request for replay',async()=>{
  const draft={...cardDraft,cardAccountId:'confirmation-fail'};storageFailOnWrite=storageWrites+2;
  await assert.rejects(queue.submitDurableCardPayment('alice',draft));storageFailOnWrite=0;
  const id=rpcCalls.at(-1).args.p_request_id;
  assert.equal((await queue.loadStoredCardPayment('alice','w',draft.cardAccountId)).state,'pending');
  await queue.submitDurableCardPayment('alice',draft);assert.equal(rpcCalls.at(-1).args.p_request_id,id);
 });
 await check('pending card request cannot be changed or discarded',async()=>{
  const draft={...cardDraft,cardAccountId:'pending-lock'};rpcError={message:'Network failure'};
  await assert.rejects(queue.submitDurableCardPayment('alice',draft));rpcError=null;
  const before=rpcCalls.length;
  await assert.rejects(queue.submitDurableCardPayment('alice',{...draft,paidAt:'2026-10-10T12:00:00Z'}));
  await assert.rejects(queue.acknowledgeCardPayment('alice','w',draft.cardAccountId));
  assert.equal(rpcCalls.length,before);
 });
 await check('card recovery belongs to its user, never another user session',async()=>{
  authUserId='bob';const before=rpcCalls.length;
  await assert.rejects(queue.loadStoredCardPayment('alice','w','pending-lock'));
  await assert.rejects(queue.submitDurableCardPayment('alice',cardDraft));
  assert.equal(rpcCalls.length,before);assert.equal(await queue.loadStoredCardPayment('bob','w','pending-lock'),null);
  authUserId='alice';
 });
 await check('simultaneous local card submissions share a single request',async()=>{
  const draft={...cardDraft,cardAccountId:'concurrent-durable'};const before=rpcCalls.length;
  await Promise.all([queue.submitDurableCardPayment('alice',draft),queue.submitDurableCardPayment('alice',draft)]);
  assert.equal(rpcCalls.length,before+1);
 });
 await check('corrupt durable card data fails closed without RPC',async()=>{
  const key='vademde-card-payment-v1:alice:w:corrupt-card';storage.set(key,'{invalid');
  const before=rpcCalls.length;
  await assert.rejects(queue.submitDurableCardPayment('alice',{...cardDraft,cardAccountId:'corrupt-card'}));
  assert.equal(rpcCalls.length,before);
 });
 let offsets=load('features/payments/offsetQueue.ts');
 const offsetDraft={workspaceId:'w',counterpartyId:'cp',counterpartyName:'Cari',direction:'payable',currencyCode:'TRY',amountMinor:2000000,paidAt:'2026-10-09T12:00:00Z',method:'mahsup',
  targets:[{...base,id:'t1',direction:'payable',remaining_amount_minor:1000000},{...base,id:'t2',direction:'payable',remaining_amount_minor:2000000}],
  sources:[{...base,id:'s1',remaining_amount_minor:1500000},{...base,id:'s2',remaining_amount_minor:1000000}]};
 await check('offset uses one atomic RPC, equal-sided pairs and current-balance expectations',async()=>{
  rpcCalls=[];await payments.settleObligations({...offsetDraft,actorId:'alice',requestId:'offset-key'});
  assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'settle_offset_atomic');
  assert.deepEqual(rpcCalls[0].args.p_pairs,[{source_id:'s1',target_id:'t1',amount_minor:1000000},{source_id:'s1',target_id:'t2',amount_minor:500000},{source_id:'s2',target_id:'t2',amount_minor:500000}]);
  assert.equal(rpcCalls[0].args.p_expected.length,4);
  await assert.rejects(payments.settleObligations(offsetDraft));
 });
 await check('offset lost response survives module restart and uses original snapshots',async()=>{
  rpcError={message:'Response lost'};await assert.rejects(offsets.submitDurableOffset('alice',offsetDraft));rpcError=null;
  const original=rpcCalls.at(-1).args;
  modules.delete(path.join(root,'features/payments/offsetQueue.ts'));offsets=load('features/payments/offsetQueue.ts');
  const saved=await offsets.loadStoredOffset('alice','w');assert.equal(saved.state,'pending');
  await offsets.submitDurableOffset('alice',saved.input);assert.deepEqual(rpcCalls.at(-1).args,original);
 });
 await check('confirmed offset does not replay until explicit new-operation acknowledgement',async()=>{
  const before=rpcCalls.length;await offsets.submitDurableOffset('alice',offsetDraft);assert.equal(rpcCalls.length,before);
  await assert.rejects(offsets.submitDurableOffset('alice',{...offsetDraft,amountMinor:1000000}));
  const previous=(await offsets.loadStoredOffset('alice','w')).input.requestId;
  await offsets.acknowledgeOffset('alice','w');await offsets.submitDurableOffset('alice',offsetDraft);
  assert.notEqual((await offsets.loadStoredOffset('alice','w')).input.requestId,previous);
 });
 await check('offset durable-save failure prevents RPC; pending cannot be replaced or discarded',async()=>{
  const draft={...offsetDraft,workspaceId:'offset-save-fail'};const before=rpcCalls.length;
  storageFailOnWrite=storageWrites+1;await assert.rejects(offsets.submitDurableOffset('alice',draft));storageFailOnWrite=0;
  assert.equal(rpcCalls.length,before);
  rpcError={message:'Network error'};await assert.rejects(offsets.submitDurableOffset('alice',draft));rpcError=null;
  await assert.rejects(offsets.submitDurableOffset('alice',{...draft,paidAt:'2026-10-10T12:00:00Z'}));
  await assert.rejects(offsets.acknowledgeOffset('alice',draft.workspaceId));
 });
 await check('offset confirmation-save failure reuses ID, local concurrent submission writes once',async()=>{
  const draft={...offsetDraft,workspaceId:'offset-confirm-fail'};storageFailOnWrite=storageWrites+2;
  await assert.rejects(offsets.submitDurableOffset('alice',draft));storageFailOnWrite=0;
  const id=rpcCalls.at(-1).args.p_request_id;await offsets.submitDurableOffset('alice',draft);assert.equal(rpcCalls.at(-1).args.p_request_id,id);
  const before=rpcCalls.length;const concurrent={...offsetDraft,workspaceId:'offset-concurrent'};
  await Promise.all([offsets.submitDurableOffset('alice',concurrent),offsets.submitDurableOffset('alice',concurrent)]);
  assert.equal(rpcCalls.length,before+1);
 });
 await check('offset queue belongs to owner and corrupt records fail closed',async()=>{
  authUserId='bob';const before=rpcCalls.length;
  await assert.rejects(offsets.loadStoredOffset('alice','w'));await assert.rejects(offsets.submitDurableOffset('alice',offsetDraft));
  assert.equal(await offsets.loadStoredOffset('bob','w'),null);authUserId='alice';
  storage.set('vademde-offset-v1:alice:offset-corrupt','{bad');
  await assert.rejects(offsets.submitDurableOffset('alice',{...offsetDraft,workspaceId:'offset-corrupt'}));
  assert.equal(rpcCalls.length,before);
 });
 await check('linked offset/instrument closures cannot be edited or deleted as standalone payments',async()=>{
  const before=rpcCalls.length;
  await assert.rejects(payments.deletePayment({id:'linked',settled_by_obligation_id:'other'}));
  await assert.rejects(payments.updatePayment({id:'linked',settled_by_obligation_id:'other'},{}));
  assert.equal(rpcCalls.length,before);
 });
 await check('uncommitted offset cancellation persists a terminal state before acknowledgement',async()=>{
  const draft={...offsetDraft,workspaceId:'offset-cancel'};rpcError={message:'Unknown outcome'};
  await assert.rejects(offsets.submitDurableOffset('alice',draft));rpcError=null;
  const cancelled=await offsets.cancelStoredOffset('alice',draft.workspaceId);assert.equal(cancelled.state,'cancelled');
  const before=rpcCalls.length;await assert.rejects(offsets.submitDurableOffset('alice',draft));assert.equal(rpcCalls.length,before);
  await offsets.acknowledgeOffset('alice',draft.workspaceId);assert.equal(await offsets.loadStoredOffset('alice',draft.workspaceId),null);
 });
 await check('cancelled response storage failure preserves pending ID for safe retry',async()=>{
  const draft={...offsetDraft,workspaceId:'offset-cancel-save'};rpcError={message:'Unknown outcome'};
  await assert.rejects(offsets.submitDurableOffset('alice',draft));rpcError=null;
  const original=(await offsets.loadStoredOffset('alice',draft.workspaceId)).input.requestId;
  storageFailOnWrite=storageWrites+1;await assert.rejects(offsets.cancelStoredOffset('alice',draft.workspaceId));storageFailOnWrite=0;
  assert.equal((await offsets.loadStoredOffset('alice',draft.workspaceId)).state,'pending');
  await offsets.cancelStoredOffset('alice',draft.workspaceId);assert.equal(rpcCalls.at(-1).args.p_request_id,original);
 });
 await check('cancelling an already committed offset recovers receipt, never reverses it',async()=>{
  const draft={...offsetDraft,workspaceId:'offset-already-done'};rpcError={message:'Lost success'};
  await assert.rejects(offsets.submitDurableOffset('alice',draft));rpcError=null;cancelState='confirmed';
  const recovered=await offsets.cancelStoredOffset('alice',draft.workspaceId);cancelState='cancelled';
  assert.equal(recovered.state,'confirmed');assert.equal(recovered.result.allocations.length,2);
  assert.equal(rpcCalls.at(-1).name,'settle_offset_atomic');
 });
 await check('confirmed offset reversal uses original owner/request and blocks resubmission',async()=>{
  const draft={...offsetDraft,workspaceId:'offset-reverse'};await offsets.submitDurableOffset('alice',draft);
  const original=(await offsets.loadStoredOffset('alice',draft.workspaceId)).input.requestId;
  await offsets.reverseStoredOffset('alice',draft.workspaceId);
  assert.equal(rpcCalls.at(-1).name,'reverse_offset_atomic');assert.equal(rpcCalls.at(-1).args.p_request_id,original);
  assert.equal(rpcCalls.at(-1).args.p_expected_actor,'alice');assert.equal((await offsets.loadStoredOffset('alice',draft.workspaceId)).state,'reversed');
  const before=rpcCalls.length;await assert.rejects(offsets.submitDurableOffset('alice',draft));assert.equal(rpcCalls.length,before);
  await offsets.acknowledgeOffset('alice',draft.workspaceId);
 });
 await check('reversal intent save failure prevents financial RPC',async()=>{
  const draft={...offsetDraft,workspaceId:'reverse-intent-fail'};await offsets.submitDurableOffset('alice',draft);
  const before=rpcCalls.length;storageFailOnWrite=storageWrites+1;
  await assert.rejects(offsets.reverseStoredOffset('alice',draft.workspaceId));storageFailOnWrite=0;
  assert.equal(rpcCalls.length,before);assert.equal((await offsets.loadStoredOffset('alice',draft.workspaceId)).state,'confirmed');
 });
 await check('lost reversal response survives restart; acknowledgement and resubmission blocked',async()=>{
  const draft={...offsetDraft,workspaceId:'reverse-response-lost'};await offsets.submitDurableOffset('alice',draft);
  rpcError={message:'Lost reversal response'};await assert.rejects(offsets.reverseStoredOffset('alice',draft.workspaceId));rpcError=null;
  const original=rpcCalls.at(-1).args;
  modules.delete(path.join(root,'features/payments/offsetQueue.ts'));offsets=load('features/payments/offsetQueue.ts');
  assert.equal((await offsets.loadStoredOffset('alice',draft.workspaceId)).state,'reversing');
  await assert.rejects(offsets.acknowledgeOffset('alice',draft.workspaceId));await assert.rejects(offsets.submitDurableOffset('alice',draft));
  await offsets.reverseStoredOffset('alice',draft.workspaceId);assert.deepEqual(rpcCalls.at(-1).args,original);
 });
 await check('final reversal-save failure retains durable reversing state',async()=>{
  const draft={...offsetDraft,workspaceId:'reverse-final-save-fail'};await offsets.submitDurableOffset('alice',draft);
  storageFailOnWrite=storageWrites+2;await assert.rejects(offsets.reverseStoredOffset('alice',draft.workspaceId));storageFailOnWrite=0;
  const id=rpcCalls.at(-1).args.p_request_id;assert.equal((await offsets.loadStoredOffset('alice',draft.workspaceId)).state,'reversing');
  await offsets.reverseStoredOffset('alice',draft.workspaceId);assert.equal(rpcCalls.at(-1).args.p_request_id,id);
 });
 await check('reversal requires confirmed outcome and original owner',async()=>{
  const draft={...offsetDraft,workspaceId:'reverse-no-confirm'};rpcError={message:'Unknown offset result'};
  await assert.rejects(offsets.submitDurableOffset('alice',draft));rpcError=null;const before=rpcCalls.length;
  await assert.rejects(offsets.reverseStoredOffset('alice',draft.workspaceId));authUserId='bob';
  await assert.rejects(offsets.reverseStoredOffset('alice','w'));authUserId='alice';assert.equal(rpcCalls.length,before);
 });
 await check('two local reversal attempts call server only once',async()=>{
  const draft={...offsetDraft,workspaceId:'reverse-concurrent'};await offsets.submitDurableOffset('alice',draft);const before=rpcCalls.length;
  await Promise.all([offsets.reverseStoredOffset('alice',draft.workspaceId),offsets.reverseStoredOffset('alice',draft.workspaceId)]);
  assert.equal(rpcCalls.length,before+1);
 });
 await check('malformed reversal response cannot unlock a new operation',async()=>{
  const draft={...offsetDraft,workspaceId:'reverse-malformed'};await offsets.submitDurableOffset('alice',draft);reverseState='unknown';
  await assert.rejects(offsets.reverseStoredOffset('alice',draft.workspaceId));reverseState='reversed';
  assert.equal((await offsets.loadStoredOffset('alice',draft.workspaceId)).state,'reversing');
  await assert.rejects(offsets.acknowledgeOffset('alice',draft.workspaceId));
 });
 await check('cache switch does not touch financial rows; same user retains cache',async()=>{
  const pendingBefore=JSON.stringify([...storage].filter(([key])=>key.startsWith('vademde-card-payment-v1:')||key.startsWith('vademde-offset-v1:')||key.startsWith('vademde-cash-settlement-v1:')));
  await cache.bindQueryCacheToUser('alice');cache.queryClient.setQueryData(['profile'],{name:'Alice'});
  const removals=storageRemovals;await cache.bindQueryCacheToUser('alice');assert.equal(storageRemovals,removals);assert.equal(cache.queryClient.getQueryData(['profile']).name,'Alice');
  const before=JSON.stringify(tables);await cache.bindQueryCacheToUser('bob');assert.equal(cache.queryClient.getQueryData(['profile']),undefined);assert.equal(JSON.stringify(tables),before);
  assert.equal(JSON.stringify([...storage].filter(([key])=>key.startsWith('vademde-card-payment-v1:')||key.startsWith('vademde-offset-v1:')||key.startsWith('vademde-cash-settlement-v1:'))),pendingBefore);
 });
 await check('logout/account switch is blocked while a financial write is pending',async()=>{
  const m=cache.queryClient.getMutationCache().build(cache.queryClient,{});m.state.status='pending';
  assert.throws(()=>cache.assertNoPendingFinancialWrites());
  await assert.rejects(cache.bindQueryCacheToUser('charlie'));
  assert.equal(m.state.status,'pending');
  m.state.status='success';cache.assertNoPendingFinancialWrites();
 });
 await check('loan principal is excluded from profit/loss',()=>assert.equal(reports.profitAndLossMinor({amount_minor:1000000,financing_minor:800000}),200000));
 console.log(`${passed} regression checks passed. No live database writes.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
