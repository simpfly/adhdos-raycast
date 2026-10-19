import {Action,ActionPanel,Alert,confirmAlert,Cache,Form,Icon,List,Toast,showToast,useNavigation,getPreferenceValues} from '@raycast/api';
import {createHash,randomUUID} from 'node:crypto';
import {useEffect,useRef,useState} from 'react';
import {Item,list,updateTask} from './api';
import {BrainCreate} from './brain-create';
import {PermalinkActions} from './permalink-actions';
import {parseDue} from './brain-input';
const cache = new Cache();
const cacheKey = () => 'brain-all-'+createHash('sha256').update(getPreferenceValues<{apiKey:string}>().apiKey.trim()).digest('hex');
const displayDue = (value:string) => value.includes('T') ? new Date(value).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : value;
const escape = (value:string) => value.replace(/[\\`*_{}\[\]()<>!#|]/g,'\\$&');
const errorMessage = (error:unknown) => error instanceof Error ? error.message : '请刷新后重试';
function EditTask({item,onSaved}:{item:Item;onSaved:(item:Item)=>void}) {
 const [text,setText]=useState(item.text || '');
 const [partition,setPartition]=useState(item.partition || 'brain-dump-primary');
 const [due,setDue]=useState(item.dueDate || '');
 const [busy,setBusy]=useState(false);const lock=useRef(false);const {pop}=useNavigation();
 async function save() {
  if(lock.current)return;
  if(!text.trim() || text.trim().length>5000) {await showToast({style:Toast.Style.Failure,title:'请输入 1–5000 字符'});return;}
  let parsedDue:string|null;
  try {parsedDue=parseDue(due);} catch(e) {await showToast({style:Toast.Style.Failure,title:errorMessage(e)});return;}
  lock.current=true;setBusy(true);
  try {onSaved(await updateTask(item,{text:text.trim(),partition,dueDate:parsedDue}));pop();await showToast({style:Toast.Style.Success,title:'已更新'});}
  catch(e){await showToast({style:Toast.Style.Failure,title:'未确认更新，请刷新核对',message:errorMessage(e)});}
  finally{lock.current=false;setBusy(false);}
 }
 return <Form navigationTitle="编辑 BrainDump" isLoading={busy} actions={<ActionPanel><Action.SubmitForm title="保存修改" onSubmit={save}/></ActionPanel>}>
  <Form.TextArea id="text" title="事项" value={text} onChange={setText}/>
  <Form.Dropdown id="partition" title="分区" value={partition} onChange={setPartition}><Form.Dropdown.Item value="brain-dump-primary" title="主分区"/><Form.Dropdown.Item value="brain-dump-secondary" title="次分区"/></Form.Dropdown>
  <Form.TextField id="due" title="截止日期" placeholder="明天下午三点 / 下周五，留空清除" value={due} onChange={setDue}/>
 </Form>;
}
function AddSubtasks({item,onSaved}:{item:Item;onSaved:(item:Item)=>void}) {
 const [input,setInput]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<string>();
 const operation=useRef<{id:string;subtasks:{text:string}[]} | null>(null);const lock=useRef(false);const {pop}=useNavigation();
 async function save() {
  if(lock.current)return;
  const subtasks=input.split(/\r?\n/).map(text=>({text:text.trim()})).filter(task=>task.text);
  if(!subtasks.length){setError('请填写子事项，每行一条');return;}
  if(subtasks.some(task=>task.text.length>1000)){setError('每条子事项最多 1000 字符');return;}
  if((item.subtasks?.length||0)+subtasks.length>30){setError(`还可添加 ${Math.max(0,30-(item.subtasks?.length||0))} 条子事项`);return;}
  operation.current ||= {id:randomUUID(),subtasks};
  lock.current=true;setBusy(true);setError(undefined);
  try {
   const saved=await updateTask(item,{subtasks:operation.current.subtasks},operation.current.id);
   onSaved(saved);pop();await showToast({style:Toast.Style.Success,title:`已添加 ${subtasks.length} 条子事项`});
  } catch(e){setError('未确认保存，保留原内容重试；若提示冲突，请返回列表刷新核对。');await showToast({style:Toast.Style.Failure,title:'未确认添加',message:errorMessage(e)});}
  finally{lock.current=false;setBusy(false);}
 }
 return <Form navigationTitle="添加子事项" isLoading={busy} actions={<ActionPanel><Action.SubmitForm title="添加子事项" onSubmit={save}/></ActionPanel>}>
  <Form.Description title="所属事项" text={item.text || '未命名'}/>
  <Form.TextArea id="subtasks" title="子事项" placeholder={'每行一条，例如：\n整理资料\n检查数据'} value={input} onChange={value=>{if(!operation.current){setInput(value);setError(undefined);}}} error={error}/>
  <Form.Description text={`还可添加 ${Math.max(0,30-(item.subtasks?.length||0))} 条；保存后显示在主事项下方。`}/>
 </Form>;
}
export function BrainBrowse() {
 const [items,setItems]=useState<Item[]>(()=>{try{return JSON.parse(cache.get(cacheKey())||'[]');}catch{return [];}});
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [status,setStatus]=useState('open');const [partition,setPartition]=useState('all');const [selected,setSelected]=useState<string|null>(null);
 const lock=useRef(false);const generation=useRef(0);
 function replace(updated:Item){setItems(current=>{const next=current.map(item=>item.id===updated.id?updated:item);cache.set(cacheKey(),JSON.stringify(next));return next;});}
 async function refresh(){const revision=++generation.current;setBusy(true);setError('');try{const data=await list('brain',true);if(revision===generation.current){setItems(data);cache.set(cacheKey(),JSON.stringify(data));}}catch(e){if(revision===generation.current){setError(errorMessage(e));await showToast({style:Toast.Style.Failure,title:'加载失败',message:errorMessage(e)});}}finally{if(revision===generation.current)setBusy(false);}}
 useEffect(()=>{void refresh();return()=>{generation.current++;};},[]);
 async function change(item:Item,changes:Record<string,unknown>){if(lock.current)return;lock.current=true;setBusy(true);generation.current++;try{replace(await updateTask(item,changes));await showToast({style:Toast.Style.Success,title:'已更新'});}catch(e){await showToast({style:Toast.Style.Failure,title:'未确认更新，请刷新核对',message:errorMessage(e)});}finally{lock.current=false;setBusy(false);}}
 async function cancelTask(item:Item) {
  if(lock.current)return;
  if(!await confirmAlert({title:'取消此事项？',message:`${item.text || '未命名'}\n将移入 ADHDOS 的已取消列表，可在那里恢复。`,primaryAction:{title:'取消事项',style:Alert.ActionStyle.Destructive}}))return;
  lock.current=true;setBusy(true);generation.current++;
  try {await updateTask(item,{deleted:true});setItems(current=>{const next=current.filter(entry=>String(entry.id)!==String(item.id));cache.set(cacheKey(),JSON.stringify(next));return next;});await showToast({style:Toast.Style.Success,title:'事项已取消'});}
  catch(e){await showToast({style:Toast.Style.Failure,title:'未确认取消，请刷新核对',message:errorMessage(e)});}
  finally{lock.current=false;setBusy(false);}
 }
 const found=items.filter(item=>(status==='all'||!!item.done===(status==='done'))&&(partition==='all'||(item.partition||'brain-dump-primary')===partition));
 const common=<><Action.Push title="添加事项" icon={Icon.Plus} target={<BrainCreate onSaved={refresh} initialPartition={partition==='all'?'brain-dump-primary':partition}/>} shortcut={{modifiers:['cmd'],key:'n'}}/><Action title="刷新" icon={Icon.ArrowClockwise} onAction={refresh} shortcut={{modifiers:['cmd'],key:'r'}}/></>;
 return <List navigationTitle="BrainDump" isLoading={busy} isShowingDetail={found.length>0} onSelectionChange={setSelected} searchBarPlaceholder="搜索事项和子任务" searchBarAccessory={<List.Dropdown tooltip="筛选状态和分区" value="current" onChange={value=>{if(value.startsWith('status:'))setStatus(value.slice(7));if(value.startsWith('partition:'))setPartition(value.slice(10));setSelected(null);}}><List.Dropdown.Item value="current" title={`${status==='open'?'未完成':status==='done'?'已完成':'全部状态'} · ${partition==='all'?'全部分区':partition==='brain-dump-primary'?'主分区':'次分区'}`}/><List.Dropdown.Section title="状态"><List.Dropdown.Item value="status:open" title="未完成"/><List.Dropdown.Item value="status:done" title="已完成"/><List.Dropdown.Item value="status:all" title="全部状态"/></List.Dropdown.Section><List.Dropdown.Section title="分区"><List.Dropdown.Item value="partition:all" title="全部分区"/><List.Dropdown.Item value="partition:brain-dump-primary" title="主分区"/><List.Dropdown.Item value="partition:brain-dump-secondary" title="次分区"/></List.Dropdown.Section></List.Dropdown>} actions={<ActionPanel>{common}</ActionPanel>}>
 <List.EmptyView title={error || (busy?'正在加载…':'没有符合条件的事项')} description="⌘N 添加事项 · ⌘R 刷新"/>
 <List.Section title={`${found.length} 件事项`}>
 {found.flatMap(item => {
   const parentId = `task:${item.id}`;
   const tasks = item.subtasks || [];
   const detail = (activeText?:string) => <List.Item.Detail markdown={`${activeText ? `# ${escape(activeText)}\n\n所属事项：${escape(item.text || '')}` : `# ${escape(item.text || '')}`}\n\n${item.dueDate ? `截止 ${escape(displayDue(item.dueDate))}\n\n` : ''}${tasks.length ? `**子任务 ${tasks.filter(task=>task.done).length}/${tasks.length}**\n\n${tasks.map(task=>`${task.done?'✓':'□'} ${escape(task.text)}`).join('\n\n')}` : ''}`} />;
   const addSubtasks = <Action.Push title="添加子事项" icon={Icon.Plus} target={<AddSubtasks item={item} onSaved={replace}/>} shortcut={{modifiers:['cmd','shift'],key:'n'}}/>;
   const parent = <List.Item key={parentId} id={parentId} title={item.text || '未命名'} icon={item.done?Icon.CheckCircle:Icon.Circle}
     keywords={tasks.map(task=>task.text)} accessories={[...(item.dueDate?[{text:displayDue(item.dueDate)}]:[]),...(tasks.length?[{text:`${tasks.filter(task=>task.done).length}/${tasks.length}`,tooltip:'已完成 / 全部子任务'}]:[])]}
     detail={(!selected ? item.id===found[0]?.id : selected===parentId) ? detail() : undefined}
     actions={<ActionPanel>
       <Action title={item.done?'撤销完成':'标记完成'} icon={item.done?Icon.Undo:Icon.CheckCircle} onAction={()=>change(item,{done:!item.done})}/>
       {addSubtasks}
       <Action.Push title="编辑事项" icon={Icon.Pencil} target={<EditTask item={item} onSaved={replace}/>} shortcut={{modifiers:['cmd'],key:'e'}}/>
       <Action title="取消事项" icon={Icon.XMarkCircle} style={Action.Style.Destructive} onAction={()=>cancelTask(item)}/>
       <PermalinkActions kind="brain" item={item}/>
       <Action.CopyToClipboard title="复制事项" content={item.text||''}/>{common}
     </ActionPanel>}/>;
   return [parent, ...tasks.filter(task=>task.id).map(task => {
     const id = JSON.stringify(['subtask',item.id,task.id]);
     return <List.Item key={id} id={id} title={`　　↳ ${task.text}`} icon={task.done?Icon.CheckCircle:Icon.Circle}
       keywords={[item.text || '',task.text]}
       detail={selected===id ? detail(task.text) : undefined}
       actions={<ActionPanel>
         <Action title={task.done?'撤销完成子任务':'完成子任务'} icon={task.done?Icon.Undo:Icon.CheckCircle} onAction={()=>change(item,{subtasks:[{id:task.id,done:!task.done}]})}/>
         {addSubtasks}
         <PermalinkActions kind="brain" item={item}/>
         <Action.CopyToClipboard title="复制子任务" content={task.text}/>{common}
       </ActionPanel>}/>;
   })];
 })}</List.Section></List>;
}
