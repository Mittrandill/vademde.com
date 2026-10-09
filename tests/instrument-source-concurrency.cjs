// Independent real PostgreSQL sessions against the restored local schema. Synthetic rows commit.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawnSync,spawn}=require('node:child_process');
const database=process.env.FINANCE_STAGE_DATABASE||'vademde_release_stage_2';
assert(['vademde_release_stage','vademde_release_stage_2','vademde_release_stage_3'].includes(database));
const binary='/usr/local/Cellar/postgresql@17/17.11/bin/psql';
const args=['-X','-q','-A','-t','-h',process.env.FINANCE_STAGE_SOCKET||'/private/tmp/vademde-release-stage.lNhe2a','-p',process.env.FINANCE_STAGE_PORT||'55440','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-f','-'];
const actor=randomUUID(),workspace=randomUUID(),customer=randomUUID(),supplier=randomUUID();
const quote=x=>`'${String(x).replaceAll("'","''")}'`;
const json=x=>`${quote(JSON.stringify(x))}::jsonb`;
function sql(input){const r=spawnSync(binary,args,{input,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
function owned(input){return `begin;set local role authenticated;set local request.jwt.claim.sub=${quote(actor)};set local lock_timeout='5s';set local statement_timeout='10s';${input};commit;`;}
function worker(input){return new Promise(resolve=>{const child=spawn(binary,args);let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('close',status=>resolve({status,stdout,stderr}));child.stdin.end(owned(`${input};select pg_sleep(0.2)`));});}
function fixture(advance=false){const source=randomUUID(),target=randomUUID(),child=randomUUID();
 sql(owned(`insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values
 (${quote(source)},${quote(workspace)},${quote(customer)},'Race cheque','receivable','cek',3000000),
 (${quote(target)},${quote(workspace)},${quote(advance?customer:supplier)},'Race invoice',${quote(advance?'receivable':'payable')},'fatura',2000000);
 ${advance?`insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor,parent_obligation_id) values(${quote(child)},${quote(workspace)},${quote(customer)},'Race advance','payable','avans',3000000,${quote(source)});`:''}`));
 return {source,target,child};
}
function endorse(f,id){return `select public.settle_endorsement_atomic(${quote(actor)},${quote(id)},${quote(workspace)},${quote(supplier)},'TRY','2026-10-09T12:00:00Z',null,${json([{id:f.source,remaining_amount_minor:3000000}])},${json([{id:f.target,remaining_amount_minor:2000000}])})`;}
function offset(f,id){return `select public.settle_offset_atomic(${quote(actor)},${quote(id)},${quote(workspace)},${quote(customer)},'receivable','TRY',2000000,'2026-10-09T12:00:00Z',null,${json([{source_id:f.child,target_id:f.target,amount_minor:2000000}])},${json([{id:f.child,remaining_amount_minor:3000000},{id:f.target,remaining_amount_minor:2000000}])})`;}
function preview(f){return JSON.parse(sql(owned(`select public.preview_instrument_bounce(${quote(f.source)})`)));}
function bounce(f,p){return `select public.bounce_instrument_atomic(${quote(actor)},${quote(f.source)},${json(p)})`;}
function row(id){return JSON.parse(sql(`select to_jsonb(o) from public.obligations o where id=${quote(id)}`));}
(async()=>{
 sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values(${quote(actor)},${quote(actor+'@example.invalid')},'{}');set local request.jwt.claim.sub=${quote(actor)};set local role authenticated;
 insert into public.workspaces(id,name,owner_id) values(${quote(workspace)},'Concurrency tests',${quote(actor)});
 insert into public.counterparties(id,workspace_id,name) values(${quote(customer)},${quote(workspace)},'Customer'),(${quote(supplier)},${quote(workspace)},'Supplier');commit;`);
 let f=fixture(),id=randomUUID(),results=await Promise.all([worker(endorse(f,id)),worker(endorse(f,id))]);
 assert(results.every(x=>x.status===0),JSON.stringify(results));assert.equal(Number(sql(`select count(*) from finance_private.endorsement_requests where workspace_id=${quote(workspace)} and request_id=${quote(id)}`)),1);
 assert.equal(Number(sql(`select count(*) from public.obligations where parent_obligation_id=${quote(f.source)}`)),1);
 console.log('PASS concurrent identical ciro requests create one receipt and one source advance');
 f=fixture();results=await Promise.all([worker(endorse(f,randomUUID())),worker(endorse(f,randomUUID()))]);
 assert.equal(results.filter(x=>x.status===0).length,1,JSON.stringify(results));assert.equal(row(f.target).remaining_amount_minor,0);
 assert.equal(Number(sql(`select count(*) from public.obligations where parent_obligation_id=${quote(f.source)}`)),1);
 console.log('PASS different ciro IDs racing for the same cheque accept only one');
 f=fixture();id=randomUUID();results=await Promise.all([worker(endorse(f,id)),worker(`select public.cancel_endorsement_request(${quote(actor)},${quote(workspace)},${quote(id)})`)]);
 assert.equal(results[1].status,0,JSON.stringify(results));
 const receipt=JSON.parse(sql(`select result from finance_private.endorsement_requests where workspace_id=${quote(workspace)} and request_id=${quote(id)}`));
 if(receipt.cancelled){assert.notEqual(results[0].status,0);assert.equal(row(f.target).remaining_amount_minor,2000000);assert.equal(row(f.source).instrument_status,'portfoy');}
 else{assert.equal(results[0].status,0);assert.equal(row(f.target).remaining_amount_minor,0);assert.equal(row(f.source).instrument_status,'ciro_edildi');}
 console.log('PASS ciro/cancel race has either a terminal tombstone or a complete single endorsement');
 f=fixture(true);let p=preview(f);results=await Promise.all([worker(bounce(f,p)),worker(offset(f,randomUUID()))]);
 assert.equal(results.filter(x=>x.status===0).length,1,JSON.stringify(results));
 if(results[0].status===0){assert.equal(row(f.source).status,'iptal_edildi');assert.equal(row(f.child).status,'iptal_edildi');assert.equal(row(f.target).remaining_amount_minor,2000000);}
 else{assert.notEqual(row(f.source).status,'iptal_edildi');assert.equal(row(f.child).remaining_amount_minor,1000000);assert.equal(row(f.target).remaining_amount_minor,0);}
 console.log('PASS source bounce/new offset race cannot spend an invalidated advance or leave partial closures');
 f=fixture();p=preview(f);results=await Promise.all([worker(bounce(f,p)),worker(bounce(f,p))]);assert(results.every(x=>x.status===0),JSON.stringify(results));
 const bounced=JSON.parse(sql(`select result from finance_private.instrument_bounces where workspace_id=${quote(workspace)} and source_id=${quote(f.source)}`));
 assert(bounced.replacement_claim.id);assert.equal(Number(sql(`select count(*) from public.obligations where id=${quote(bounced.replacement_claim.id)}`)),1);
 console.log('PASS identical source bounces preserve a standalone claim once');
 f=fixture(true);id=randomUUID();sql(owned(offset(f,id)));p=preview(f);
 results=await Promise.all([worker(bounce(f,p)),worker(`select public.reverse_offset_atomic(${quote(actor)},${quote(workspace)},${quote(id)})`)]);
 assert(results.some(x=>x.status===0),JSON.stringify(results));assert.equal(row(f.target).remaining_amount_minor,2000000);
 if(row(f.source).status==='iptal_edildi'){assert.equal(row(f.child).status,'iptal_edildi');sql(owned(`select public.reverse_offset_atomic(${quote(actor)},${quote(workspace)},${quote(id)})`));}
 else assert.equal(row(f.child).remaining_amount_minor,3000000);
 console.log('PASS bounce/offset-reversal race keeps one coherent outcome; later replay remains safe');
})().catch(error=>{console.error(error);process.exitCode=1;});
