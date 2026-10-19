import {environment,getPreferenceValues} from '@raycast/api';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink,open} from 'node:fs/promises';
import path from 'node:path';
import {add} from './api';
import {BrainDraft} from './brain-input';
export interface Batch {created?:number;input:string;due:string;partition:string;index:number;entries:{id:string;body:BrainDraft}[]}
const file=()=>path.join(environment.supportPath,'brain-batch-'+createHash('sha256').update(getPreferenceValues<{apiKey:string}>().apiKey.trim()).digest('hex')+'.json');
export async function loadBatch():Promise<Batch|null> {
 try {
  const value=JSON.parse(await readFile(file(),'utf8'));
  if(!Array.isArray(value.entries)||!value.entries.length||value.entries.length>50||!Number.isInteger(value.index)||value.index<0||value.index>value.entries.length||!['input','due','partition'].every(key=>typeof value[key]==='string')||!value.entries.every((entry:{id?:unknown;body?:BrainDraft})=>typeof entry.id==='string'&&typeof entry.body?.text==='string')) throw Error('批量进度损坏，请核对已保存事项');
  return value;
 } catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
async function persist(batch:Batch){const temporary=file()+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(batch),{mode:0o600});await rename(temporary,file());}
export async function runBatch(proposed:Batch,progress:(batch:Batch)=>void) {
 await mkdir(environment.supportPath,{recursive:true,mode:0o700});
 let lock;
 try{lock=await open(file()+'.lock','wx',0o600);}catch{throw Error('另一个窗口正在批量保存，请稍后重试');}
 try {
  const saved=await loadBatch();
  if(saved && JSON.stringify(saved.entries)!==JSON.stringify(proposed.entries))throw Error('已有另一批待确认事项，请重新打开添加命令恢复');
  let current=saved || proposed;
  // Old batches without timestamps cannot safely renew the server idempotency window.
  if(!current.created || Date.now()-current.created>6*86400000)throw Error('批量记录已超出安全重试期限，请先核对云端，避免重复添加');
  await persist(current);progress(current);
  for(let i=current.index;i<current.entries.length;i++) {
   const entry=current.entries[i];await add('brain',entry.body,entry.id);
   current={...current,index:i+1};await persist(current);progress(current);
  }
  await unlink(file());return current;
 } finally {await lock.close();await unlink(file()+'.lock');}
}
