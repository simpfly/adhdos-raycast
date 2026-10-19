import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/board-content.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const context={URL,module:{exports:{}}};vm.runInNewContext(code,context);
const {boardText,boardThoughts,copyBoardContent}=context.module.exports;
test('legacy text and appended thoughts use the same readable content',()=>{
 const item={note:'**旧备注**',thoughts:[{content:'追加想法'},{content:''}]};
 assert.equal(boardText(item),'**旧备注**');assert.equal(boardThoughts(item).length,1);
 assert.equal(copyBoardContent(item),'**旧备注**\n\n追加想法');
});
test('copy omits private image paths and inline bytes but retains thoughts and public URLs',()=>{
 for(const content of ['owner/file.png','data:image/png;base64,AAAA'])assert.equal(copyBoardContent({type:'image',content,thoughts:[{content:'图片想法'}]}),'图片想法');
 assert.equal(copyBoardContent({type:'image',content:'https://example.com/a.png'}),'https://example.com/a.png');
});

test('content links include explicit URL, Markdown, prose and thoughts without duplicates',()=>{
 const links=context.module.exports.boardLinks({url:'https://example.com/a',content:'正文 [链接](https://example.com/a) 和 https://example.com/path_(part)。',thoughts:[{content:'参考 https://other.example/test。'}]});
 assert.deepEqual(Array.from(links),['https://example.com/a','https://example.com/path_(part)','https://other.example/test']);
});
test('content links ignore private storage paths and credential-bearing URLs',()=>{
 assert.equal(context.module.exports.boardLinks({content:'owner/image.png javascript:alert(1) https://user:pass@example.com'}).length,0);
});
