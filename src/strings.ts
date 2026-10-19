// Raycast owns typography and controls; localized labels are kept separate from views.
const messages = {
 zh: {capture:'粘贴内容',captureContent:'文本或链接',capturePlaceholder:'粘贴文字或链接…',captureDestination:'添加到',captureNext:'继续添加',captureEmpty:'请粘贴文字或链接',captureReadError:'无法读取剪贴板，请直接粘贴',captureHint:'Board 保存为一条内容；BrainDump 支持主事项和缩进子任务，保留子任务勾选状态。',openTaskItem:'打开事项独立页面',copyTaskLink:'复制事项独立链接',openBoardItem:'在 ADHDOS 打开此条 Board',copyBoardLink:'复制 Board 独立链接',openContentLink:'打开内容链接',moreLinks:'其他链接',initialThought:'收藏想法',thoughtPlaceholder:'为什么收藏？可留空',thoughtLimit:'想法最多 10000 字符',copyAll:'复制内容与想法',tabsUnavailable:'分区加载失败，可手动输入分区名称'},
 en: {capture:'Paste Content',captureContent:'Text or Link',capturePlaceholder:'Paste text or a link…',captureDestination:'Add To',captureNext:'Continue',captureEmpty:'Paste text or a link first',captureReadError:'Could not read the clipboard. Paste manually.',captureHint:'Board saves one item. BrainDump supports tasks with indented subtasks and preserves checked subtasks.',openTaskItem:'Open Task Page',copyTaskLink:'Copy Task Permalink',openBoardItem:'Open Board Item in ADHDOS',copyBoardLink:'Copy Board Permalink',openContentLink:'Open Content Link',moreLinks:'More Links',initialThought:'Initial Thought',thoughtPlaceholder:'Why save this? Optional',thoughtLimit:'Thoughts must be at most 10,000 characters',copyAll:'Copy Content and Thoughts',tabsUnavailable:'Could not load sections. Enter a section name manually.'}
};
export function t(key:keyof typeof messages.zh):string {
 const locale=Intl.DateTimeFormat().resolvedOptions().locale;
 return messages[locale.startsWith('zh')?'zh':'en'][key];
}
