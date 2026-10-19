import {buildBoardPermalink,buildTaskPermalink} from './shared/boardPermalink.js';
import type {Item,Kind} from './api';
export function itemPermalink(kind:Kind,item:Pick<Item,'id'>):string {
 const origin={protocol:'https:',origin:'https://adhdos.app'};
 return kind==='board'?buildBoardPermalink(item.id,origin):buildTaskPermalink(item.id,origin);
}
