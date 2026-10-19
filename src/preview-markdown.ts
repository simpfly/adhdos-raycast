import type {Item} from './api';
import {boardText,boardThoughts} from './board-content';

export function literalMarkdown(value:string):string {return value.replace(/[\\`*_{}\[\]()<>!#|]/g,'\\$&');}
// Raycast renders Markdown but task-list support varies. Render explicit status glyphs
// without inventing interactive checkboxes; preserve fenced and inline code verbatim.
export function previewMarkdown(value:string):string {
 let fence:{char:string;length:number}|null=null;
 return value.replace(/\r\n?/g,'\n').split('\n').map(line=>{
  const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if(fence){if(marker&&marker[1][0]===fence.char&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;return line;}
  if(marker){fence={char:marker[1][0],length:marker[1].length};return line;}
  if(/^(?: {4}|\t)/.test(line))return line;
  const checklist=line.replace(/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)\[([ xX])\]\s+/,(_,indent:string,checked:string)=>`${indent}- ${checked.toLowerCase()==='x'?'☑':'☐'} `);
  // Keep authored Markdown, but don't trigger unbounded inline image downloads.
  return checklist.split(/(`+[^`]*`+)/g).map((part,index)=>index%2?part:part.replace(/(^|[^\\])!\[/g,'$1\\![')).join('');
 }).join('\n');
}
export function thoughtMarkdown(item:Item):string {
 const thoughts=boardThoughts(item);
 return thoughts.length?'\n\n---\n\n'+thoughts.map(previewMarkdown).join('\n\n'):'';
}
export function boardPreviewMarkdown(item:Item,localCover?:string):string {
 const cover=localCover ?? item.previewImage;
 const image=cover?`![封面](<${cover.replace(/[<>\s]/g,c=>encodeURIComponent(c))}>)\n\n`:'';
 const title=item.title?`## ${literalMarkdown(item.title.replace(/\s+/g,' '))}\n\n`:'';
 const subtasks=item.subtasks?.length?'\n\n'+item.subtasks.map(task=>`- ${task.done?'☑':'☐'} ${previewMarkdown(task.text)}`).join('\n'):'';
 return image+title+previewMarkdown(boardText(item))+thoughtMarkdown(item)+subtasks;
}
