import type {Item} from './api';
// Shared by preview, search and copy; retain legacy note-only cards.
export function boardText(item:Item):string { return item.content || item.text || item.note || item.url || ''; }
export function boardThoughts(item:Item):string[] { return (item.thoughts || []).map(thought=>thought.content).filter(content=>typeof content==='string' && content.trim().length>0); }
export function copyBoardContent(item:Item):string {
 const original=boardText(item);
 // Never copy private storage paths or inline image bytes as readable text.
 const body=item.type==='image' && !/^https?:\/\//i.test(original) ? '' : original;
 return [body,...boardThoughts(item)].filter(Boolean).join('\n\n');
}

export function boardLinks(item:Item):string[] {
 const links=new Set<string>();
 for(const content of [item.url || '',boardText(item),...boardThoughts(item)]) {
  for(const match of content.matchAll(/https?:\/\/[^\s<>"\u3000]+/gi)) {
   let candidate=match[0].replace(/[。！，、；：！？,.!;?\]}>]+$/u,'');
   // Preserve balanced parentheses in URLs, drop Markdown/prose closing delimiters.
   while(candidate.endsWith(')') && (candidate.match(/\)/g)||[]).length>(candidate.match(/\(/g)||[]).length)candidate=candidate.slice(0,-1);
   try {const url=new URL(candidate);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)links.add(url.href);}catch{/* Ignore malformed addresses. */}
  }
 }
 return [...links];
}
