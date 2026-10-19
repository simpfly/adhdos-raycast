declare module '*shared/boardPermalink.js' {
  export function buildBoardPermalink(id:string|number, location?:{protocol:string;origin:string}):string;
  export function buildTaskPermalink(id:string|number, location?:{protocol:string;origin:string}):string;
}
