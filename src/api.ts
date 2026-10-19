import { getPreferenceValues, environment } from "@raycast/api";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink, open } from "node:fs/promises";
import path from "node:path";

export type Kind = "board" | "brain";
export interface Item {
  id: string | number;
  type?: string;
  url?: string;
  title?: string;
  previewImage?: string;
  content?: string;
  text?: string;
  note?: string;
  tab?: string;
  partition?: string;
  dueDate?: string;
  done?: boolean;
  updatedAt?: string;
  thoughts?: { content: string }[];
  subtasks?: { id?: string; text: string; done?: boolean }[];
}
export interface AddBody { content?: string; thought?: string; text?: string; tab?: string; partition?: string; dueDate?: string; subtasks?: {text:string;done?:boolean}[] }
export interface Pending {
  id: string;
  created: number;
  credential: string;
  body: AddBody;
}
const BASE = "https://adhdos.app/api/v1";
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function key() {
  const value = getPreferenceValues<{ apiKey: string }>().apiKey.trim();
  if (!/^adhdos_[a-f0-9]{64}$/.test(value)) throw new Error("请在扩展设置中填写完整的 API 密钥。");
  return value;
}
async function request(route: string, secret: string, operation?: {id:string;body:object}, method = "POST") {
  const response = await fetch(BASE + route, {
    method: operation ? method : "GET",
    headers: { Authorization: `Bearer ${secret}`, ...(operation ? { "Content-Type": "application/json", "Idempotency-Key": operation.id } : {}) },
    body: operation ? JSON.stringify(operation.body) : undefined,
    signal: AbortSignal.timeout(25000), redirect: "error",
  });
  if (!response.ok) {
    const messages: Record<number, string> = {401:"密钥无效，请检查扩展设置",403:"需要有效 Pro 订阅",409:"写入冲突或尚无云同步数据，请在 ADHDOS 核对",429:"请求频繁，请一分钟后重试"};
    throw new ApiError(response.status, messages[response.status] || `请求失败（${response.status}）`);
  }
  return response.json();
}
export async function list(kind: Kind, allTasks = false): Promise<Item[]> {
  const secret = key();
  if (kind === "board") {
    const data = await request("/board-items?limit=200&includeFullContent=true&sort=recent", secret);
    if (!Array.isArray(data.items)) throw new Error("Board 列表响应不完整");
    return data.items;
  }
  const items: Item[] = [];
  let offset = 0;
  while (true) {
    const data = await request(`/tasks?${allTasks ? "" : "done=false&"}limit=500&offset=${offset}`, secret);
    if (!Array.isArray(data.tasks)) throw new Error("事项列表响应不完整");
    items.push(...data.tasks);
    if (data.nextOffset == null) return items;
    if (!Number.isInteger(data.nextOffset) || data.nextOffset <= offset) throw new Error("分页结果异常");
    offset = data.nextOffset;
  }
}
export async function boardTabs():Promise<string[]> {
  const data=await request('/board-items?tabsOnly=true',key());
  if(!Array.isArray(data.tabs) || !data.tabs.every((tab:unknown)=>typeof tab==='string'))throw new Error('Board 分区响应不完整');
  return [...new Set<string>(data.tabs)].filter(tab=>tab.trim().length>0);
}
const filename = (kind: Kind) => path.join(environment.supportPath, `${kind}-pending.json`);
export async function pending(kind: Kind): Promise<Pending | null> {
  try { return JSON.parse(await readFile(filename(kind), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function forget(kind: Kind) { await unlink(filename(kind)); }
export async function add(kind: Kind, body: AddBody, requestId?: string): Promise<Item> {
  const secret = key();
  const credential = createHash("sha256").update(secret).digest("hex");
  await mkdir(environment.supportPath, { recursive: true, mode: 0o700 });
  const lockPath = path.join(environment.supportPath, `${kind}.lock`);
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch { throw new Error("另一添加窗口正在保存。如上次运行异常退出，请在扩展数据目录检查锁文件。"); }
  try {
    let operation = await pending(kind);
    if (operation) {
      if (operation.credential !== credential) throw new Error("密钥已变更，请先核对待确认记录。");
      if (JSON.stringify(operation.body) !== JSON.stringify(body)) throw new Error("请先用上次的原内容重试，或核对后清除重试记录。");
      if (Date.now() - operation.created > 6 * 86400000) throw new Error("已接近重试期限，请先核对云端记录。");
    } else {
      operation = { id: requestId || randomUUID(), created: Date.now(), credential, body };
      const temporary = filename(kind) + ".tmp";
      await writeFile(temporary, JSON.stringify(operation), { mode: 0o600 });
      await rename(temporary, filename(kind));
    }
    let saved: Item;
    try {
      const data = await request(kind === "board" ? "/board-items" : "/tasks", secret, operation);
      saved = kind === "board" ? data.item : data.task;
      if (!saved?.id) throw new Error("保存结果尚未确认，请使用原内容重试。");
    } catch (error) {
      if (error instanceof ApiError && [400,401,403,404,409,413,415,428,429].includes(error.status)) await forget(kind);
      throw error;
    }
    // A successful write response alone does not prove the item is readable.
    // Keep the request journal on every readback failure, including auth errors.
    if (kind === "board") {
      const query = encodeURIComponent(Array.from(body.content!).slice(0, 160).join(""));
      const data = await request(`/board-items?limit=200&includeFullContent=true&sort=recent&query=${query}`, secret);
      const confirmed = Array.isArray(data.items) && data.items.find((item: Item) => String(item.id) === String(saved.id) && item.content === body.content && (item.tab || item.partition || "") === (body.tab || "") && (!body.thought?.trim() || item.thoughts?.some(thought=>thought.content===body.thought!.trim())));
      if (!confirmed) throw new Error("接口已返回保存结果，但重新读取未查到该内容。已保留原请求，请勿重复新建；可用原内容重试核对。");
      saved = confirmed;
    }
    await forget(kind);
    return saved;
  } finally { await lock.close(); await unlink(lockPath); }
}

const imageURLs = new Map<string, {url: string; expiresAt: number}>();
const imageRequests = new Map<string, Promise<string>>();
export async function boardImageURL(item: Item, force = false): Promise<string> {
  const original = item.url || item.content || '';
  const content = item.type === 'image' ? original : original.match(/https?:\/\/[^\s<>]+/i)?.[0] || original;
  if (/^https?:\/\//i.test(content) || /^data:image\/(png|jpeg|gif|webp|bmp|avif);base64,/i.test(content)) return content;
  const secret = key();
  const cacheId = createHash("sha256").update(JSON.stringify([secret,item.id,content])).digest("hex");
  const cached = imageURLs.get(cacheId);
  if (!force && cached && cached.expiresAt > Date.now() + 30000) return cached.url;
  const active = imageRequests.get(cacheId);
  if (active) return active;
  const task = (async () => {
    const data = await request(`/board-items/${encodeURIComponent(String(item.id))}/image`,secret);
    if (typeof data.url !== 'string' || !data.url.startsWith('https://')) throw new Error('暂时无法加载此图片');
    imageURLs.set(cacheId, {url:data.url, expiresAt: Math.min(Number(data.expiresAt) || Date.now(), Date.now() + 300000)});
    return data.url as string;
  })();
  imageRequests.set(cacheId, task);
  try { return await task; } finally { imageRequests.delete(cacheId); }
}

export async function updateTask(item: Item, changes: Record<string,unknown>, requestId: string = randomUUID()): Promise<Item> {
  const data = await request(`/tasks/${encodeURIComponent(String(item.id))}`, key(), {
    id:requestId, body:{...changes,expectedUpdatedAt:item.updatedAt || null}
  }, "PATCH");
  if (!data.task || String(data.task.id) !== String(item.id)) throw new Error("更新结果未确认，请刷新后核对");
  return data.task;
}

function thoughtFile(item: Item) {
  const identity = createHash('sha256').update(JSON.stringify([key(),String(item.id)])).digest('hex');
  return path.join(environment.supportPath, `thought-${identity}.json`);
}
export async function pendingThought(item: Item): Promise<{id:string;created:number;content:string}|null> {
  try { return JSON.parse(await readFile(thoughtFile(item),'utf8')); }
  catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e; }
}
export async function addThought(item: Item, content: string): Promise<Item> {
  content=content.trim();
  if(!content || content.length>10000)throw new Error('想法需为 1–10000 字符');
  const target=thoughtFile(item);
  await mkdir(environment.supportPath,{recursive:true,mode:0o700});
  let lock;try{lock=await open(target+'.lock','wx',0o600);}catch{throw new Error('另一窗口正在保存此卡片的想法');}
  try {
    let operation=await pendingThought(item);
    if(operation && (operation.content!==content || Date.now()-operation.created>6*86400000))throw new Error('请先核对上次待确认的想法，再使用原内容重试');
    if(!operation){operation={id:randomUUID(),created:Date.now(),content};await writeFile(target+'.tmp',JSON.stringify(operation),{mode:0o600});await rename(target+'.tmp',target);}
    let data;
    try { data=await request(`/board-items/${encodeURIComponent(String(item.id))}/thoughts`,key(),{id:operation.id,body:{content}}); }
    catch(e){if(e instanceof ApiError && [400,401,403,404,409,413,415,428,429].includes(e.status))await unlink(target);throw e;}
    if(!data.item || String(data.item.id)!==String(item.id) || !data.item.thoughts?.some((thought:{content:string})=>thought.content===content))throw new Error('保存结果未确认，请用原内容重试');
    await unlink(target);return data.item;
  } finally {await lock.close();await unlink(target+'.lock');}
}

export async function deleteBoard(item:Item, requestId: string = randomUUID()):Promise<void> {
 const result=await request(`/board-items/${encodeURIComponent(String(item.id))}/delete`,key(),{id:requestId,body:{expectedUpdatedAt:item.updatedAt||null}});
 if(result.deleted!==true || String(result.id)!==String(item.id))throw new Error('删除未确认，请刷新后核对');
}
