const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function environment(tables, userId = 'u-en') {
  const writes = [], pushes = [], prompts = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.one = false; }
    select() { return this; }
    eq(key,value) { this.filters.push((r)=>r[key]===value); return this; }
    neq(key,value) { this.filters.push((r)=>r[key]!==value); return this; }
    in(key,values) { this.filters.push((r)=>values.includes(r[key])); return this; }
    is(key,value) { this.filters.push((r)=>(r[key]??null)===value); return this; }
    not() { return this; }
    gt(key,value) { this.filters.push((r)=>r[key]>value); return this; }
    gte() { return this; } lte() { return this; } or() { return this; }
    order() { return this; } limit() { return this; } range() { return this; }
    single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
    insert(rows) { writes.push({ table:this.table, rows:Array.isArray(rows)?rows:[rows] }); return this; }
    update(data) { writes.push({ table:this.table, update:data }); return this; }
    delete() { return this; }
    then(resolve,reject) {
      const rows=(tables[this.table]??[]).filter((r)=>this.filters.every((f)=>f(r)));
      return Promise.resolve({data:this.one?rows[0]??null:rows,error:null}).then(resolve,reject);
    }
  }
  const db={from:(table)=>new Query(table),auth:{getUser:async()=>({data:{user:userId?{id:userId}:null}})}};
  const cache=new Map();
  let handler;
  function load(relative) {
    const file=path.resolve(root,relative);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const source=fs.readFileSync(file,'utf8');
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const req=(id)=>id==='jsr:@supabase/supabase-js@2'?{createClient:()=>db}:id.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),id))):require(id);
    const fetch=async(url,options)=>{
      if(url.startsWith('https://exp.host/')){const batch=JSON.parse(options.body);pushes.push(...batch);return Response.json({data:batch.map(()=>({status:'ok'}))});}
      const body=JSON.parse(options.body);prompts.push(body.contents[0].parts[0].text);
      // Force deterministic insight fallback; ask endpoint gets a known English answer.
      if(relative.includes('generate-insights'))return new Response('',{status:503});
      return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({answer:'Your recorded expenses are shown above.',period:'this_month'})}]}}]});
    };
    new Function('require','module','exports','Deno','fetch',output)(req,module,module.exports,
      {env:{get:()=> 'test-value'},serve:(fn)=>{handler=fn;}},fetch);
    return module.exports;
  }
  return {load,handle:(...args)=>handler(...args),writes,pushes,prompts};
}

async function main() {
  // Type-check all edited Deno functions against the installed Supabase JS definitions.
  const entrypoints=['send-reminders','send-cash-alerts','ai-ask','generate-insights','process-document'].map((name)=>path.join(root,`supabase/functions/${name}/index.ts`));
  const virtual=path.join(root,'tests/__i18n_edge_environment.d.ts');
  const declaration="declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => unknown): void }; declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void }; declare module 'jsr:@supabase/supabase-js@2' { export const createClient: typeof import('@supabase/supabase-js').createClient; }";
  const options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:[],lib:['lib.es2023.d.ts','lib.dom.d.ts']};
  const host=ts.createCompilerHost(options),originalRead=host.readFile,originalExists=host.fileExists,originalSource=host.getSourceFile;
  const isVirtual=(file)=>path.resolve(file).toLowerCase()===virtual.toLowerCase();
  host.readFile=(file)=>isVirtual(file)?declaration:originalRead(file);
  host.fileExists=(file)=>isVirtual(file)||originalExists(file);
  host.getSourceFile=(file,version,...args)=>isVirtual(file)?ts.createSourceFile(file,declaration,version,true):originalSource(file,version,...args);
  const program=ts.createProgram([...entrypoints,virtual],options,host);
  const errors=ts.getPreEmitDiagnostics(program);
  if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:(f)=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));

  const base={profiles:[{id:'u-en',locale:'en'},{id:'u-tr',locale:'tr'}],workspace_members:[{id:'me',workspace_id:'w',user_id:'u-en'},{id:'mt',workspace_id:'w',user_id:'u-tr'}],push_tokens:[{user_id:'u-en',token:'en-token'},{user_id:'u-tr',token:'tr-token'}]};
  const reminder={id:'r',workspace_id:'w',kind:'obligation_due',stage:'3_days_before',obligation_id:'o',status:'scheduled',remind_at:new Date().toISOString(),dismissed_at:null,account:null,
    obligation:{id:'o',title:'User title',direction:'payable',status:'bekliyor',remaining_amount_minor:500000,currency_code:'TRY',document_type:'kredi',bank_code:null,service_code:null,counterparty:null}};
  const env=environment({...base,reminders:[reminder],installments:[{obligation_id:'o',due_date:'2026-11-01',remaining_amount_minor:123456,status:'bekliyor'}]});
  env.load('supabase/functions/send-reminders/index.ts');
  await env.handle(new Request('http://local'));
  assert.equal(env.pushes.length,2);
  assert.equal(env.pushes.find((p)=>p.to==='en-token').body,'User title · Loan Payment of 1,234.56 TL · In 3 Days');
  assert.equal(env.pushes.find((p)=>p.to==='tr-token').body,'User title 1.234,56 TL Tutarındaki Kredi Ödemeniz 3 Gün Sonra');
  const content=env.load('supabase/functions/_shared/reminderContent.ts');
  const serverMessages=env.load('supabase/functions/_shared/reminderMessages.ts');
  for (const language of ['tr','en']) {
    for (const namespace of ['reminderMessages','notifications']) {
      assert.deepEqual(serverMessages[language+namespace],env.load(`i18n/locales/${language}/${namespace}.ts`)[namespace]);
    }
  }
  assert.equal(content.contentFor({...reminder,kind:'card_payment_due',account:{id:'card',name:'My Card'}},undefined,'en').title,'Credit card payment due');
  assert.equal(content.contentFor({...reminder,kind:'statement_upload',account:{id:'card',name:'My Card'}},undefined,'tr').title,'Ekstre yüklemeyi unutmayın');
  const cash=env.load('supabase/functions/_shared/cashAlertContent.ts');
  assert.ok(cash.cashAlertContent('en',null,'2026-11-01',-50000).body.includes('total TRY balance'));
  assert.ok(cash.cashAlertContent('tr','Kasa','2026-11-01',-50000).body.includes('Kasa 1 Kasım'));
  const variants=env.load('supabase/functions/_shared/categoryNames.ts');
  assert.deepEqual(variants.categoryNameVariants('Market'),['Market','Market','Groceries']);
  assert.ok(variants.categoryNameVariants('Groceries').includes('Market'));
  assert.deepEqual(variants.categoryNameVariants('Custom name'),['Custom name']);

  const ai=environment({...base,subscriptions:[{plan:'plus'}],transactions:[]});
  ai.load('supabase/functions/ai-ask/index.ts');
  const answer=await ai.handle(new Request('http://local',{method:'POST',headers:{Authorization:'test'},body:JSON.stringify({workspaceId:'w',question:'How much?'})}));
  assert.equal(answer.status,200);
  assert.ok(ai.prompts[0].includes('kısa ve sade İngilizce'));
  assert.match((await answer.json()).source.from,/[A-Za-z]+/);

  const data={...base,subscriptions:[{plan:'plus'}],obligations:[
    {id:'s1',workspace_id:'w',document_type:'abonelik',status:'bekliyor',currency_code:'TRY',category_id:'cat',title:'Alpha',category:{name:'Video'}},
    {id:'s2',workspace_id:'w',document_type:'abonelik',status:'bekliyor',currency_code:'TRY',category_id:'cat',title:'Beta',category:{name:'Video'}}],
    installments:[{obligation_id:'s1',amount_minor:10000,remaining_amount_minor:10000},{obligation_id:'s2',amount_minor:20000,remaining_amount_minor:20000}],accounts:[],transactions:[],ai_insights:[]};
  const insights=environment(data);
  insights.load('supabase/functions/generate-insights/index.ts');
  await insights.handle(new Request('http://local',{method:'POST',headers:{Authorization:'test'},body:JSON.stringify({workspaceId:'w'})}));
  const generated=insights.writes.find((w)=>w.table==='ai_insights').rows[0];
  assert.equal(generated.locale,'en');
  assert.equal(generated.title,'You have 2 subscriptions in Video');
  assert.ok(generated.body.includes('Alpha and Beta'));
  assert.ok(generated.source.key.endsWith(':en'));
  assert.ok(insights.prompts[0].includes('İngilizce'));
  const denied=environment({...data,workspace_members:[]});
  denied.load('supabase/functions/generate-insights/index.ts');
  assert.equal((await denied.handle(new Request('http://local',{method:'POST',headers:{Authorization:'test'},body:JSON.stringify({workspaceId:'w'})}))).status,403);
  assert.equal(denied.writes.length,0);
  console.log('PASS server locale: five Edge Function typechecks, per-recipient push, AI language/fallback, membership gate and OCR category aliases. No network requests.');
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
