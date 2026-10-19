import { environment, getPreferenceValues } from '@raycast/api';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const MAX_BYTES = 15 * 1024 * 1024;
const TTL = 7 * 86400000;
export interface LocalImage { preview: string; thumbnail: string }
const active = new Map<string, Promise<LocalImage>>();
function directory(identity: string) {
  const secret = getPreferenceValues<{apiKey:string}>().apiKey.trim();
  const digest = createHash('sha256').update(JSON.stringify([secret,identity])).digest('hex');
  return path.join(environment.supportPath, 'image-cache', digest);
}
export async function cachedLocalImage(identity: string): Promise<LocalImage | null> {
  const dir = directory(identity);
  try {
    const metadata = JSON.parse(await readFile(path.join(dir,'ready.json'),'utf8'));
    if (Date.now() - metadata.created > TTL) return null;
    const result = {preview:path.join(dir,'preview.png'),thumbnail:path.join(dir,'thumbnail.png')};
    await Promise.all([stat(result.preview),stat(result.thumbnail)]);
    return result;
  } catch { return null; }
}
export async function localImage(identity: string, source: () => Promise<string>, force = false): Promise<LocalImage> {
  const dir = directory(identity);
  const existing = active.get(dir); if (existing) return existing;
  const job = (async () => {
    if (!force) { const cached = await cachedLocalImage(identity); if (cached) return cached; }
    const url = await source();
    let bytes: Buffer;
    if (url.startsWith('data:image/')) {
      if (url.length > MAX_BYTES * 1.4) throw Error('图片过大');
      bytes = Buffer.from(url.split(',')[1] || '', 'base64');
    } else {
      if (!/^https?:\/\//i.test(url)) throw Error('不支持的图片地址');
      const response = await fetch(url,{signal:AbortSignal.timeout(15000)});
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error('图片暂时无法加载');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw Error('图片过大'); }
      const reader = response.body?.getReader(); if (!reader) throw Error('图片为空');
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) throw Error('图片过大'); chunks.push(value); }
      } finally { await reader.cancel(); }
      bytes = Buffer.concat(chunks);
    }
    if (!bytes.length || bytes.length > MAX_BYTES) throw Error('图片为空或过大');
    const temporary = dir + '-' + randomUUID();
    await mkdir(temporary,{recursive:true,mode:0o700});
    try {
      const input = path.join(temporary,'original');
      await writeFile(input,new Uint8Array(bytes),{mode:0o600});
      // Decode once into bounded raster previews; never hand full-size originals to List icons.
      await run('/usr/bin/sips',['-s','format','png','-Z','1280',input,'--out',path.join(temporary,'preview.png')],{timeout:15000});
      await run('/usr/bin/sips',['-Z','64',path.join(temporary,'preview.png'),'--out',path.join(temporary,'thumbnail.png')],{timeout:10000});
      await rm(input);
      await writeFile(path.join(temporary,'ready.json'),JSON.stringify({created:Date.now()}),{mode:0o600});
      await rm(dir,{recursive:true,force:true});
      await rename(temporary,dir);
      return {preview:path.join(dir,'preview.png'),thumbnail:path.join(dir,'thumbnail.png')};
    } finally { await rm(temporary,{recursive:true,force:true}); }
  })();
  active.set(dir,job);
  try { return await job; } finally { active.delete(dir); }
}
export async function pruneImageCache() {
  const root = path.join(environment.supportPath,'image-cache');
  try {
    const entries = await Promise.all((await readdir(root)).map(async name => {
      const dir = path.join(root,name);
      try { const files = await Promise.all(['preview.png','thumbnail.png','ready.json'].map(file => stat(path.join(dir,file)))); return {dir,time:files[2].mtimeMs,size:files.reduce((n,f)=>n+f.size,0)}; } catch { return null; }
    }));
    let total = 0;
    for (const entry of entries.filter((entry): entry is NonNullable<typeof entry> => !!entry).sort((a,b)=>b.time-a.time)) {
      total += entry.size;
      if (Date.now()-entry.time > TTL || total > 200*1024*1024) await rm(entry.dir,{recursive:true,force:true});
    }
  } catch { /* Cache cleanup must not block browsing. */ }
}
