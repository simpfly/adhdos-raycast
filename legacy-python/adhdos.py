#!/usr/bin/env python3
# @raycast.schemaVersion 1
# @raycast.title ADHDOS
# @raycast.mode fullOutput
# @raycast.packageName ADHDOS
# @raycast.icon 🧠
# @raycast.argument1 {"type":"dropdown","placeholder":"操作","data":[{"title":"查看 Board","value":"view-board"},{"title":"添加 Board","value":"add-board"},{"title":"查看 BrainDump","value":"view-braindump"},{"title":"添加 BrainDump","value":"add-braindump"},{"title":"配置 API 密钥","value":"setup"}]}
# @raycast.argument2 {"type":"text","placeholder":"新增内容 / 搜索关键词","optional":true}
# @raycast.description 查看和添加 Board、BrainDump，首次使用请选择配置 API 密钥
"""ADHDOS Raycast transport. Python standard library only."""
import fcntl
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = 'https://adhdos.app/api/v1'
SERVICE = 'app.adhdos.raycast'
STATE = Path.home() / 'Library/Application Support/ADHDOS Raycast'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def token():
    result = subprocess.run(['/usr/bin/security', 'find-generic-password', '-s', SERVICE,
                             '-a', 'api', '-w'], capture_output=True, text=True)
    if result.returncode:
        raise ValueError('请先运行 ADHDOS · 配置 API 密钥。')
    return result.stdout.strip()


def setup():
    result = subprocess.run(['/usr/bin/osascript', '-e',
        'text returned of (display dialog "粘贴 ADHDOS 设置 → MCP / API → API 中的访问密钥" default answer "" with hidden answer buttons {"取消", "保存"} default button "保存" with title "ADHDOS Raycast")'],
        capture_output=True, text=True)
    if result.returncode:
        print('已取消配置。')
        return
    secret = result.stdout.strip()
    if not re.fullmatch(r'adhdos_[a-f0-9]{64}', secret):
        raise ValueError('密钥格式不正确，请复制完整的 ADHDOS API 密钥。')
    result = subprocess.run(['/usr/bin/security', 'add-generic-password', '-U', '-s',
                             SERVICE, '-a', 'api', '-w', secret], capture_output=True)
    if result.returncode:
        raise ValueError('无法保存到 macOS 钥匙串。')
    print('已保存 API 密钥，可以运行查看和添加命令。')


def request(path, secret, operation=None):
    headers = {'Authorization': 'Bearer ' + secret, 'Accept': 'application/json'}
    body = None
    if operation:
        headers.update({'Content-Type': 'application/json', 'Idempotency-Key': operation['id']})
        body = json.dumps(operation['body'], ensure_ascii=False).encode()
    req = urllib.request.Request(BASE + path, data=body, headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=25) as response:
        return json.load(response)


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def add(kind, content, secret):
    content = content.strip()
    limit = 10000 if kind == 'board' else 5000
    if not content or len(content.encode('utf-16-le')) // 2 > limit:
        raise ValueError(f'请输入 1–{limit} 字符的内容。')
    body = {'content': content} if kind == 'board' else {'text': content, 'partition': 'brain-dump-primary'}
    path = '/board-items' if kind == 'board' else '/tasks'
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    pending = STATE / (kind + '-pending.json')
    with (STATE / (kind + '.lock')).open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if pending.exists():
            operation = json.loads(pending.read_text())
            if operation.get('credential') != hashlib.sha256(secret.encode()).hexdigest():
                raise ValueError('密钥已变更，请先在 ADHDOS 核对上次添加结果并处理待确认记录。')
            if operation['body'] != body:
                raise ValueError('上次添加结果尚未确认。请用原内容再次运行以安全重试；详见 README。')
            if time.time() - operation['created'] > 6 * 86400:
                raise ValueError('待确认请求已接近重试期限，请先在 ADHDOS 核对，勿直接重复添加。')
        else:
            operation = {'id': str(uuid.uuid4()), 'created': time.time(), 'body': body, 'credential': hashlib.sha256(secret.encode()).hexdigest()}
            write_json(pending, operation)
        try:
            result = request(path, secret, operation)
            item = result.get('item' if kind == 'board' else 'task')
            if not isinstance(item, dict) or 'id' not in item:
                raise ValueError('保存结果尚未确认，请使用原内容再次运行。')
        except urllib.error.HTTPError as error:
            if error.code in (400, 401, 403, 404, 409, 413, 415, 428, 429):
                pending.unlink()
            raise
        pending.unlink()
    print('✓ 已添加到 ' + ('Board' if kind == 'board' else 'BrainDump') + '\n' + content)


def show(kind, query, secret):
    if kind == 'board':
        params = {'limit': 200, 'includeFullContent': 'true', 'sort': 'recent'}
        if query.strip():
            params['query'] = query.strip()
        data = request('/board-items?' + urllib.parse.urlencode(params), secret)
        items = data['items']
        print(f'Board · {len(items)} 条（最多最近 200 条）\n')
        for item in items:
            print('• ' + str(item.get('title') or item.get('content', '')))
            if item.get('title') and item.get('content') != item['title']:
                print('  ' + str(item.get('content', '')).replace('\n', '\n  '))
            for thought in item.get('thoughts') or []:
                print('  ↳ ' + str(thought.get('content', '')).replace('\n', '\n    '))
            print()
    else:
        items, offset = [], 0
        while True:
            data = request('/tasks?' + urllib.parse.urlencode({'done': 'false', 'limit': 500, 'offset': offset}), secret)
            items.extend(data['tasks'])
            next_offset = data.get('nextOffset')
            if next_offset is None:
                break
            if not isinstance(next_offset, int) or next_offset <= offset:
                raise ValueError('服务端分页结果异常，请稍后重试。')
            offset = next_offset
        query = query.strip().casefold()
        items = [item for item in items if query in str(item.get('text', '')).casefold()]
        print(f'BrainDump · {len(items)} 件未完成事项（两个分区）\n')
        for item in items:
            due = f" · {item['dueDate']}" if item.get('dueDate') else ''
            print('□ ' + str(item.get('text', '')) + due)
            for sub in item.get('subtasks') or []:
                print(('  ✓ ' if sub.get('done') else '  □ ') + str(sub.get('text', '')))
            print()
    if not items:
        print('没有符合条件的内容。')


def main():
    try:
        command = sys.argv[1] if len(sys.argv) > 1 else 'view-board'
        commands = {'view-board': ('show', 'board'), 'add-board': ('add', 'board'),
                    'view-braindump': ('show', 'brain'), 'add-braindump': ('add', 'brain'),
                    'setup': ('setup', None)}
        if command not in commands:
            raise ValueError('请从下拉菜单选择操作。')
        action, kind = commands[command]
        if action == 'setup':
            setup()
            return
        content = sys.argv[2] if len(sys.argv) > 2 else ''
        secret = token()
        if action == 'add':
            add(kind, content, secret)
        else:
            show(kind, content, secret)
    except urllib.error.HTTPError as error:
        messages = {401: '密钥无效，请重新配置。', 403: '需要有效 Pro 订阅。',
                    409: '写入冲突或尚无云同步数据，请在 ADHDOS 中检查。', 429: '请求频繁，请一分钟后重试。'}
        print(messages.get(error.code, f'API 请求失败（{error.code}）。如正在添加，请用原内容重试。'))
        sys.exit(1)
    except (urllib.error.URLError, TimeoutError, OSError):
        print('连接或本地存储失败。如正在添加，请使用原内容再次运行，避免重复添加。')
        sys.exit(1)
    except (ValueError, KeyError, TypeError) as error:
        print(str(error))
        sys.exit(1)


if __name__ == '__main__':
    main()
