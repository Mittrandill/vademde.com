const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');

(async()=>{
  let language='tr',userId='alice',hydrated=true,finishHydration,releaseFirst,firstEntered;
  let delayFirst=true,failNext=false;
  const entered=new Promise((resolve)=>{firstEntered=resolve;});
  const writes=[];
  const supabase={auth:{getSession:async()=>({data:{session:userId?{user:{id:userId}}:null},error:null})},from:(table)=>{
    const request={table};
    const query={update:(data)=>{request.data=data;return query;},eq:(key,value)=>{request[key]=value;return query;},select:()=>query,
      single:async()=>{writes.push(request);if(delayFirst){delayFirst=false;firstEntered();await new Promise((resolve)=>{releaseFirst=resolve;});}const failed=failNext;failNext=false;return {data:{id:request.id},error:failed?new Error('offline'):null};}};
    return query;
  }};
  const module={exports:{}};
  const source=fs.readFileSync(path.join(root,'services/profileLocale.ts'),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const requireMock=(id)=>{
    if(id==='@/services/supabase')return {supabase};
    if(id==='@/i18n')return {getLanguage:()=>language};
    if(id==='@/store/languagePreferenceStore')return {useLanguagePreferenceStore:{persist:{hasHydrated:()=>hydrated,onFinishHydration:(fn)=>{finishHydration=fn;return ()=>{};}}}};
    throw Error(id);
  };
  new Function('require','module','exports',output)(requireMock,module,module.exports);
  const {syncProfileLocale,syncCurrentProfileLocale}=module.exports;
  const first=syncProfileLocale('alice','tr');await entered;
  language='en';const second=syncProfileLocale('alice','en');
  assert.equal(writes.length,1);releaseFirst();await Promise.all([first,second]);
  assert.deepEqual(writes.map((r)=>r.data.locale),['tr','en']);
  await syncProfileLocale('alice','tr');assert.equal(writes.length,2,'stale language callbacks are skipped');
  userId='bob';await syncProfileLocale('alice','en');assert.equal(writes.length,2,'session switch cannot write the old profile');
  failNext=true;await assert.rejects(syncProfileLocale('bob','en'),/offline/);
  await syncProfileLocale('bob','en');assert.equal(writes.at(-1).id,'bob','a failed request does not poison later retries');
  hydrated=false;const waiting=syncCurrentProfileLocale();const before=writes.length;
  await Promise.resolve();assert.equal(writes.length,before);
  language='tr';hydrated=true;finishHydration();await waiting;
  assert.deepEqual(writes.at(-1).data,{locale:'tr'},'onboarding waits for the persisted preference');
  userId=null;const count=writes.length;await syncCurrentProfileLocale();assert.equal(writes.length,count);
  console.log('PASS profile locale: serial writes, stale language, user switch, retry after failure, hydration and signed-out session.');
})().catch((error)=>{console.error(error);process.exitCode=1;});
