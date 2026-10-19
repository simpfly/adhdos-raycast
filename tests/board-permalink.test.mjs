import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/board-permalink.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const context={module:{exports:{}},URL};vm.runInNewContext(code,context);
test('Board permalink uses shared production route without browser globals or content',()=>{
 assert.equal(context.module.exports.boardPermalink({id:'a/b ?中文',content:'private'}),'https://adhdos.app/board/a%2Fb%20%3F%E4%B8%AD%E6%96%87');
 assert.equal(context.module.exports.boardPermalink({id:123}),'https://adhdos.app/board/123');
});
