import { Action, ActionPanel, Alert, Cache, getPreferenceValues, confirmAlert, Detail, Form, Icon, Image, List, openExtensionPreferences, showToast, Toast, useNavigation } from "@raycast/api";
import {boardText,boardThoughts,copyBoardContent} from "./board-content";
import {t} from "./strings";
import {BoardLinkActions} from "./board-link-actions";
import {boardPreviewMarkdown as markdown,thoughtMarkdown} from "./preview-markdown";
import { BrainBrowse } from "./brain";
import { createHash } from "node:crypto";
import { useEffect, useRef, useState } from "react";
import { boardTabs as fetchBoardTabs, deleteBoard, addThought, pendingThought, boardImageURL, add, forget, Item, Kind, list, pending, Pending } from "./api";
import { matchesBoard, mediaOf, mediaLabels, Medium, partitionOf } from "./board-filters";
import { cachedLocalImage, localImage, LocalImage, pruneImageCache } from "./image-cache";
import { cachedTitle, cachedImage, linkURL, resolveTitle } from "./link-title";

function message(error: unknown) { return error instanceof Error ? error.message : "请求失败，请重试"; }
function label(kind: Kind) { return kind === "board" ? "Board" : "BrainDump"; }
const text = boardText;
function imageIdentity(item: Item) { return JSON.stringify([item.id,item.type,item.content,item.url]); }
function defaultIcon(item: Item) {
  switch (mediaOf(item)) {
    case "image": return Icon.Image;
    case "video": return Icon.Video;
    case "music": return Icon.Music;
    case "link": return Icon.Link;
    default: return Icon.Text;
  }
}
const listCache = new Cache();
function cacheKey(kind: Kind) {
  const secret = getPreferenceValues<{apiKey:string}>().apiKey.trim();
  return `list-${kind}-${createHash("sha256").update(secret).digest("hex")}`;
}
function initialItems(kind: Kind): Item[] {
  try { const value = JSON.parse(listCache.get(cacheKey(kind)) || "null"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function ImagePreview({item, inline = false, prepared = ""}: {item: Item; inline?: boolean; prepared?: string}) {
  const [source, setSource] = useState(prepared);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!prepared);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false; setLoading(!prepared); setError("");
    if (prepared && attempt === 0) setSource(prepared);
    void localImage(imageIdentity(item), () => boardImageURL(item, attempt > 0), attempt > 0).then(image => {if (!cancelled) setSource(image.preview);})
      .catch(e => {if (!cancelled) setError(message(e));})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [item.id, item.content, item.url, prepared, attempt]);
  const content = source ? `![图片](<${source.replace(/[<>\s]/g, c => encodeURIComponent(c))}>)` : error || "正在加载图片…";
  const thoughts = thoughtMarkdown(item);
  if (inline) return <List.Item.Detail markdown={content + thoughts} isLoading={loading} />;
  return <Detail navigationTitle={item.title || "查看图片"} markdown={content + thoughts} isLoading={loading} actions={<ActionPanel>
    <Action title="重新加载图片" icon={Icon.ArrowClockwise} onAction={() => setAttempt(value => value + 1)} shortcut={{modifiers:["cmd"],key:"r"}} />
    <BoardLinkActions item={item}/>
  </ActionPanel>} />;
}
function AddThought({item,onSaved}:{item:Item;onSaved:(item:Item)=>void}) {
  const [content,setContent]=useState("");const [busy,setBusy]=useState(true);const [error,setError]=useState<string>();const [recovering,setRecovering]=useState(false);const [blocked,setBlocked]=useState(false);
  const lock=useRef(false);const {pop}=useNavigation();
  useEffect(()=>{void pendingThought(item).then(operation=>{if(operation){setContent(operation.content);setRecovering(true);}}).catch(e=>{setBlocked(true);setError(message(e));}).finally(()=>setBusy(false));},[item.id]);
  async function submit(){
    if(lock.current||busy||blocked)return;
    if(!content.trim()||content.trim().length>10000){setError("请输入 1–10000 字符");return;}
    lock.current=true;setBusy(true);setError(undefined);
    try {const updated=await addThought(item,content);onSaved(updated);pop();await showToast({style:Toast.Style.Success,title:"已添加想法"});}
    catch(e){setError(message(e));try{setRecovering(!!await pendingThought(item));}catch{setBlocked(true);}await showToast({style:Toast.Style.Failure,title:"未确认保存",message:message(e)});}
    finally{lock.current=false;setBusy(false);}
  }
  return <Form navigationTitle="添加想法" isLoading={busy} actions={<ActionPanel><Action.SubmitForm title={recovering?"使用原内容重试":"保存想法"} onSubmit={submit}/></ActionPanel>}>
    <Form.Description title="Board 内容" text={(item.title || (mediaOf(item)==="image"?"图片":text(item))).slice(0,300)}/>
    {recovering&&<Form.Description text="已恢复待确认的想法，继续提交会沿用原请求，避免重复添加。"/>}
    <Form.TextArea id="thought" title="想法" placeholder="补充你的想法…" value={content} onChange={value=>{if(!recovering&&!busy)setContent(value);}} error={error}/>
  </Form>;
}
function SavedDetail({ item, kind }: {item: Item; kind: Kind}) {
  const [saved, setSaved] = useState(item);
  useEffect(() => {
    let cancelled = false;
    if (kind === "board") void resolveTitle(text(item)).then(async title => {
      const previewImage = await cachedImage(text(item)) || undefined;
      if (!cancelled && title) setSaved({...item,title: item.title || title,previewImage});
    });
    return () => { cancelled = true; };
  }, [item, kind]);
  return <Detail navigationTitle="已保存到云端" markdown={markdown(saved)} actions={<ActionPanel>
    <BoardLinkActions item={saved}/>
    <Action.CopyToClipboard title={kind === "board" ? t("copyAll") : "复制已保存内容"} content={kind === "board" ? copyBoardContent(saved) : text(saved)} />
    <Action.Push title={`查看 ${label(kind)}`} target={kind === "brain" ? <BrainBrowse /> : <Browse kind={kind} />} />
  </ActionPanel>} />;
}
export function Browse({ kind }: { kind: Kind }) {
  const [items, setItems] = useState<Item[]>(() => initialItems(kind));
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [boardPartition, setBoardPartition] = useState<string | null>(null);
  const [medium, setMedium] = useState<Medium>("all");
  const partitions = [...new Set(items.map(partitionOf))].sort((a,b) => a.localeCompare(b));
  const filterLabel = `${boardPartition === null ? "全部分区" : boardPartition || "未分区"} · ${mediaLabels[medium]}`;
  function changeFilter(value: string) {
    if (value === "reset") { setBoardPartition(null); setMedium("all"); }
    else if (value === "all-partitions") setBoardPartition(null);
    else if (value.startsWith("partition:")) setBoardPartition(value.slice(10));
    else if (value.startsWith("media:")) setMedium(value.slice(6) as Medium);
    setSelected(null);
  }
  const generation = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => { if (items.length) listCache.set(cacheKey(kind), JSON.stringify(items)); }, 1000);
    return () => clearTimeout(timer);
  }, [items,kind]);
  const [selected, setSelected] = useState<string | null>(null);
  async function refresh() {
    const current = ++generation.current;
    setBusy(true); setError("");
    try { const result = await list(kind);
      if (current !== generation.current) return;
      const cached = initialItems(kind);
      const merged = result.map(item => {
        const previous = cached.find(old => old.id === item.id && text(old) === text(item));
        return {...item, title: item.title || previous?.title, previewImage: previous?.previewImage};
      });
      setItems(merged);
      listCache.set(cacheKey(kind), JSON.stringify(merged));
      setBusy(false);
      // Disk metadata hydration is background work, never a first-render gate.
      if (kind === "board") void Promise.all(result.map(async item => ({id:item.id,title:await cachedTitle(text(item)),image:await cachedImage(text(item))}))).then(metadata => {
        if (current === generation.current) setItems(currentItems => currentItems.map(item => {
          const meta = metadata.find(entry => entry.id === item.id);
          return {...item,title:item.title || meta?.title || undefined,previewImage:item.previewImage || meta?.image || undefined};
        }));
      });
    }
    catch (e) { if (current === generation.current) { setError(message(e)); await showToast({ style: Toast.Style.Failure, title: "加载失败", message: message(e) }); } }
    finally { if (current === generation.current) setBusy(false); }
  }
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [kind]);
  const found = items.filter(item => (kind !== "board" || matchesBoard(item, boardPartition, medium)) && [item.title, text(item), item.tab, ...boardThoughts(item), ...(item.subtasks || []).map(s => s.text)].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const [images, setImages] = useState<Record<string,LocalImage>>({});
  const previewItems = JSON.stringify(kind === "board" ? items.map(item => ({id:item.id,type:item.type,content:item.content,url:item.url})) : []);
  useEffect(() => {
    let cancelled = false;
    const queue: Item[] = JSON.parse(previewItems);
    let imageUpdates: Record<string,LocalImage> = {};
    let metadata: Record<string,{title:string|null;previewImage?:string}> = {};
    function flush() {
      if (cancelled) return;
      if (Object.keys(imageUpdates).length) { const update = imageUpdates; imageUpdates = {}; setImages(current => ({...current,...update})); }
      if (Object.keys(metadata).length) {
        const update = metadata; metadata = {};
        setItems(current => current.map(item => {const meta = update[imageIdentity(item)]; return meta ? {...item,title:item.title || meta.title || undefined,previewImage:meta.previewImage || item.previewImage} : item;}));
      }
    }
    const timer = setInterval(flush, 500);
    void pruneImageCache();
    async function worker() {
      while (!cancelled && queue.length) {
        const item = queue.shift()!;
        const identity = imageIdentity(item);
        try {
          if (mediaOf(item) === "image") {
            const cached = await cachedLocalImage(identity);
            const image = cached || await localImage(identity, () => boardImageURL(item));
            if (!cancelled) imageUpdates[identity] = image;
            if (!cached) await new Promise(resolve => setTimeout(resolve, 1200));
          } else if (linkURL(text(item))) {
            const title = await resolveTitle(text(item));
            const previewImage = await cachedImage(text(item)) || undefined;
            if (!cancelled) metadata[identity] = {title,previewImage};
            if (previewImage) {
              const image = await localImage(identity + previewImage, async () => previewImage);
              if (!cancelled) imageUpdates[identity] = image;
            }
          }
        } catch { /* Keep the media icon and continue when one preview fails. */ }
      }
    }
    // Hydrate every disk hit before starting any slow network jobs.
    void (async () => {
      const missing: Item[] = [];
      for (const item of queue.splice(0)) {
        if (cancelled) return;
        const identity = imageIdentity(item);
        const cover = mediaOf(item) === "image" ? undefined : await cachedImage(text(item));
        const cached = mediaOf(item) === "image" || cover ? await cachedLocalImage(identity + (cover || "")) : null;
        if (cached) imageUpdates[identity] = cached;
        else missing.push(item);
      }
      flush();queue.push(...missing);
      await Promise.all([worker(),worker()]);
    })().finally(() => {flush();clearInterval(timer);});
    return () => {cancelled = true; clearInterval(timer);};
  }, [previewItems]);
  function preparedImage(item: Item) { return images[imageIdentity(item)]?.preview || ""; }
  function boardIcon(item: Item): Image.ImageLike {
    const source = images[imageIdentity(item)]?.thumbnail;
    const fallback = defaultIcon(item);
    return source ? {source, fallback, mask:Image.Mask.RoundedRectangle} : fallback;
  }
  const deleting = useRef(false);
  async function removeBoard(item:Item) {
    if(deleting.current)return;
    if(!await confirmAlert({title:"删除这条 Board 内容？",message:`${(item.title || (mediaOf(item)==="image"?"图片":text(item))).slice(0,200)}\n内容和想法将移入 ADHDOS 回收站。`,primaryAction:{title:"移入回收站",style:Alert.ActionStyle.Destructive}}))return;
    deleting.current=true;generation.current++;setBusy(true);
    try {await deleteBoard(item);setItems(current=>{const next=current.filter(entry=>String(entry.id)!==String(item.id));listCache.set(cacheKey(kind),JSON.stringify(next));return next;});await showToast({style:Toast.Style.Success,title:"已移入回收站"});}
    catch(e){await showToast({style:Toast.Style.Failure,title:"未确认删除，请刷新核对",message:message(e)});}
    finally{deleting.current=false;setBusy(false);}
  }
  function thoughtSaved(updated:Item) {
    generation.current++;setBusy(false);
    setItems(current=>current.map(item=>String(item.id)===String(updated.id)?{...item,...updated,title:updated.title||item.title,previewImage:item.previewImage}:item));
  }
  const common = <>
    <Action.Push title={`添加 ${label(kind)}`} icon={Icon.Plus} target={<Create kind={kind} onSaved={refresh} initialBoardTab={boardPartition || ""} />} shortcut={{modifiers:["cmd"],key:"n"}} />
    <Action title="刷新" icon={Icon.ArrowClockwise} onAction={refresh} shortcut={{modifiers:["cmd"],key:"r"}} />
    <Action title="API 密钥设置" icon={Icon.Gear} onAction={openExtensionPreferences} />
  </>;
  return <List searchBarAccessory={kind === "board" ? <List.Dropdown tooltip="筛选分区和媒介（可组合）" value="current" onChange={changeFilter}>
    <List.Dropdown.Item title={filterLabel} value="current" />
    <List.Dropdown.Item title="重置全部筛选" value="reset" />
    <List.Dropdown.Section title="分区">
      <List.Dropdown.Item title="全部分区" value="all-partitions" />
      {partitions.map(partition => <List.Dropdown.Item key={partition} title={partition || "未分区"} value={`partition:${partition}`} />)}
    </List.Dropdown.Section>
    <List.Dropdown.Section title="媒介">
      {Object.entries(mediaLabels).map(([value,title]) => <List.Dropdown.Item key={value} title={title} value={`media:${value}`} />)}
    </List.Dropdown.Section>
  </List.Dropdown> : undefined} onSelectionChange={setSelected} isLoading={busy} isShowingDetail={found.length > 0} filtering={false} searchText={query} onSearchTextChange={setQuery} searchBarPlaceholder={`搜索 ${label(kind)}`} navigationTitle={label(kind)} actions={<ActionPanel>{common}</ActionPanel>}>
    <List.EmptyView title={error || (busy ? "正在加载…" : "没有符合条件的内容")} description={error ? "按 ⌘R 重试，或在操作菜单检查 API 密钥" : "按 ⌘N 新增"} />
    <List.Section title={kind === "board" ? `${found.length} / ${items.length} 条 · ${filterLabel} · 最近最多 200 条` : `${items.length} 件未完成事项 · 两个分区`}>
      {found.map(item => <List.Item id={String(item.id)} key={String(item.id)} title={(item.title || (mediaOf(item) === "image" ? "图片" : text(item))).replace(/\s+/g," ").slice(0,160) || "未命名"} icon={kind === "board" ? boardIcon(item) : Icon.Circle} accessories={item.dueDate ? [{text:item.dueDate}] : []} detail={(!selected ? item.id === found[0]?.id : String(item.id) === selected) ? (kind === "board" && mediaOf(item) === "image" ? <ImagePreview key={String(item.id)} item={item} prepared={preparedImage(item)} inline /> : <List.Item.Detail markdown={markdown(item, preparedImage(item))} />) : undefined} actions={<ActionPanel>{kind === "board" && mediaOf(item) === "image" && <Action.Push title="查看大图" icon={Icon.Image} target={<ImagePreview item={item} prepared={preparedImage(item)} />} />}<BoardLinkActions item={item}/>{kind === "board" && <Action title="删除内容" icon={Icon.Trash} style={Action.Style.Destructive} onAction={()=>removeBoard(item)}/>}<Action.CopyToClipboard title={kind === "board" ? t("copyAll") : "复制内容"} content={kind === "board" ? copyBoardContent(item) : text(item)} />{kind === "board" && <Action.Push title="添加想法" icon={Icon.Plus} target={<AddThought item={item} onSaved={thoughtSaved}/>} shortcut={{modifiers:["cmd","shift"],key:"n"}}/>}{common}</ActionPanel>} />)}
    </List.Section>
  </List>;
}

export function Create({ kind, onSaved, initialBoardTab = "", initialBrainPartition = "brain-dump-primary", initialContent = "" }: { initialContent?: string; kind: Kind; onSaved?: () => void; initialBoardTab?: string; initialBrainPartition?: string }) {
  const [content, setContent] = useState(initialContent);
  const [partition, setPartition] = useState(initialBrainPartition);
  const [dueDate, setDueDate] = useState("");
  const [boardTab, setBoardTab] = useState(initialBoardTab);
  const [thought,setThought]=useState("");
  const [thoughtError,setThoughtError]=useState<string>();
  const [tabsError,setTabsError]=useState(false);
  const [customTab, setCustomTab] = useState(false);
  const [tabError, setTabError] = useState<string>();
  const [boardTabs, setBoardTabs] = useState<string[]>(() => [...new Set(initialItems("board").map(partitionOf).filter(Boolean))]);
  useEffect(() => {
    if (kind !== "board") return;
    let cancelled = false;
    void fetchBoardTabs().then(tabs => { if (!cancelled) {setBoardTabs(tabs);setTabsError(false);} })
      .catch(() => { if (!cancelled) setTabsError(true); });
    return () => { cancelled = true; };
  }, [kind]);
  const [busy, setBusy] = useState(true);
  const [record, setRecord] = useState<Pending | null>(null);
  const [fieldError, setFieldError] = useState<string>();
  const submitting = useRef(false);
  const { pop, push } = useNavigation();
  useEffect(() => {
    pending(kind).then(value => { setRecord(value); if (value) { setContent(value.body.content || value.body.text || ""); setDueDate(value.body.dueDate || ""); setThought(value.body.thought || ""); setPartition(value.body.partition || "brain-dump-primary"); setBoardTab(value.body.tab || ""); setCustomTab(false); } })
      .catch(e => showToast({style:Toast.Style.Failure,title:"读取待确认记录失败",message:message(e)})).finally(() => setBusy(false));
  }, [kind]);
  async function submit() {
    if (busy || submitting.current) return;
    const value = content.trim();
    const max = kind === "board" ? 10000 : 5000;
    if (!value || value.length > max) { setFieldError(`请输入 1–${max} 字符`); return; }
    if (kind === "board" && ((customTab && !boardTab.trim()) || boardTab.trim().length > 100)) { setTabError("分区名称请输入 1–100 字符"); return; }
    if (kind === "brain" && dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0,10) !== dueDate)) { setFieldError("截止日期请填写有效的 YYYY-MM-DD 日期"); return; }
    if(kind === "board" && thought.trim().length>10000){setThoughtError(t("thoughtLimit"));return;}
    setThoughtError(undefined);
    submitting.current = true; setBusy(true); setFieldError(undefined); setTabError(undefined);
    const toast = await showToast({style:Toast.Style.Animated,title:"正在保存…"});
    try {
      const body: Record<string,string> = kind === "board" ? {content:value, ...(thought.trim() ? {thought:thought.trim()} : {}), ...(boardTab.trim() ? {tab:boardTab.trim()} : {})} : {text:value,partition,...(dueDate ? {dueDate} : {})};
      const saved = await add(kind, body);
      setRecord(null); setContent(""); setThought(""); toast.style = Toast.Style.Success; toast.title = kind === "board" ? "已保存并从云端读回" : "已保存到云端";
      if (onSaved) { onSaved(); pop(); }
      else push(<SavedDetail item={saved} kind={kind} />);
    } catch (e) {
      toast.style = Toast.Style.Failure; toast.title = "未确认保存"; toast.message = message(e);
      try { setRecord(await pending(kind)); } catch { /* Preserve the original submission error. */ }
    } finally { submitting.current = false; setBusy(false); }
  }
  async function clearRecord() {
    if (busy || !record) return;
    if (await confirmAlert({title:"已在 ADHDOS 核对保存结果？",message:"清除后再次提交会创建新内容。此操作只清除本机重试记录，不删除云端内容。",primaryAction:{title:"已核对，清除记录",style:Alert.ActionStyle.Destructive}})) {
      await forget(kind); setRecord(null);
    }
  }
  return <Form navigationTitle={`添加 ${label(kind)}`} isLoading={busy} actions={<ActionPanel>
    <Action.SubmitForm title={record ? "使用原请求重试" : `添加到 ${label(kind)}`} icon={Icon.Plus} onSubmit={submit} />
    {record && <Action title="核对后清除重试记录" icon={Icon.Trash} onAction={clearRecord} />}
    <Action title="API 密钥设置" icon={Icon.Gear} onAction={openExtensionPreferences} />
  </ActionPanel>}>
    {record && <Form.Description title="待确认操作" text="已恢复上次输入。保持内容不变并提交，可使用同一请求编号安全重试。" />}
    {kind === "board" && !initialContent.includes("\n") ? <Form.TextField id="content" title="内容" placeholder="粘贴链接或输入文字，回车保存" value={content} onChange={setContent} error={fieldError} /> : <Form.TextArea id="content" title={kind === "board" ? "内容" : "事项"} placeholder="想做什么？" value={content} onChange={setContent} error={fieldError} />}
    {kind === "board" && <Form.TextField id="initialThought" title={t("initialThought")} placeholder={t("thoughtPlaceholder")} value={thought} onChange={value=>{setThought(value);setThoughtError(undefined);}} error={thoughtError}/>}
    {kind === "board" && tabsError && <Form.Description text={t("tabsUnavailable")}/>}
    {kind === "board" && <Form.Dropdown id="boardTab" title="分区" value={customTab ? "custom" : `tab:${boardTab}`} onChange={value => {
      setTabError(undefined);
      if (value === "custom") { setCustomTab(true); setBoardTab(""); }
      else { setCustomTab(false); setBoardTab(value.slice(4)); }
    }}>
      <Form.Dropdown.Item value="tab:" title="未分区" />
      {[...new Set([...boardTabs, ...(!customTab && boardTab ? [boardTab] : [])])].sort((a,b) => a.localeCompare(b)).map(tab => <Form.Dropdown.Item key={tab} value={`tab:${tab}`} title={tab} />)}
      <Form.Dropdown.Item value="custom" title="输入其他分区…" />
    </Form.Dropdown>}
    {kind === "board" && customTab && <Form.TextField id="customBoardTab" title="分区名称" placeholder="输入已有或新的分区名称" value={boardTab} onChange={setBoardTab} error={tabError} />}
    {kind === "brain" && <Form.Dropdown id="partition" title="分区" value={partition} onChange={setPartition}><Form.Dropdown.Item value="brain-dump-primary" title="主分区" /><Form.Dropdown.Item value="brain-dump-secondary" title="次分区" /></Form.Dropdown>}
    {kind === "brain" && <Form.TextField id="dueDate" title="截止日期" placeholder="YYYY-MM-DD，可留空" value={dueDate} onChange={setDueDate} />}
    <Form.Description text="保存到 ADHDOS 云端；桌面显示取决于云同步。" />
  </Form>;
}
