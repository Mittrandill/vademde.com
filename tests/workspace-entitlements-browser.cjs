// Start the web app on 5177 and Expo web on 8085; all backend requests use synthetic fixtures.
const {chromium}=require(process.env.WORKSPACE_PLAYWRIGHT_MODULE || '/private/tmp/vademde-assets-tools/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..'),out=root+'/output/workspace-entitlements';fs.mkdirSync(out,{recursive:true});
const env=fs.readFileSync(root+'/.env.local','utf8');const backend=new URL(env.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]);
const user='00000000-0000-0000-0000-000000000002',owner='00000000-0000-0000-0000-000000000001';
const ws=['00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103'];
const now=new Date().toISOString();let errors=[];
async function context(browser,mobile){
 const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'tr-TR'});
 await c.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==backend.origin){if(url.hostname.endsWith('supabase.co'))return route.abort();return route.continue();}
  const name=url.pathname.split('/').pop();const single=req.headers().accept?.includes('vnd.pgrst.object');let data=[];
  const scopes=[{id:ws[0],name:'Test İşletmesi',owner_id:owner,type:'business'},{id:ws[1],name:'Kişisel',owner_id:user,type:'personal'},{id:ws[2],name:'Aile',owner_id:owner,type:'personal'}];
  if(url.pathname.includes('/auth/v1/user'))data={id:user,email:'demo@example.test',aud:'authenticated',role:'authenticated'};
  else if(name==='workspaces')data=scopes.map(w=>({...w,created_at:now,archived_at:null,default_value_unit_code:'TRY'}));
  else if(name==='workspace_members')data=[{id:'member',user_id:user,workspace_id:ws[0],role:'editor'}];
  else if(name==='profiles')data=[{id:user,full_name:'Demo Kullanıcı',locale:'tr',created_at:now}];
  else if(name==='get_workspace_entitlements'){
   const scope=req.postDataJSON()?.p_workspace_id;const free=!scope||scope===ws[1];
   data={workspaceId:scope||null,plan:free?'free':'isletme',inherited:!free,quota:free?5:500,usedCount:free?1:127,remaining:free?4:373,readOnly:false,periodMonth:'2026-11-01',limits:{plan:free?'free':'isletme',monthly_ocr_quota:free?5:500,document_archive:!free,face_id:!free,advanced_reports:!free,unlimited_export:!free,max_personal_workspaces:free?1:10,max_team_members:free?null:50}};
  }else if(name==='sync_plan_enforcement')data=[{plan:'free',workspace_count:1,workspace_limit:1,over_limit:false,locked:false,primary_workspace_id:ws[1],team_member_limit:null}];
  else if(name==='accounts')data=[];
  else if(name==='can_edit_workspace')data=true;
  const count=Array.isArray(data)?data.length:1;if(single&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`0-${Math.max(count-1,0)}/${count}`},body:req.method()==='HEAD'?'':JSON.stringify(data)});
 });
 await c.addInitScript(({key,user,ws,mobile})=>{
  const exp=Math.floor(Date.now()/1000)+36000;const payload=btoa(JSON.stringify({sub:user,exp,role:'authenticated'}));
  localStorage.setItem(key,JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-only',expires_at:exp,token_type:'bearer',user:{id:user,email:'demo@example.test'}}));
  if(!localStorage.getItem('vademde-active-workspace')) localStorage.setItem('vademde-active-workspace',mobile?JSON.stringify({state:{activeWorkspaceId:ws,balanceHidden:false},version:0}):ws);
  localStorage.setItem('vademde-query-cache-owner',user);localStorage.setItem('vademde-paywall-last-shown',String(Date.now()));
  localStorage.setItem('vademde-language','tr');localStorage.setItem('vademde-analytics-consent','denied');
  localStorage.setItem('vademde-language-preference',JSON.stringify({state:{languagePreference:'tr'},version:0}));
  localStorage.setItem('vademde-theme-preference',JSON.stringify({state:{themePreference:'light'},version:0}));
  localStorage.setItem('vademde-onboarding',JSON.stringify({state:{hasSeenWelcome:true,hasSeenTrialOffer:true},version:0}));
 },{key:`sb-${backend.hostname.split('.')[0]}-auth-token`,user,ws:ws[0],mobile});
 return c;
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const c=await context(browser,false),page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
  await page.goto('http://127.0.0.1:5177/uygulama',{timeout:120000});
  const trigger=page.getByRole('button',{name:'Çalışma alanını değiştir',exact:true}).filter({visible:true});await trigger.waitFor();
  await page.screenshot({path:out+'/web-mobile-closed.png'});await trigger.click();
  await page.getByRole('button',{name:'Kişisel',exact:true}).waitFor();await page.screenshot({path:out+'/web-mobile-open.png'});
  await page.getByRole('button',{name:'Kişisel',exact:true}).click();await page.waitForFunction(()=>localStorage.getItem('vademde-active-workspace').endsWith('102'));
  await page.goto('http://127.0.0.1:5177/uygulama/daha-fazla');await page.getByText('4 / 5',{exact:true}).waitFor();
  await page.goto('http://127.0.0.1:5177/uygulama');await page.setViewportSize({width:1440,height:960});
  const heading=page.locator('h1').getByRole('button',{name:'Çalışma alanını değiştir'});await heading.click();
  await page.getByRole('menuitem').filter({hasText:'Test İşletmesi'}).click();
  await heading.click();await page.getByRole('menu').waitFor();await page.waitForTimeout(300);await page.screenshot({path:out+'/web-desktop-open.png'});
  await page.keyboard.press('Escape');await page.goto('http://127.0.0.1:5177/uygulama/tara');await page.getByText('373',{exact:true}).waitFor();
  console.log('PASS web mobile + desktop switching; quota changes 500 → 5 → 500');
  await c.close();
  const native=await context(browser,true),np=await native.newPage();np.setDefaultTimeout(60000);np.on('pageerror',e=>console.log('Expo preview error:',e.message.slice(0,300)));
  await np.goto('http://localhost:8085',{timeout:120000});
  try{
   const button=np.getByRole('button',{name:'Çalışma alanını değiştir',exact:true});await button.waitFor();
   const dismiss=np.getByText('Şimdi değil',{exact:true});if(await dismiss.isVisible())await dismiss.click();
   await np.screenshot({path:out+'/mobile-app-closed.png'});await button.click();
   await np.getByText('Kişisel',{exact:true}).waitFor();await np.screenshot({path:out+'/mobile-app-open.png'});
   await np.getByText('Kişisel',{exact:true}).click();await np.waitForFunction(()=>JSON.parse(localStorage.getItem('vademde-active-workspace')).state.activeWorkspaceId.endsWith('102'));
   console.log('PASS mobile app dashboard switch (React Native web preview)');
  }catch(e){await np.screenshot({path:out+'/mobile-preview-diagnostic.png'});throw e;}
  await native.close();assert.deepEqual(errors, []);console.log('PASS no browser page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
