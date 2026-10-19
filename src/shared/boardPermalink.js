// Only IDs travel in links. Board content continues to use private local/synced storage.
export function appOrigin(location = window.location) {
    return ['http:', 'https:'].includes(location.protocol) ? location.origin : 'https://adhdos.app';
}

export function buildBoardPermalink(id, location = window.location) {
    return new URL(`/board/${encodeURIComponent(String(id))}`, appOrigin(location)).href;
}

// Stable storage identity is independent of public routes and domains.
export function buildBoardReference(id) {
    return `adhdos://board/${encodeURIComponent(String(id)).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export function readBoardPermalink(location = window.location) {
    const match = location.pathname?.match(/^\/board\/([^/]+)\/?$/);
    if (match) {
        try { return decodeURIComponent(match[1]); } catch { return null; }
    }
    return null;
}

export function getBoardReferenceId(href, location = window.location) {
    if (typeof href !== 'string' || !href.trim()) return null;
    try {
        const url = new URL(href, appOrigin(location));
        if (url.protocol === 'adhdos:' && url.hostname === 'board' && !url.username && !url.password && !url.port && /^\/[^/]+\/?$/.test(url.pathname)) {
            return decodeURIComponent(url.pathname.replace(/^\/|\/$/g, ''));
        }

        if (!['http:', 'https:'].includes(url.protocol)) return null;
        if (url.origin !== appOrigin(location) && !['adhdos.app', 'www.adhdos.app'].includes(url.hostname)) return null;
        if (!/^\/board\/[^/]+\/?$/.test(url.pathname)) return null;
        return readBoardPermalink(url);
    } catch { return null; }
}

export function boardItemTitle(item, fallback = 'Board') {
    const title = item?.title || item?.metadata?.title || item?.filename;
    const content = item?.type === 'text' ? item.content : '';
    return String(title || content || fallback).split('\n').find(line => line.trim())
        ?.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim().slice(0, 120) || fallback;
}

export function buildTaskPermalink(id, location = window.location) {
    const url = new URL('/brain-dump', appOrigin(location));
    url.searchParams.set('task', String(id));
    return url.href;
}

export function getTaskBoardIds(task) {
    const ids = Array.isArray(task?.boardItemIds) ? task.boardItemIds.map(String) : [];
    for (const match of (task?.text || '').matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
        const id = getBoardReferenceId(match[1]);
        if (id) ids.push(id);
    }
    for (const subtask of task?.subtasks || []) ids.push(...getTaskBoardIds(subtask));
    return [...new Set(ids)];
}

export function updateTaskBoardLink(task, itemId, linked) {
    const ids = getTaskBoardIds(task).filter(id => id !== String(itemId));
    if (linked) ids.push(String(itemId));
    return { ...task, boardItemIds: ids, updatedAt: new Date().toISOString() };
}
