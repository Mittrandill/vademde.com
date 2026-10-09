/* global __dirname */
// Actual TS API/queue + restored PostgreSQL Auth/RLS. AsyncStorage/network are fault-injected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
const database = process.env.FINANCE_STAGE_DATABASE || 'vademde_release_stage_2';
assert(['vademde_release_stage','vademde_release_stage_2','vademde_release_stage_3'].includes(database));
const actor=randomUUID(),workspace=randomUUID(),customer=randomUUID(),supplier=randomUUID(),cheque=randomUUID(),note=randomUUID(),invoice=randomUUID(),future=randomUUID();
let sessionUser=actor,loseNextResponse=false,rpcCount=0;
const quote=(value)=>`'${String(value).replaceAll("'","''")}'`;
function sql(query,authenticated=false) {
  const input=authenticated?`begin;set local role authenticated;set local request.jwt.claim.sub=${quote(actor)};${query};commit;`:query;
  const result=spawnSync('/usr/local/Cellar/postgresql@17/17.11/bin/psql',[
    '-X','-q','-A','-t','-h',process.env.FINANCE_STAGE_SOCKET||'/private/tmp/vademde-release-stage.lNhe2a',
    '-p',process.env.FINANCE_STAGE_PORT||'55440','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-f','-',
  ],{input,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
  return result.stdout.trim();
}
const stored=new Map();
const storage={getItem:async key=>stored.get(key)??null,setItem:async(key,value)=>stored.set(key,value),removeItem:async key=>stored.delete(key)};
const supabase={auth:{getSession:async()=>({data:{session:{user:{id:sessionUser}}},error:null})},from:()=>{throw new Error('Unexpected client-side financial query');},rpc:async(name,args)=>{
  rpcCount++;
  const orders={
    settle_endorsement_atomic:['p_expected_actor','p_request_id','p_workspace_id','p_counterparty_id','p_currency_code','p_paid_at','p_fx_rate_try_minor','p_sources','p_targets'],
    settle_offset_atomic:['p_expected_actor','p_request_id','p_workspace_id','p_counterparty_id','p_direction','p_currency_code','p_amount_minor','p_paid_at','p_fx_rate_try_minor','p_pairs','p_expected'],
    reverse_offset_atomic:['p_expected_actor','p_workspace_id','p_request_id'],
    preview_instrument_bounce:['p_obligation_id'],bounce_instrument_atomic:['p_expected_actor','p_obligation_id','p_expected'],
  };
  assert(orders[name],name);
  const literals=orders[name].map(key=>args[key]==null?'null':typeof args[key]==='object'?`${quote(JSON.stringify(args[key]))}::jsonb`:typeof args[key]==='number'?String(args[key]):quote(args[key]));
  const data=JSON.parse(sql(`select public.${name}(${literals.join(',')})`,true));
  if(loseNextResponse){loseNextResponse=false;throw new Error('Lost response AFTER PostgreSQL commit');}
  return {data,error:null};
}};
const modules=new Map();
function load(relative) {
  const filename=path.join(root,relative);if(modules.has(filename))return modules.get(filename).exports;
  const module={exports:{}};modules.set(filename,module);
  const requireModule=(name)=>{
    if(name==='@/services/supabase')return {supabase};
    if(name==='expo-crypto')return {randomUUID};
    if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
    if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),name))+'.ts');
    return require(name);
  };
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(requireModule,module,module.exports);
  return module.exports;
}
(async()=>{
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values(${quote(actor)},${quote(actor+'@example.invalid')},'{}');
    set local request.jwt.claim.sub=${quote(actor)};set local role authenticated;
    insert into public.workspaces(id,name,owner_id) values(${quote(workspace)},'Client integration',${quote(actor)});
    insert into public.counterparties(id,workspace_id,name) values(${quote(customer)},${quote(workspace)},'Customer'),(${quote(supplier)},${quote(workspace)},'Supplier');
    insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values
    (${quote(cheque)},${quote(workspace)},${quote(customer)},'First cheque','receivable','cek',3000000),
    (${quote(note)},${quote(workspace)},${quote(customer)},'Second note','receivable','senet',5000000),
    (${quote(invoice)},${quote(workspace)},${quote(supplier)},'Supplier invoice','payable','fatura',2000000),
    (${quote(future)},${quote(workspace)},${quote(supplier)},'Future invoice','payable','fatura',500000);commit;`);
  const row=(id)=>JSON.parse(sql(`select to_jsonb(o) from public.obligations o where id=${quote(id)}`,true));
  let queue=load('features/payments/offsetQueue.ts');
  const draft={workspaceId:workspace,counterpartyId:supplier,direction:'payable',currencyCode:'TRY',amountMinor:8000000,paidAt:'2026-10-09T12:00:00Z',method:'ciro',sources:[row(cheque),row(note)],targets:[row(invoice)]};
  loseNextResponse=true;await assert.rejects(queue.submitDurableOffset(actor,draft));
  const pending=await queue.loadStoredOffset(actor,workspace);assert.equal(pending.state,'pending');
  assert.equal(row(invoice).remaining_amount_minor,0);
  modules.delete(path.join(root,'features/payments/offsetQueue.ts'));queue=load('features/payments/offsetQueue.ts');
  const result=await queue.submitDurableOffset(actor,pending.input);
  assert.equal(result.advanceObligations.length,2);assert.equal(result.leftoverMinor,6000000);
  assert.equal((await queue.loadStoredOffset(actor,workspace)).input.requestId,pending.input.requestId);
  assert.equal(Number(sql(`select count(*) from public.payments where workspace_id=${quote(workspace)}`)),4);
  const before=rpcCount;await queue.submitDurableOffset(actor,draft);assert.equal(rpcCount,before);
  console.log('PASS actual TS/queue/restored PostgreSQL: committed ciro response loss, restart, original ID, two source advances, no duplicate closures');
  await queue.acknowledgeOffset(actor,workspace);
  const advance=result.advanceObligations.find(o=>o.parent_obligation_id===cheque);
  await queue.submitDurableOffset(actor,{workspaceId:workspace,counterpartyId:supplier,direction:'payable',currencyCode:'TRY',amountMinor:500000,paidAt:'2026-10-10T12:00:00Z',method:'mahsup',sources:[row(advance.id)],targets:[row(future)]});
  const instruments=load('features/instruments/api.ts');
  const preview=await instruments.previewInstrumentBounce(cheque);
  loseNextResponse=true;await assert.rejects(instruments.markBounced(cheque,preview));
  const bounced=await instruments.markBounced(cheque,preview);
  assert.equal(bounced.state,'bounced');assert.equal(row(cheque).status,'iptal_edildi');assert.equal(row(advance.id).status,'iptal_edildi');
  assert.equal(row(invoice).remaining_amount_minor,2000000);assert.equal(row(future).remaining_amount_minor,500000);
  assert.equal(row(note).instrument_status,'ciro_edildi');assert.equal(Number(sql(`select count(*) from public.transactions where workspace_id=${quote(workspace)}`)),0);
  assert.equal(Number(sql(`select count(*) from finance_private.instrument_bounces where workspace_id=${quote(workspace)}`)),1);
  const claims=Number(sql(`select count(*) from public.obligations where workspace_id=${quote(workspace)} and document_type='musteri_alacagi'`));assert.equal(claims,1);
  console.log('PASS actual TS/REST-shaped RPC/restored PostgreSQL: bounce response loss returns original receipt, only its source reopened, standalone claim preserved once');
  await queue.reverseStoredOffset(actor,workspace);assert.equal((await queue.loadStoredOffset(actor,workspace)).state,'reversed');
  assert.equal(row(advance.id).status,'iptal_edildi');assert.equal(row(future).remaining_amount_minor,500000);
  console.log('PASS actual TS/queue/restored PostgreSQL: offset already unwound by bounce safely acknowledges reversal without resurrecting advance');
})().catch(error=>{console.error(error);process.exitCode=1;});
