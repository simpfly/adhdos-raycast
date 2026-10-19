import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/item-permalink.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const ctx={module:{exports:{}},URL};vm.runInNewContext(code,ctx);
test('BrainDump uses the shared task route and encodes only the ID',()=>{
 const url=new URL(ctx.module.exports.itemPermalink('brain',{id:'a/b &中文',text:'private'}));
 assert.equal(url.origin,'https://adhdos.app');assert.equal(url.pathname,'/brain-dump');assert.equal(url.searchParams.get('task'),'a/b &中文');assert.deepEqual([...url.searchParams.keys()],['task']);assert.equal(url.hash,'');
 assert.equal(ctx.module.exports.itemPermalink('brain',{id:123}),'https://adhdos.app/brain-dump?task=123');
});
