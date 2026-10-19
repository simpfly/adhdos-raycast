import type { Item } from './api';
export const mediaLabels = { all:'全部媒介', text:'纯文字', link:'链接', image:'图片', video:'视频', music:'音乐' } as const;
export type Medium = keyof typeof mediaLabels;
export function partitionOf(item: Item) { return (item.tab || item.partition || '').trim(); }
export function mediaOf(item: Item): Exclude<Medium,'all'> {
  if (item.type === 'image') return 'image';
  if (item.type === 'video') return 'video';
  if (item.type === 'audio' || item.type === 'music') return 'music';
  const match = (item.url || item.content || '').match(/https?:\/\/[^\s<>]+/i);
  if (!match) return item.type === 'link' ? 'link' : 'text';
  try {
    const url = new URL(match[0]);
    const host = url.hostname.toLowerCase();
    const at = (domain: string) => host === domain || host.endsWith('.'+domain);
    if (['music.163.com','163cn.tv','y.qq.com','music.apple.com','open.spotify.com','soundcloud.com'].some(at) || /\.(mp3|m4a|wav|flac|ogg)$/i.test(url.pathname)) return 'music';
    if (['bilibili.com','b23.tv','youtube.com','youtu.be','vimeo.com','douyin.com'].some(at) || /\.(mp4|webm|mov|m3u8)$/i.test(url.pathname)) return 'video';
    if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname)) return 'image';
    return 'link';
  } catch { return 'text'; }
}
export function matchesBoard(item: Item, partition: string | null, medium: Medium) {
  if (partition !== null && partitionOf(item) !== partition) return false;
  // Links includes video/music/image URLs as well as ordinary web pages.
  if (medium === 'link') return !!(item.url || item.content || '').match(/https?:\/\//i) || item.type === 'link';
  return medium === 'all' || mediaOf(item) === medium;
}
