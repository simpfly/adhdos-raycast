import {Action,ActionPanel} from '@raycast/api';
import type {Item} from './api';
import {boardLinks} from './board-content';
import {PermalinkActions} from './permalink-actions';
import {t} from './strings';
// Native actions shared by list, saved detail and image detail.
export function BoardLinkActions({item}:{item:Item}) {
 const links=boardLinks(item);

 return <>
  {links.length>0&&<Action.OpenInBrowser title={t('openContentLink')} url={links[0]} shortcut={{modifiers:['cmd'],key:'o'}}/>}
  <PermalinkActions kind="board" item={item}/>
  {links.length>1&&<ActionPanel.Submenu title={t('moreLinks')}>{links.slice(1).map(url=><Action.OpenInBrowser key={url} title={url} url={url}/>)}</ActionPanel.Submenu>}
 </>;
}
