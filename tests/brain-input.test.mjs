import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/brain-input.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const context={module:{exports:{}},Date};vm.runInNewContext(code,context);
const {parseDue,parseBrainLines}=context.module.exports;
const now=new Date(2026,9,16,10,0);
test('Chinese relative dates and afternoon time use the local calendar',()=>{
 assert.equal(parseDue('明天下午三点',now),new Date(2026,9,17,15).toISOString());
 assert.equal(parseDue('下周五',now),'2026-10-23');
 assert.equal(parseDue('明天上午九点半',now),new Date(2026,9,17,9,30).toISOString());
 assert.throws(()=>parseDue('明天25点',now));assert.throws(()=>parseDue('2026-02-30',now));assert.throws(()=>parseDue('随便哪天',now));
});
test('multiline tasks retain nested children and per-line dates',()=>{
 const result=parseBrainLines('交报告 @明天下午三点\n  整理资料\n\t检查数据\n买牛奶','brain-dump-primary','下周五',now);
 assert.equal(result.length,2);assert.equal(result[0].text,'交报告');assert.equal(result[0].subtasks.length,2);
 assert.equal(result[0].dueDate,new Date(2026,9,17,15).toISOString());assert.equal(result[1].dueDate,'2026-10-23');
 assert.throws(()=>parseBrainLines('  孤立子任务','brain-dump-primary','',now));
});
test('time parsing tolerates whitespace but rejects contradictory periods and malformed numerals',()=>{
 assert.equal(parseDue('明天 下午 三点',now),new Date(2026,9,17,15).toISOString());
 assert.throws(()=>parseDue('明天上午15点',now));assert.throws(()=>parseDue('明天一二点',now));
});
test('pasted Markdown outline preserves subtask checkboxes and numbered task boundaries',()=>{
 const result=parseBrainLines('1. 发布\r\n  - [x] 检查\r\n  - [ ] 上传\r\n2. 购物\r\n  • 牛奶','brain-dump-primary','',now);
 assert.equal(result.length,2);
 assert.equal(result[0].text,'发布');
 assert.equal(result[0].subtasks[0].text,'检查');
 assert.equal(result[0].subtasks[0].done,true);
 assert.equal(result[0].subtasks[1].done,false);
 assert.equal(result[1].subtasks[0].text,'牛奶');
});
test('unindented lists below a plain heading become subtasks; peer bullets stay separate',()=>{
 const result=parseBrainLines('发布\n- [X] 检查\n- 上传\n购物\n+ 牛奶','brain-dump-primary','',now);
 assert.equal(result.length,2);assert.equal(result[0].subtasks.length,2);
 assert.equal(result[0].subtasks[0].done,true);
 assert.equal(parseBrainLines('- 发布\n- 购物','brain-dump-primary','',now).length,2);
 assert.throws(()=>parseBrainLines('发布\n  - [ ] ','brain-dump-primary','',now));
});
