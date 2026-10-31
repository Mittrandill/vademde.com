import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
const source=readFileSync('features/assets/api.ts','utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:()=>({}),Date,BigInt,Number});
const {assetShareValue,assetActivityTotals}=module.exports;
assert.equal(assetShareValue({estimated_value_minor:null,ownership_bps:10000}),null);
assert.equal(assetShareValue({estimated_value_minor:0,ownership_bps:5000}),0);
assert.equal(assetShareValue({estimated_value_minor:450000000,ownership_bps:2500}),112500000);
assert.equal(assetShareValue({estimated_value_minor:Number.MAX_SAFE_INTEGER,ownership_bps:10000}),Number.MAX_SAFE_INTEGER);
const rows=[
 {direction:'income',amount_minor:25000,financing_minor:0,currency_code:'TRY'},
 {direction:'income',amount_minor:100000,financing_minor:100000,currency_code:'TRY'},
 {direction:'expense',amount_minor:12000,financing_minor:10000,currency_code:'TRY'},
 {direction:'expense',amount_minor:8000,financing_minor:0,currency_code:'TRY'},
 {direction:'expense',amount_minor:2000,financing_minor:0,currency_code:'EUR'},
 {direction:'transfer',amount_minor:5000,financing_minor:0,currency_code:'TRY'},
 {direction:'expense',amount_minor:9000,financing_minor:0,currency_code:'TRY',description:'Kredi Kartı Ekstresi — Test'},
].map(r=>({...r,occurred_at:'2026-06-01T12:00:00Z'}));
const result=assetActivityTotals(rows,2026);
assert.equal(result.TRY.income,25000);
assert.equal(result.TRY.expense,10000);
assert.equal(result.TRY.principal,10000);
assert.equal(result.EUR.expense,2000);
assert.equal(Object.keys(assetActivityTotals(rows,2025)).length,0);
console.log('PASS unknown vs zero, fractional ownership, safe integer bounds, currency separation, principal, transfers and duplicate statements');
