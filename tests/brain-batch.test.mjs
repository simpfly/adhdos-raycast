import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const code=buildSync({entryPoints:['src/brain-batch.ts'],bundle:true,platform:'node',format:'cjs',external:['@raycast/api'],write:false}).outputFiles[0].text;
async function harness(t,fetch){const dir=await mkdtemp(path.join(os.tmpdir(),'adhdos-batch-'));t.after(()=>rm(dir,{recursive:true,force:true}));const ctx={module:{exports:{}},fetch,AbortSignal,require:name=>name==='@raycast/api'?{environment:{supportPath:dir},getPreferenceValues:()=>({apiKey:'adhdos_'+'a'.repeat(64)})}:require(name)};vm.runInNewContext(code,ctx);return ctx.module.exports;}
const draft=()=>({created:Date.now(),input:'a\nb',due:'',partition:'brain-dump-primary',index:0,entries:[{id:'id-a',body:{text:'a',partition:'brain-dump-primary'}},{id:'id-b',body:{text:'b',partition:'brain-dump-primary'}}]});
test('interrupted batch resumes at saved progress with the same operation ID',async t=>{
 const ids=[];let fail=true;const api=await harness(t,async(_,options)=>{ids.push(options.headers['Idempotency-Key']);if(ids.length===2&&fail){fail=false;throw Error('offline');}return {ok:true,json:async()=>({task:{id:'saved'}})};});
 const batch=draft();await assert.rejects(api.runBatch(batch,()=>{}));assert.equal((await api.loadBatch()).index,1);
 await api.runBatch(batch,()=>{});assert.deepEqual(ids,['id-a','id-b','id-b']);assert.equal(await api.loadBatch(),null);
});
test('another window cannot overwrite an active batch journal',async t=>{
 let release,entered;const ready=new Promise(resolve=>entered=resolve);const gate=new Promise(resolve=>release=resolve);
 const api=await harness(t,async()=>{entered();await gate;return {ok:true,json:async()=>({task:{id:'saved'}})};});
 const batch=draft();const first=api.runBatch(batch,()=>{});await ready;
 await assert.rejects(api.runBatch(batch,()=>{}),/另一个窗口/);release();await first;
});
test('expired batch cannot silently renew idempotency guarantees',async t=>{
 const api=await harness(t,()=>{throw Error('must not call API');});
 await assert.rejects(api.runBatch({...draft(),created:Date.now()-7*86400000},()=>{}),/安全重试期限/);
});
