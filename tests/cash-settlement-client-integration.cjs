/* global __dirname */
// Real TS API/queue + real local PostgreSQL. Storage/auth are reduced mocks, NOT device/Supabase.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),modules=new Map(),storage=new Map();
const actor='00000000-0000-0000-0000-000000000020',ws='00000000-0000-0000-0000-000000000010',cp='00000000-0000-0000-0000-000000000040';
let loseResponse=false,rpcCalls=0;
const quote=x=>x==null?'NULL':`'${String(x).replaceAll("'","''")}'`;
function sql(query){
 const r=spawnSync('/usr/local/Cellar/postgresql@17/17.11/bin/psql',['-h','/private/tmp/vademde-pg-tests.6JZ7Fw','-p','55439','-d','vademde_finance_test','-v','ON_ERROR_STOP=1','-qAt','-c',query],{encoding:'utf8',timeout:20000});
 if(r.error||r.status!==0)throw Error(r.error?.message||r.stderr);return r.stdout.trim();
}
const session="SET ROLE authenticated; SET test.editor='true'; ";
class Query{
 constructor(table){if(!/^[a-z_]+$/.test(table))throw Error('Bad fixture table');this.table=table;this.filters=[];this.orders=[];}
 select(){return this;}eq(k,v){this.filters.push(`${k}=${quote(v)}`);return this;}
 neq(k,v){this.filters.push(`${k}<>${quote(v)}`);return this;}gt(k,v){this.filters.push(`${k}>${quote(v)}`);return this;}
 order(k){this.orders.push(k);return this;}single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{
  const rows=JSON.parse(sql(session+`SELECT coalesce(jsonb_agg(r),'[]') FROM (SELECT * FROM public.${this.table}${this.filters.length?' WHERE '+this.filters.join(' AND '):''}${this.orders.length?' ORDER BY '+this.orders.join(','):''}) r;`));
  return {data:this.one?rows[0]??null:rows,error:null};
 }).then(resolve,reject);}
}
const supabase={auth:{getSession:async()=>({data:{session:{user:{id:actor}}},error:null})},from:t=>new Query(t),rpc:async(name,args)=>{
 rpcCalls++;
 try{
  let query;
  if(name==='settle_cash_atomic')query=`SELECT public.settle_cash_atomic(${quote(args.p_expected_actor)},${quote(args.p_request_id)},${quote(args.p_workspace_id)},${quote(JSON.stringify(args.p_header))}::jsonb,${quote(JSON.stringify(args.p_items))}::jsonb,${quote(JSON.stringify(args.p_expected))}::jsonb);`;
  else if(name==='cancel_cash_settlement_request')query=`SELECT public.cancel_cash_settlement_request(${quote(args.p_expected_actor)},${quote(args.p_workspace_id)},${quote(args.p_request_id)});`;
  else throw Error('Unexpected RPC '+name);
  const data=JSON.parse(sql(session+query));
  if(loseResponse){loseResponse=false;throw Error('Injected lost response AFTER real commit');}
  return {data,error:null};
 }catch(error){return {data:null,error};}
}};
function load(relative){
 const filename=path.join(root,relative);if(modules.has(filename))return modules.get(filename).exports;
 const module={exports:{}};modules.set(filename,module);
 const requireLocal=name=>{
  if(name==='@/services/supabase')return {supabase};
  if(name==='expo-crypto')return {randomUUID};
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),name))+'.ts');
  return require(name);
 };
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(requireLocal,module,module.exports);return module.exports;
}
(async()=>{
 assert.equal(sql('SELECT current_database();'),'vademde_finance_test');
 let queue=load('features/payments/cashSettlementQueue.ts');
 for(const [direction,unit,invoice] of [['payable','USD',true],['receivable','TRY',true],['receivable','TRY',false]]){
  const targetId=randomUUID(),total=unit==='USD'?20000:2000000,account=unit==='USD'?'00000000-0000-0000-0000-000000000002':'00000000-0000-0000-0000-000000000001';
  let targets=[];
  if(invoice){
   sql(`INSERT INTO public.obligations(id,workspace_id,counterparty_id,title,document_type,direction,currency_code,total_amount_minor) VALUES(${quote(targetId)},${quote(ws)},${quote(cp)},'Client fixture','fatura',${quote(direction)},${quote(unit)},${total});
    INSERT INTO public.installments(id,workspace_id,obligation_id,amount_minor,remaining_amount_minor,status,due_date,installment_number) VALUES
    (${quote(randomUUID())},${quote(ws)},${quote(targetId)},${total/2},${total/2},'bekliyor','2026-10-01',1),
    (${quote(randomUUID())},${quote(ws)},${quote(targetId)},${total/2},${total/2},'bekliyor','2026-11-01',2);`);
   targets=[JSON.parse(sql(`SELECT to_jsonb(o) FROM public.obligations o WHERE id=${quote(targetId)};`))];
  }
  const draft={workspaceId:ws,counterpartyId:cp,counterpartyName:'Fixture',direction,currencyCode:unit,amountMinor:total*3/2,paidAt:'2026-10-09T12:00:00Z',fxRateTryMinor:unit==='USD'?4000:null,method:'havale',accountId:account,targets};
  loseResponse=true;await assert.rejects(queue.submitDurableCashSettlement(actor,draft));
  const saved=await queue.loadStoredCashSettlement(actor,ws);assert.equal(saved.state,'pending');
  const id=saved.input.requestId;modules.delete(path.join(root,'features/payments/cashSettlementQueue.ts'));queue=load('features/payments/cashSettlementQueue.ts');
  const result=await queue.submitDurableCashSettlement(actor,saved.input);
  assert.equal(result.leftoverMinor,invoice?total/2:total*3/2);
  assert.equal((await queue.loadStoredCashSettlement(actor,ws)).input.requestId,id);
  const count=sql(`SELECT count(*) FROM public.transactions WHERE id IN (${result.transactionIds.map(quote).join(',')});`);
  assert.equal(Number(count),invoice?3:1);
  if(invoice)assert.equal(sql(`SELECT remaining_amount_minor FROM public.obligations WHERE id=${quote(targetId)};`),'0');
  const before=rpcCalls;await queue.submitDurableCashSettlement(actor,draft);assert.equal(rpcCalls,before);
  await queue.acknowledgeCashSettlement(actor,ws);
  console.log(`PASS real TS/queue/PostgreSQL ${direction} ${unit} invoice=${invoice}: lost committed response, original slices, single money movement set`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
