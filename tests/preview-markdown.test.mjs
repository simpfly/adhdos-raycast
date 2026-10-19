import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/preview-markdown.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const ctx={module:{exports:{}}};vm.runInNewContext(code,ctx);
const {previewMarkdown,boardPreviewMarkdown,thoughtMarkdown}=ctx.module.exports;
test('recipe checklist displays states without literal bracket escape debris',()=>{
 const item={title:'卤鸡腿',content:'https://www.xiachufang.com/recipe/100414097/',thoughts:[{content:'- [ ] 大葱\n- [x] 八角\n- [ ] **冰糖**'}]};
 const rendered=boardPreviewMarkdown(item);
 assert.match(rendered,/- ☐ 大葱\n- ☑ 八角\n- ☐ \*\*冰糖\*\*/);assert.equal(rendered.includes('\\]'),false);
 assert.match(rendered,/^## 卤鸡腿/);assert.match(rendered,/https:\/\/www.xiachufang.com/);
 assert.equal(thoughtMarkdown(item).includes('- ☐ 大葱'),true);
});
test('preserves headings links emphasis lists and code while avoiding automatic body image loading',()=>{
 const input='# 标题\n[链接](https://example.com) **粗体**\n1. 顺序\n> 引用\n```md\n- [ ] literal\n![code](x)\n```\n`![inline](x)`\n![外部图片](https://example.com/a.png)';
 const output=previewMarkdown(input);
 assert.ok(output.includes('# 标题\n[链接](https://example.com) **粗体**'));
 assert.ok(output.includes('```md\n- [ ] literal\n![code](x)\n```'));
 assert.ok(output.includes('`![inline](x)`'));assert.ok(output.includes('\\![外部图片]'));
});
