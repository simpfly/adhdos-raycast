import {Action,ActionPanel,Form,Toast,showToast,useNavigation} from '@raycast/api';
import {useEffect,useRef,useState} from 'react';
import {randomUUID} from 'node:crypto';
import {pending} from './api';
import {BrainDraft,parseBrainLines} from './brain-input';
import {Batch,loadBatch,runBatch} from './brain-batch';
export function BrainCreate({onSaved,initialPartition='brain-dump-primary',initialInput=''}:{initialInput?:string;onSaved?:()=>void;initialPartition?:string}) {
 const [input,setInput]=useState(initialInput);const [due,setDue]=useState('');const [partition,setPartition]=useState(initialPartition);const [batch,setBatch]=useState<Batch|null>(null);const [busy,setBusy]=useState(true);const [failure,setFailure]=useState('');const lock=useRef(false);const {pop}=useNavigation();
 useEffect(()=>{void (async()=>{try{const saved=await loadBatch();if(saved){setBatch(saved);setInput(saved.input);setDue(saved.due);setPartition(saved.partition);}else{const absent=new Error();(absent as NodeJS.ErrnoException).code='ENOENT';throw absent;}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')setFailure('无法读取批量进度，请勿重复提交');else {const old=await pending('brain');if(old?.body.text){const restored:Batch={created:old.created,input:old.body.text,due:old.body.dueDate||'',partition:old.body.partition||initialPartition,index:0,entries:[{id:old.id,body:old.body as BrainDraft}]};setBatch(restored);setInput(restored.input);setDue(restored.due);setPartition(restored.partition);}}}finally{setBusy(false);}})().catch(()=>setFailure('无法读取待确认操作'));},[]);
 let drafts:BrainDraft[]=[];let validation='';try{drafts=batch?batch.entries.map(entry=>entry.body):parseBrainLines(input,partition,due);}catch(e){validation=(e as Error).message;}
 async function submit(){if(lock.current||busy||failure)return;if(validation){await showToast({style:Toast.Style.Failure,title:validation});return;}lock.current=true;setBusy(true);
 let current=batch || {created:Date.now(),input,due,partition,index:0,entries:drafts.map(body=>({id:randomUUID(),body}))};
 try{current=await runBatch(current,updated=>{current=updated;setBatch(updated);});setBatch(null);setInput('');setDue('');await showToast({style:Toast.Style.Success,title:`已添加 ${current.entries.length} 个事项`});onSaved?.();if(onSaved)pop();}
 catch(e){await showToast({style:Toast.Style.Failure,title:`已确认 ${current.index}/${current.entries.length}，可继续重试`,message:(e as Error).message});}
 finally{lock.current=false;setBusy(false);}}
 return <Form navigationTitle="添加 BrainDump" isLoading={busy} actions={<ActionPanel><Action.SubmitForm title={batch?'继续保存剩余事项':'添加事项'} onSubmit={submit}/></ActionPanel>}>
 {batch&&<Form.Description title="保存进度" text={`${batch.index}/${batch.entries.length} 已确认；继续保存会沿用原请求，避免重复添加。`}/>}
 <Form.TextArea id="items" title="事项" value={input} onChange={value=>{if(!batch)setInput(value);}} placeholder={'每行一个事项，缩进行作为子任务\n交报告 @明天下午三点\n  整理资料\n  检查数据\n买牛奶 @下周五'} error={failure || (input?validation:undefined)}/>
 <Form.Dropdown id="partition" title="分区" value={partition} onChange={value=>{if(!batch)setPartition(value);}}><Form.Dropdown.Item value="brain-dump-primary" title="主分区"/><Form.Dropdown.Item value="brain-dump-secondary" title="次分区"/></Form.Dropdown>
 <Form.TextField id="due" title="默认截止时间" value={due} onChange={value=>{if(!batch)setDue(value);}} placeholder="明天下午三点 / 下周五 / 2026-10-20"/>
 <Form.Description title="识别预览" text={drafts.length?drafts.map(item=>`${item.text}${item.dueDate?' · '+(item.dueDate.includes('T')?new Date(item.dueDate).toLocaleString():item.dueDate):''}${item.subtasks?.map(task=>'\n　'+(task.done?'✓ ':'↳ ')+task.text).join('')||''}`).join('\n'): '行尾用 @时间 单独指定；缩进至少一个空格，子任务支持一级。'}/>
 </Form>;
}
