import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/board-filters.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const context={module:{exports:{}},URL};vm.runInNewContext(code,context);
const {mediaOf,matchesBoard,partitionOf}=context.module.exports;
test('combines partition and medium without losing either selection',()=>{
 const item={id:'a',tab:'学习',type:'text',content:'https://www.bilibili.com/video/BV123'};
 assert.equal(matchesBoard(item,'学习','video'),true);
 assert.equal(matchesBoard(item,'工作','video'),false);
 assert.equal(matchesBoard(item,'学习','music'),false);
 assert.equal(matchesBoard(item,null,'video'),true);
 assert.equal(matchesBoard(item,'学习','link'),true);
});
test('supports legacy partition and unassigned cards',()=>{
 assert.equal(partitionOf({partition:' 收藏 '}),'收藏');
 assert.equal(matchesBoard({id:1,content:'笔记'},'','text'),true);
 assert.equal(matchesBoard({id:1,tab:'全部分区'},null,'all'),true);
});
test('classifies media without treating a fetched cover as an image card',()=>{
 assert.equal(mediaOf({type:'image',content:'图片说明'}),'image');
 assert.equal(mediaOf({content:'https://example.com',previewImage:'https://example.com/cover.jpg'}),'link');
 assert.equal(mediaOf({content:'推荐 https://youtu.be/abc 看看'}),'video');
 assert.equal(mediaOf({content:'https://music.163.com/#/song?id=1'}),'music');
 assert.equal(mediaOf({content:'https://example.com/a.PNG?x=1'}),'image');
 assert.equal(mediaOf({content:'https://youtube.com.evil.test/x'}),'link');
 assert.equal(mediaOf({content:'随手想法'}),'text');
});
