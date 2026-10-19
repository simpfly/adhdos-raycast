import {Action} from '@raycast/api';
import type {Item,Kind} from './api';
import {itemPermalink} from './item-permalink';
import {t} from './strings';
export function PermalinkActions({kind,item}:{kind:Kind;item:Pick<Item,'id'>}) {
 const url=itemPermalink(kind,item);
 return <>
  <Action.OpenInBrowser title={t(kind==='board'?'openBoardItem':'openTaskItem')} url={url} shortcut={{modifiers:['cmd','shift'],key:'o'}}/>
  <Action.CopyToClipboard title={t(kind==='board'?'copyBoardLink':'copyTaskLink')} content={url}/>
 </>;
}
