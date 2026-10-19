import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const code=buildSync({entryPoints:['src/image-cache.ts'],bundle:true,platform:'node',format:'cjs',external:['@raycast/api'],write:false}).outputFiles[0].text;
async function harness(t) {
 const dir=await mkdtemp(path.join(os.tmpdir(),'adhdos-image-test-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const prefs={apiKey:'fixture-a'};
 const load=()=>{const context={module:{exports:{}},Buffer,AbortSignal,fetch:()=>{throw Error('unexpected network')},require:name=>name==='@raycast/api'?{environment:{supportPath:dir},getPreferenceValues:()=>prefs}:require(name)};vm.runInNewContext(code,context);return context.module.exports;};
 return {load,prefs};
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
test('real image conversion persists thumbnail and preview, deduplicates and survives restart',async t=>{
 const {load,prefs}=await harness(t);const api=load();let calls=0;
 const source=async()=>{calls++;return png;};
 const [a,b]=await Promise.all([api.localImage('image',source),api.localImage('image',source)]);
 assert.equal(a.preview,b.preview);assert.equal(calls,1);
 assert.ok((await stat(a.thumbnail)).size>0);assert.ok((await stat(a.preview)).size>0);
 await load().localImage('image',()=>{throw Error('should use disk cache')});
 prefs.apiKey='fixture-b';assert.equal(await load().cachedLocalImage('image'),null);
});
test('failed decode leaves no ready entry and does not poison retries',async t=>{
 const {load}=await harness(t);const api=load();
 await assert.rejects(api.localImage('bad',async()=> 'data:image/png;base64,YmFk'));
 assert.equal(await api.cachedLocalImage('bad'),null);
 await api.localImage('bad',async()=>png);
 assert.ok(await api.cachedLocalImage('bad'));
});
