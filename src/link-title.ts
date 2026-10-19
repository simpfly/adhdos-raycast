import { environment } from '@raycast/api';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function linkURL(content: string): string | null {
  try {
    const url = new URL(content.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
function clean(value: string) {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, name: string) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[name.toLowerCase()] || ''))
    .replace(/\s+/g, ' ').trim().slice(0, 300);
}
export function htmlTitle(html: string): string | null {
  // Ignore markup-looking strings inside scripts/comments.
  html = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const titles = new Map<string,string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs: Record<string,string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (attrs.content) titles.set(key, clean(attrs.content));
  }
  return titles.get('og:title') || titles.get('twitter:title') || clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '') || null;
}
export function htmlImage(html: string, base: string): string | null {
  html = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const images = new Map<string,string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs: Record<string,string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    if (attrs.content) images.set((attrs.property || attrs.name || '').toLowerCase(), attrs.content.replace(/&amp;/g, '&'));
  }
  const image = images.get('og:image') || images.get('twitter:image');
  try { return image ? linkURL(new URL(image,base).href) : null; } catch { return null; }
}
export async function cachedImage(content: string): Promise<string | null> {
  const url = linkURL(content); if (!url) return null;
  try { const data = JSON.parse(await readFile(cacheFile(url), 'utf8')); return typeof data.image === 'string' ? linkURL(data.image) : null; } catch { return null; }
}
const cacheFile = (url: string) => path.join(environment.supportPath, 'link-titles', createHash('sha256').update(url).digest('hex') + '.json');
export async function cachedTitle(content: string): Promise<string | null> {
  const url = linkURL(content); if (!url) return null;
  try { const data = JSON.parse(await readFile(cacheFile(url), 'utf8')); return typeof data.title === 'string' ? data.title : null; } catch { return null; }
}
const inFlight = new Map<string, Promise<string | null>>();
export async function resolveTitle(content: string): Promise<string | null> {
  const url = linkURL(content); if (!url) return null;
  const cached = await cachedTitle(url); if (cached) return cached;
  const existing = inFlight.get(url); if (existing) return existing;
  const job = (async () => {
    try {
      const signal = AbortSignal.timeout(8000);
      let title: string | null = null;
      let image: string | null = null;
      const parsed = new URL(url);
      const bvid = parsed.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1];
      if ((parsed.hostname === 'bilibili.com' || parsed.hostname.endsWith('.bilibili.com')) && bvid) {
        try {
          const response = await fetch(`https://adhdos.app/api/bilibili-proxy/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {signal});
          if (response.ok) { const data = await response.json(); if (data.code === 0 && typeof data.data?.title === 'string') { title = clean(data.data.title); if (typeof data.data.pic === 'string') image = linkURL(data.data.pic.replace(/^http:/, 'https:')); } }
        } catch { /* Fall back to the page title. */ }
      }
      if (!title) {
        const response = await fetch(url, {signal, headers:{Accept:'text/html', 'User-Agent':'Mozilla/5.0 (compatible; ADHDOS Raycast)'}, redirect:'follow'});
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
        const reader = response.body?.getReader(); if (!reader) return null;
        const decoder = new TextDecoder(); let html = '', size = 0;
        try {
          while (size < 524288) {
            const {done,value} = await reader.read(); if (done) break;
            size += value.length; html += decoder.decode(value, {stream:true});
            if (/<\/head\s*>/i.test(html)) break;
          }
        } finally { await reader.cancel(); }
        title = htmlTitle(html);
        image = htmlImage(html, response.url || url);
      }
      if (!title) return null;
      try { await mkdir(path.dirname(cacheFile(url)), {recursive:true,mode:0o700}); await writeFile(cacheFile(url), JSON.stringify({title,image}), {mode:0o600}); } catch { /* Title display must not depend on disk availability. */ }
      return title;
    } catch { return null; }
  })();
  inFlight.set(url, job);
  try { return await job; } finally { inFlight.delete(url); }
}
