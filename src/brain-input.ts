function number(value:string):number {
 if (/^\d+$/.test(value)) return Number(value);
 const digits='零一二三四五六七八九';
 if(value==='两') return 2;
 if(!/^(?:[一二三四五六七八九]?十[一二三四五六七八九]?|[零一二三四五六七八九])$/.test(value))return -1;
 if(value.includes('十')) {const [a,b]=value.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}
 return digits.indexOf(value);
}
export function parseDue(input:string, now=new Date()):string | null {
 const value=input.trim().replace(/\s+/g,'');if(!value)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)) {if(Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)return value;throw Error('日期不存在');}
 if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)))return value;
 const match=value.match(/^(今天|明天|后天|大后天|(?:本周|这周|下周|周)[一二三四五六日天])?(?:(早上|上午|中午|下午|晚上)?([\d一二三四五六七八九十两]+)(?:点|:|：)(半|[\d一二三四五六七八九十]+分?)?)?$/);
 if(!match || (!match[1]&&!match[3]))throw Error('时间未识别，请用“明天下午三点”“下周五”或 YYYY-MM-DD');
 const date=new Date(now);date.setHours(0,0,0,0);
 const day=match[1];
 if(day) {
  const offset:Record<string,number>={今天:0,明天:1,后天:2,大后天:3};
  if(day in offset)date.setDate(date.getDate()+offset[day]);
  else {const weekday='一二三四五六日'.indexOf(day.slice(-1).replace('天','日'));const current=(date.getDay()+6)%7;let delta=weekday-current;if(day.startsWith('下周'))delta+=7;else if(day.startsWith('周')&&delta<0)delta+=7;date.setDate(date.getDate()+delta);}
 }
 if(match[3]) {
  let hour=number(match[3]);const minute=match[4]==='半'?30:match[4]?number(match[4].replace('分','')):0;
  if(match[2] && (hour<1 || hour>12))throw Error('上午、下午等时段请使用 1–12 点');
  if(['下午','晚上'].includes(match[2])&&hour<12)hour+=12;
  if(match[2]==='中午'&&hour<11)hour+=12;
  if((match[2]==='上午'||match[2]==='早上')&&hour===12)hour=0;
  if(hour<0||hour>23||minute<0||minute>59)throw Error('时间超出有效范围');
  date.setHours(hour,minute);if(!day&&date<=now)date.setDate(date.getDate()+1);
  return date.toISOString();
 }
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export interface BrainDraft {text:string;partition:string;dueDate?:string;subtasks?:{text:string;done?:boolean}[]}
export function parseBrainLines(input:string,partition:string,due:string,now=new Date()):BrainDraft[] {
 const result:BrainDraft[]=[];const defaultDue=parseDue(due,now);
 let parentIsHeading=false;
 for(const line of input.split(/\r\n?|\n/)) {
  if(!line.trim())continue;
  const listed=/^(?:[-*+•]\s+|\d+[.)、]\s+)/.test(line.trim());
  const child=/^\s/.test(line)||(listed&&parentIsHeading);
  let text=line.trim().replace(/^(?:[-*+•]\s+|\d+[.)、]\s+)/,'');
  const checkbox=text.match(/^\[([ xX])\]\s*/);
  if(checkbox)text=text.slice(checkbox[0].length).trim();
  if(child){if(!result.length)throw Error('首行不能缩进，请先填写主事项');const parent=result[result.length-1];if(!text||text.length>1000)throw Error('子任务需为 1–1000 字符');(parent.subtasks ||= []).push({text,...(checkbox?{done:checkbox[1].toLowerCase()==='x'}:{})});if(parent.subtasks.length>30)throw Error('每个事项最多 30 个子任务');continue;}
  parentIsHeading=!listed;
  const timed=text.match(/^(.*?)\s+@(.+)$/);let date=defaultDue;
  if(timed){text=timed[1].trim();date=parseDue(timed[2],now);}
  if(!text||text.length>5000)throw Error('每个事项需为 1–5000 字符');
  result.push({text,partition,...(date?{dueDate:date}:{})});
 }
 if(!result.length)throw Error('请填写事项');if(result.length>50)throw Error('一次最多添加 50 个事项');return result;
}
