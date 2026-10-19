import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const code = buildSync({entryPoints:['src/api.ts'],bundle:true,platform:'node',format:'cjs',external:['@raycast/api'],write:false}).outputFiles[0].text;
async function harness(t, fetch) {
 const dir = await mkdtemp(path.join(os.tmpdir(),'adhdos-raycast-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const exports = {};
 const context = { module:{exports}, exports, fetch, AbortSignal, console, require:(name)=> name === '@raycast/api' ? {environment:{supportPath:dir},getPreferenceValues:()=>({apiKey:'adhdos_'+'a'.repeat(64)})} : require(name)};
 vm.runInNewContext(code,context);
 return context.module.exports;
}
test('uncertain writes reuse ID across restart and reject different content', async t => {
 const ids=[];
 const api=await harness(t, async (_,options)=>{if(options.method==='GET') return {ok:true,json:async()=>({items:[{id:'saved',content:'中文\n"链接"'}]})}; ids.push(options.headers['Idempotency-Key']); if(ids.length===1) throw new Error('timeout'); return {ok:true,json:async()=>({item:{id:'saved'}})};});
 await assert.rejects(api.add('board',{content:'中文\n"链接"'}),/timeout/);
 await assert.rejects(api.add('board',{content:'changed'}),/原内容/);
 await api.add('board',{content:'中文\n"链接"'});
 assert.equal(ids.length,2); assert.equal(ids[0],ids[1]); assert.equal(await api.pending('board'),null);
});
test('definite rejection clears pending',async t=>{
 const api=await harness(t,async()=>({ok:false,status:401}));
 await assert.rejects(api.add('brain',{text:'牛奶',partition:'brain-dump-primary'}),/密钥/);
 assert.equal(await api.pending('brain'),null);
});
test('tasks paginate and board uses narrow endpoint',async t=>{
 const calls=[];
 const api=await harness(t,async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('board-items')?{items:[]} : url.includes('offset=0')?{tasks:[{id:1}],nextOffset:500}:{tasks:[{id:2}],nextOffset:null}};});
 const items=await api.list('brain'); assert.equal(items.length,2); assert.match(calls[1],/offset=500/);
 await api.list('board'); assert.match(calls[2],/board-items\?limit=200/);
});
test('parallel submissions do not create duplicates',async t=>{
 let release,entered;
 const started=new Promise(resolve=>entered=resolve);
 const gate=new Promise(resolve=>release=resolve);
 const api=await harness(t,async(_,options)=>{if(options.method==='GET') return {ok:true,json:async()=>({items:[{id:'one',content:'one'}]})}; entered();await gate;return {ok:true,json:async()=>({item:{id:'one'}})};});
 const first=api.add('board',{content:'one'}); await started;
 await assert.rejects(api.add('board',{content:'two'}),/另一添加窗口/);
 release(); await first;
});
test('Board must not report success when saved item is absent on readback',async t=>{
 const api=await harness(t,async (_url,options)=>({ok:true,json:async()=>options.method==='POST'?{item:{id:'missing',content:'fixture'}}:{items:[]}}));
 await assert.rejects(api.add('board',{content:'fixture'}),/未.*确认|未.*查到/);
 assert.notEqual(await api.pending('board'),null);
});

test('readback failure keeps original idempotency key even on auth error',async t=>{
 const ids=[]; let reads=0;
 const api=await harness(t,async(_,options)=>{
  if(options.method==='POST') { ids.push(options.headers['Idempotency-Key']); return {ok:true,json:async()=>({item:{id:'saved',content:'fixture'}})}; }
  if(++reads===1) return {ok:false,status:401};
  return {ok:true,json:async()=>({items:[{id:'saved',content:'fixture'}]})};
 });
 await assert.rejects(api.add('board',{content:'fixture'}),/密钥/);
 assert.notEqual(await api.pending('board'),null);
 const saved=await api.add('board',{content:'fixture'});
 assert.equal(saved.id,'saved'); assert.equal(ids[0],ids[1]);
});
test('readback must match both id and original content',async t=>{
 const api=await harness(t,async(_,options)=>({ok:true,json:async()=>options.method==='POST'?{item:{id:'saved'}}:{items:[{id:'other',content:'fixture'},{id:'saved',content:'different'}]}}));
 await assert.rejects(api.add('board',{content:'fixture'}),/未查到/);
});
test('Board saves the selected partition and verifies it on readback',async t=>{
 let posted;
 const api=await harness(t,async(_,options)=>{
  if(options.method==='POST') {posted=JSON.parse(options.body);return {ok:true,json:async()=>({item:{id:'saved'}})};}
  return {ok:true,json:async()=>({items:[{id:'saved',content:'链接',tab:'学习'}]})};
 });
 const saved=await api.add('board',{content:'链接',tab:'学习'});
 assert.deepEqual(posted,{content:'链接',tab:'学习'});assert.equal(saved.tab,'学习');
});
test('Board does not confirm success in the wrong partition',async t=>{
 const api=await harness(t,async(_,options)=>({ok:true,json:async()=>options.method==='POST'?{item:{id:'saved'}}:{items:[{id:'saved',content:'链接',tab:'其他'}]}}));
 await assert.rejects(api.add('board',{content:'链接',tab:'学习'}),/未查到/);
 assert.equal((await api.pending('board')).body.tab,'学习');
});
test('private image preview requests only the card ID with API authentication',async t=>{
 let seen;
 const api=await harness(t,async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({url:'https://storage.example/signed'})};});
 assert.equal(await api.boardImageURL({id:'image-id',type:'image',content:'owner/file.png'}),'https://storage.example/signed');
 assert.match(seen.url,/board-items\/image-id\/image$/);assert.match(seen.options.headers.Authorization,/Bearer adhdos_/);
 assert.equal(seen.url.includes('owner'),false);
});
test('public and embedded image previews do not request a private signature',async t=>{
 const api=await harness(t,()=>{throw Error('unexpected request');});
 assert.equal(await api.boardImageURL({id:1,type:'image',content:'https://example.com/a.png'}),'https://example.com/a.png');
 assert.equal(await api.boardImageURL({id:2,type:'image',content:'data:image/png;base64,AAAA'}),'data:image/png;base64,AAAA');
});
test('thumbnail and detail share an in-flight signature and reuse it until refresh',async t=>{
 let calls=0;
 const api=await harness(t,async()=>{calls++;return {ok:true,json:async()=>({url:`https://storage.example/${calls}`,expiresAt:Date.now()+300000})};});
 const item={id:'shared',type:'image',content:'owner/shared.png'};
 const results=await Promise.all([api.boardImageURL(item),api.boardImageURL(item)]);
 assert.equal(calls,1);assert.equal(results[0],results[1]);
 await api.boardImageURL(item);assert.equal(calls,1);
 await api.boardImageURL(item,true);assert.equal(calls,2);
});
test('expired image signatures and failed requests are retried',async t=>{
 let calls=0;
 const api=await harness(t,async()=>{
  calls++;if(calls===1)throw Error('offline');
  return {ok:true,json:async()=>({url:'https://storage.example/image',expiresAt:Date.now()-1})};
 });
 const item={id:'retry',type:'image',content:'owner/retry.png'};
 await assert.rejects(api.boardImageURL(item));
 await api.boardImageURL(item);await api.boardImageURL(item);
 assert.equal(calls,3);
});
test('BrainDump all-status listing includes completed tasks and paginates',async t=>{
 const urls=[];const api=await harness(t,async url=>{urls.push(url);return {ok:true,json:async()=>({tasks:[{id:urls.length,done:urls.length===2}],nextOffset:urls.length===1?500:null})};});
 const result=await api.list('brain',true);assert.equal(result.length,2);assert.equal(result[1].done,true);
 assert.equal(urls.some(url=>url.includes('done=false')),false);assert.match(urls[1],/offset=500/);
});
test('BrainDump updates use PATCH, version check and an idempotency key',async t=>{
 let seen;const api=await harness(t,async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({task:{id:'t1',done:true}})};});
 const result=await api.updateTask({id:'t1',updatedAt:'version-1'},{done:true});
 assert.equal(result.done,true);assert.equal(seen.options.method,'PATCH');
 assert.deepEqual(JSON.parse(seen.options.body),{done:true,expectedUpdatedAt:'version-1'});
 assert.ok(seen.options.headers['Idempotency-Key']);assert.match(seen.url,/tasks\/t1$/);
});
test('BrainDump legacy tasks use null version and subtask changes preserve IDs',async t=>{
 let body;const api=await harness(t,async(_,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({task:{id:1}})};});
 await api.updateTask({id:1},{subtasks:[{id:'sub',done:true}]});
 assert.deepEqual(body,{subtasks:[{id:'sub',done:true}],expectedUpdatedAt:null});
});
test('BrainDump does not report success after conflict or mismatched response',async t=>{
 const api=await harness(t,async()=>({ok:false,status:409}));
 await assert.rejects(api.updateTask({id:1},{done:true}),/冲突/);
 const wrong=await harness(t,async()=>({ok:true,json:async()=>({task:{id:2}})}));
 await assert.rejects(wrong.updateTask({id:1},{done:true}),/未确认/);
});
test('batch replay after journal completion preserves the supplied request ID',async t=>{
 const ids=[];const api=await harness(t,async(_,options)=>{ids.push(options.headers['Idempotency-Key']);return {ok:true,json:async()=>({task:{id:'saved'}})};});
 await api.add('brain',{text:'batch',subtasks:[{text:'child'}]},'stable-id');
 await api.add('brain',{text:'batch',subtasks:[{text:'child'}]},'stable-id');
 assert.deepEqual(ids,['stable-id','stable-id']);
});
test('adding subtasks sends only new children and reuses request ID on retry',async t=>{
 const calls=[];const api=await harness(t,async(_,options)=>{calls.push(options);if(calls.length===1)throw Error('timeout');return {ok:true,json:async()=>({task:{id:'parent',subtasks:[{id:'old',text:'existing'},{id:'new',text:'new child'}]}})};});
 const parent={id:'parent',updatedAt:'v1',subtasks:[{id:'old',text:'existing'}]};
 await assert.rejects(api.updateTask(parent,{subtasks:[{text:'new child'}]},'same-operation'));
 const saved=await api.updateTask(parent,{subtasks:[{text:'new child'}]},'same-operation');
 assert.equal(saved.subtasks.length,2);
 assert.deepEqual(JSON.parse(calls[1].body),{subtasks:[{text:'new child'}],expectedUpdatedAt:'v1'});
 assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
});
test('Board thoughts preserve uncertain operations across retries and validate returned card',async t=>{
 const ids=[];let fail=true;const api=await harness(t,async(url,options)=>{assert.match(url,/board-items\/card\/thoughts$/);ids.push(options.headers['Idempotency-Key']);if(fail){fail=false;throw Error('offline');}return {ok:true,json:async()=>({item:{id:'card',thoughts:[{content:'idea'}]}})};});
 await assert.rejects(api.addThought({id:'card'},'idea'));
 assert.equal((await api.pendingThought({id:'card'})).content,'idea');
 await assert.rejects(api.addThought({id:'card'},'different'),/原内容/);
 await api.addThought({id:'card'},'idea');assert.equal(ids[0],ids[1]);assert.equal(await api.pendingThought({id:'card'}),null);
});
test('Board thought response without appended content remains pending',async t=>{
 const api=await harness(t,async()=>({ok:true,json:async()=>({item:{id:'card',thoughts:[]}})}));
 await assert.rejects(api.addThought({id:'card'},'idea'),/未确认/);assert.ok(await api.pendingThought({id:'card'}));
});
test('Board deletion uses a version precondition and checks the deletion receipt',async t=>{
 let seen;const api=await harness(t,async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({deleted:true,id:'card'})};});
 await api.deleteBoard({id:'card',updatedAt:'v1'},'delete-once');
 assert.match(seen.url,/board-items\/card\/delete$/);assert.deepEqual(JSON.parse(seen.options.body),{expectedUpdatedAt:'v1'});assert.equal(seen.options.headers['Idempotency-Key'],'delete-once');
 const bad=await harness(t,async()=>({ok:true,json:async()=>({deleted:false,id:'card'})}));await assert.rejects(bad.deleteBoard({id:'card'}),/未确认/);
});
test('Board sections use metadata endpoint including empty sections',async t=>{
 let url;const api=await harness(t,async value=>{url=value;return {ok:true,json:async()=>({tabs:['收藏','空分区','收藏']})};});
 const tabs=await api.boardTabs();assert.deepEqual(Array.from(tabs),['收藏','空分区']);assert.match(url,/board-items\?tabsOnly=true$/);
});
test('Board creation preserves initial thought and verifies it on readback',async t=>{
 let posted;const api=await harness(t,async(_,options)=>{
  if(options.method==='POST'){posted=JSON.parse(options.body);return {ok:true,json:async()=>({item:{id:'card'}})};}
  return {ok:true,json:async()=>({items:[{id:'card',content:'url',partition:'收藏',thoughts:[{content:'参考案例'}]}]})};
 });
 await api.add('board',{content:'url',tab:'收藏',thought:'参考案例'});assert.equal(posted.thought,'参考案例');
});
test('missing initial thought cannot be reported as fully saved',async t=>{
 const api=await harness(t,async(_,options)=>({ok:true,json:async()=>options.method==='POST'?{item:{id:'card'}}:{items:[{id:'card',content:'url',thoughts:[]}]}}));
 await assert.rejects(api.add('board',{content:'url',thought:'keep this'}),/未查到/);assert.equal((await api.pending('board')).body.thought,'keep this');
});
