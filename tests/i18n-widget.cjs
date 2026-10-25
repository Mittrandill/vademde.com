const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function setup(platform='ios',available=true) {
  let language='tr',reloads=0;
  const stored=new Map();
  class ExtensionStorage {
    constructor(group) { assert.equal(group,'group.com.akintkaya.vademde.widget'); }
    get(key) { return stored.get(key)??null; }
    set(key,value) { if(value===undefined)stored.delete(key);else stored.set(key,value); }
    static reloadWidget() { reloads++; }
  }
  const module={exports:{}};
  const source=fs.readFileSync(path.join(root,'services/widgetSync.ts'),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',output)((id)=>{
    if(id==='react-native')return {Platform:{OS:platform}};
    if(id==='@/i18n')return {getLanguage:()=>language};
    if(id==='@bacons/apple-targets'){if(!available)throw Error('native module unavailable');return {ExtensionStorage};}
    throw Error(id);
  },module,module.exports);
  return {api:module.exports,stored,setLanguage:(value)=>{language=value;},reloads:()=>reloads};
}

const env=setup(),{api,stored}=env;
const snapshot={v:1,language:'tr',workspaceId:'w',workspaceName:'Kullanıcı işletmesi',updatedAt:1,balance:'₺1.234,50',receivable:'₺0',payable:'₺0',monthNet:'₺0',monthNetShort:'+0',weekPayable:'₺0',weekReceivable:'₺0',weekPayableMinor:0,weekReceivableMinor:0,items:[]};
api.writeWidgetSnapshot(snapshot);
assert.equal(stored.get('language'),'tr');
assert.deepEqual(JSON.parse(stored.get('snapshot')),snapshot);
api.writeWidgetHideAmounts(true);
api.writeWidgetLanguage('tr');assert.ok(stored.has('snapshot'));
env.setLanguage('en');api.writeWidgetLanguage('en');
assert.equal(stored.get('language'),'en');assert.ok(!stored.has('snapshot'));
assert.equal(stored.get('hideAmounts'),'1');
api.writeWidgetSnapshot(snapshot);assert.ok(!stored.has('snapshot'),'stale language renders cannot overwrite the current widget');
api.writeWidgetSnapshot({...snapshot,language:'en',balance:'₺1,234.50'});
assert.equal(JSON.parse(stored.get('snapshot')).workspaceName,'Kullanıcı işletmesi','user data is never translated');
assert.equal(JSON.parse(stored.get('snapshot')).balance,'₺1,234.50');
api.clearWidgetSnapshot();assert.ok(!stored.has('snapshot'));assert.equal(stored.get('language'),'en');
const legacy={...snapshot};delete legacy.language;stored.set('snapshot',JSON.stringify(legacy));
env.setLanguage('tr');api.writeWidgetLanguage('tr');assert.ok(stored.has('snapshot'),'legacy Turkish snapshots remain supported');
env.setLanguage('en');api.writeWidgetLanguage('en');assert.ok(!stored.has('snapshot'));
stored.set('snapshot','{broken');api.writeWidgetLanguage('en');assert.ok(!stored.has('snapshot'));assert.equal(stored.get('language'),'en');
assert.ok(env.reloads()>0);
for(const test of [setup('android'),setup('ios',false)]){
  assert.doesNotThrow(()=>{test.api.writeWidgetLanguage('en');test.api.writeWidgetSnapshot(snapshot);test.api.clearWidgetSnapshot();});
  assert.equal(test.stored.size,0);
}

// Cross-language contract checks; an actual WidgetKit build still requires Xcode/macOS.
const data=fs.readFileSync(path.join(root,'targets/widget/Data.swift'),'utf8');
const views=fs.readFileSync(path.join(root,'targets/widget/Widgets.swift'),'utf8');
const theme=fs.readFileSync(path.join(root,'targets/widget/Theme.swift'),'utf8');
const localization=fs.readFileSync(path.join(root,'targets/widget/Localization.swift'),'utf8');
assert.ok(data.includes('let language: String?'));
assert.ok(data.includes('(saved.language ?? "tr") != language.rawValue'));
assert.ok(data.includes('language == .en ? "MMM d" : "d MMM"'));
assert.equal((views.match(/configurationDisplayName\(Text\(WidgetLanguage.current.text/g)??[]).length,8);
const defined=new Set([...localization.matchAll(/case \.(\w+):/g)].map((match)=>match[1]));
for(const source of [data,views,theme])for(const [,key] of source.matchAll(/\.text\(\.(\w+)\)/g))assert.ok(defined.has(key),`Missing native text: ${key}`);
assert.ok(!/\.relative\(from: entry.date\)/.test(views));
assert.ok(!/Text\("[çğıöşüÇĞİÖŞÜA-Za-z]+[\sçğıöşüÇĞİÖŞÜ]/.test(views));
console.log('PASS widget storage: language changes, stale/legacy/corrupt snapshots, hidden amounts, logout, user data and missing native module. Swift contract checked; native build pending.');
