import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const code=buildSync({entryPoints:['src/link-title.ts'],bundle:true,platform:'node',format:'cjs',external:['@raycast/api'],write:false}).outputFiles[0].text;
async function harness(t,fetch=()=>{throw Error('unexpected fetch')}) {
 const dir=await mkdtemp(path.join(os.tmpdir(),'adhdos-link-title-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const context={module:{exports:{}},URL,AbortSignal,TextDecoder,fetch,require:name=>name==='@raycast/api'?{environment:{supportPath:dir}}:require(name)};
 vm.runInNewContext(code,context);return context.module.exports;
}
test('prefers OG title, decodes Chinese entities, ignores script strings',async t=>{
 const api=await harness(t);
 assert.equal(api.htmlTitle('<script>"<meta property="og:title" content="wrong">"</script><title>fallback</title><meta content="&#20013;&#25991; &amp; Test" property="og:title">'),'中文 & Test');
 assert.equal(api.htmlTitle('<title>Hello\n World</title>'),'Hello World');
});
test('resolves preview image relative URLs and rejects unsafe schemes',async t=>{
 const api=await harness(t);
 assert.equal(api.htmlImage('<meta property="og:image" content="/cover.png?a=1&amp;b=2">','https://example.com/page'),'https://example.com/cover.png?a=1&b=2');
 assert.equal(api.htmlImage('<meta property="og:image" content="javascript:alert(1)">','https://example.com'),null);
 assert.equal(api.linkURL('ordinary text'),null);
});
test('Bilibili title and cover persist for subsequent list views',async t=>{
 let count=0;
 const api=await harness(t,async url=>{count++;assert.match(url,/adhdos.app\/api\/bilibili-proxy/);return {ok:true,json:async()=>({code:0,data:{title:'视频标题',pic:'http://i0.hdslb.com/cover.jpg'}})};});
 const url='https://www.bilibili.com/video/BV123456';
 assert.equal(await api.resolveTitle(url),'视频标题');
 assert.equal(await api.cachedImage(url),'https://i0.hdslb.com/cover.jpg');
 assert.equal(await api.resolveTitle(url),'视频标题');assert.equal(count,1);
});
test('network errors fall back without blocking saved links',async t=>{
 const api=await harness(t,async()=>{throw Error('timeout')});
 assert.equal(await api.resolveTitle('https://example.com'),null);
});
