import {itemPermalink} from "./item-permalink";
import type {Item} from "./api";
export function boardPermalink(item:Pick<Item,"id">):string {return itemPermalink("board",item);}
