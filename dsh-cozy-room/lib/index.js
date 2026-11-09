import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBirth, fallbackSeed, seedPrompt } from './identity.js';

export const name = 'dsh-cozy-room';
export const inject = ['llm', 'agentDefaultModel'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 8140;
const BUILD_ID = 'dsh-cozy-room:1.1.0';
const PORT_SCAN = 12;
const DATA_DIR = process.env.DSH_COZY_ROOM_DATA || path.join(os.homedir(), '.dsh', 'cozy-room');
const IDENTITY_FILE = path.join(DATA_DIR, 'identity.json');
const SELF_FILE = path.join(DATA_DIR, 'self.md');

function readIdentity() {
  try { return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8')); } catch { return null; }
}

function writeIdentity(identity) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), 'utf8');
  const lines = [
    '# 我是谁',
    '',
    `出生：${identity.birthday}（${identity.sign}，${identity.animal}年）`,
    `八字：${identity.bazi.text}`,
    '',
    '最初的样子：',
    ...identity.traits.map((t) => `- ${t}`),
    '',
    identity.line,
    '',
    '> 这只是开始，会被之后经历的事改写。',
  ];
  fs.writeFileSync(SELF_FILE, lines.join('\n'), 'utf8');
}

function streamText(chunk, out) {
  if (!chunk || typeof chunk !== 'object') return;
  if (typeof chunk.text === 'string') out.push(chunk.text);
  if (Array.isArray(chunk.blocks)) {
    for (const b of chunk.blocks) if (b && b.type === 'text' && typeof b.text === 'string') out.push(b.text);
  }
}

async function llmSeed(ctx, birth) {
  try {
    const llm = ctx.llm;
    if (!llm || typeof llm.stream !== 'function') return null;
    const sel = ctx.agentDefaultModel && ctx.agentDefaultModel.currentSelection ? ctx.agentDefaultModel.currentSelection() : null;
    if (!sel || !sel.provider || !sel.model) return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    const out = [];
    try {
      for await (const chunk of llm.stream({
        provider: sel.provider,
        model: sel.model,
        sessionId: 'dsh-cozy-room:identity',
        system: '',
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: seedPrompt(birth) }],
          source: { kind: 'user' },
        }],
        temperature: 1,
        reasoningEffort: 'off',
        signal: ac.signal,
      })) streamText(chunk, out);
    } finally {
      clearTimeout(timer);
    }
    const raw = out.join('').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed.traits) || parsed.traits.length === 0) return null;
    return {
      traits: parsed.traits.map((t) => String(t).slice(0, 24)).slice(0, 6),
      line: String(parsed.line || '').slice(0, 60),
      source: 'llm',
    };
  } catch (error) {
    ctx.logger?.warn?.('[dsh-cozy-room] identity seed failed: ' + (error && error.message));
    return null;
  }
}

function readSelfText() {
  try { return fs.readFileSync(SELF_FILE, 'utf8'); } catch { return ''; }
}

function timeLine() {
  const now = new Date();
  const h = now.getHours();
  const slot = h >= 23 ? '深夜' : h >= 19 ? '晚上' : h >= 17 ? '傍晚' : h >= 13 ? '下午' : h >= 11 ? '中午' : h >= 9 ? '上午' : h >= 7 ? '早上' : h >= 5 ? '清晨' : '凌晨';
  return `${now.getMonth() + 1}月${now.getDate()}日 ${slot} ${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function chatReply(ctx, body) {
  const llm = ctx.llm;
  if (!llm || typeof llm.stream !== 'function') return { ok: false, reason: 'llm-missing' };
  const sel = ctx.agentDefaultModel && ctx.agentDefaultModel.currentSelection ? ctx.agentDefaultModel.currentSelection() : null;
  if (!sel || !sel.provider || !sel.model) return { ok: false, reason: 'model-missing' };

  const selfText = readSelfText();
  const mem = Array.isArray(body.memories) ? body.memories.slice(0, 10).map((x) => String(x).slice(0, 80)) : [];
  const recent = Array.isArray(body.recent) ? body.recent.slice(-6).map((x) => String(x).slice(0, 60)) : [];
  const system = [
    selfText || '我是一个刚住进这个房间的人，还在认识自己。',
    '',
    '说话规则：用第一人称，像日常聊天，1–2 句，40 字以内；不写动作描写，不用括号，不提“人设/设定”。',
    `现在：${timeLine()}${body.state ? '；' + body.state : ''}`,
    mem.length ? '我记得：\n- ' + mem.join('\n- ') : '',
    recent.length ? '最近聊过：\n' + recent.join('\n') : '',
  ].filter(Boolean).join('\n');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  const out = [];
  try {
    for await (const chunk of llm.stream({
      provider: sel.provider,
      model: sel.model,
      sessionId: 'dsh-cozy-room:chat',
      system,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: String(body.text || '').slice(0, 500) }],
        source: { kind: 'user' },
      }],
      temperature: 1,
      reasoningEffort: 'off',
      signal: ac.signal,
    })) streamText(chunk, out);
  } catch (error) {
    return { ok: false, reason: 'generate-error', message: String(error && error.message) };
  } finally {
    clearTimeout(timer);
  }
  const text = out.join('').trim().replace(/^["“]|["”]$/g, '');
  if (!text) return { ok: false, reason: 'empty' };
  return { ok: true, text: text.slice(0, 120) };
}

async function ensureIdentity(ctx) {
  const cached = readIdentity();
  if (cached) return cached;
  let when = new Date();
  try {
    if (process.env.DSH_COZY_ROOM_BIRTHDAY) when = new Date(process.env.DSH_COZY_ROOM_BIRTHDAY);
    else {
      const raw = fs.readFileSync(path.join(DATA_DIR, 'birthday.txt'), 'utf8').trim();
      if (raw) when = new Date(raw);
    }
  } catch {}
  const birth = computeBirth(when);
  let seed = await llmSeed(ctx, birth);
  if (!seed) seed = fallbackSeed(birth.sign, birth.animal);
  const identity = { ...birth, ...seed, createdAt: Date.now() };
  writeIdentity(identity);
  return identity;
}

function resolveRoot() {
  const here = (p) => p && fs.existsSync(path.join(p, 'index.html'));
  const candidates = [
    process.env.DSH_COZY_ROOM_DIR,
    path.join(PKG_ROOT, 'room'),
  ].filter(Boolean);
  return candidates.find(here) || candidates[0];
}

export function apply(ctx) {
  // One server per process: a reload must not leak the previous listener.
  try {
    if (globalThis.__dshCozyRoomServer) {
      globalThis.__dshCozyRoomServer.close();
      globalThis.__dshCozyRoomServer = null;
    }
  } catch {}
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'host-debug.json'), JSON.stringify({
      llm: typeof ctx.llm,
      model: typeof ctx.agentDefaultModel,
      keys: Object.keys(ctx).slice(0, 80),
      ts: Date.now(),
    }, null, 2));
  } catch {}
  const root = resolveRoot();
  const preferredPort = Number(process.env.DSH_COZY_ROOM_PORT || DEFAULT_PORT);

  if (!root || !fs.existsSync(path.join(root, 'index.html'))) {
    ctx.logger?.warn?.('[dsh-cozy-room] room not found. Set DSH_COZY_ROOM_DIR or ship the room/ folder.');
    return;
  }

  let workState = 'idle';
  let lastActivity = 0;
  let events = 0;
  let idleTimer = null;

  function setWorkState(next) {
    workState = next;
    lastActivity = Date.now();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (next === 'success' || next === 'error') {
      idleTimer = setTimeout(() => {
        workState = 'idle';
        idleTimer = null;
      }, 4200);
      idleTimer.unref?.();
    }
  }

  const bus = ctx.root && ctx.root !== ctx ? ctx.root : ctx;

  const off = (bus.on || ctx.on)?.('session/event', (session, event) => {
    events += 1;
    const type = event && event.type;
    if (!type) return;
    if (type === 'turn/start') setWorkState('thinking');
    else if (type === 'tool/call' || type === 'tool/result') setWorkState('working');
    else if (type === 'approval/asked') setWorkState('waiting');
    else if (type === 'assistant/message') setWorkState('working');
    else if (type === 'turn/end') {
      const reason = event.data && event.data.reason && event.data.reason.kind;
      setWorkState(reason === 'completed' ? 'success' : 'error');
    }
  });

  const guard = setInterval(() => {
    if (workState !== 'idle' && Date.now() - lastActivity > 120000) {
      setWorkState('idle');
    }
  }, 5000);
  guard.unref?.();

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const file = decodeURIComponent(url.pathname);

      // Only local pages may read the API/room (file:// -> Origin: null).
      const origin = req.headers.origin;
      const localOrigin = origin === 'null' || /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?|dsh-app:\/\/[^/]*|app:\/\/[^/]*)$/.test(origin || '');
      const cors = {
        'Cache-Control': 'no-store',
        ...(origin && localOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      };

      if (file === '/health.json' || file === '/health') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ app: 'dsh-cozy-room', build: BUILD_ID, port: server.address()?.port ?? null }));
        return;
      }

      if (file === '/identity/debug') {
        let info = {};
        try {
          info = {
            llm: typeof ctx.llm,
            model: typeof ctx.agentDefaultModel,
            selection: (ctx.agentDefaultModel && ctx.agentDefaultModel.currentSelection) ? ctx.agentDefaultModel.currentSelection() : null,
          };
        } catch (error) {
          info = { error: String(error && error.message) };
        }
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(info));
        return;
      }

      if (file === '/chat' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
        req.on('end', () => {
          let body = {};
          try { body = JSON.parse(raw || '{}'); } catch (e) {}
          chatReply(ctx, body)
            .then((result) => {
              if (res.writableEnded || res.headersSent) return;
              res.writeHead(result.ok ? 200 : 502, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(result));
            })
            .catch((error) => {
              if (res.writableEnded || res.headersSent) return;
              res.writeHead(500, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false, reason: String(error && error.message) }));
            });
        });
        return;
      }

      if (file === '/identity.json' || file === '/identity') {
        ensureIdentity(ctx)
          .then((identity) => {
            if (res.writableEnded || res.headersSent) return;
            res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(identity));
          })
          .catch((error) => {
            if (res.writableEnded || res.headersSent) return;
            res.writeHead(500, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: String(error && error.message) }));
          });
        return;
      }

      if (file === '/status.json' || file === '/status') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ working: workState !== 'idle', state: workState, events, ts: Date.now() }));
        return;
      }

      const target = file === '/' || file === '' ? '/index.html' : file;
      const full = path.resolve(root, '.' + target);
      if (full !== root && !full.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { ...cors, 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    } catch (error) {
      try {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        if (!res.writableEnded) res.end(String(error && error.message ? error.message : error));
      } catch { /* the socket may already be gone */ }
    }
  });

  server.on('clientError', (error, socket) => {
    try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* ignore */ }
  });

  const listen = (port) =>
    new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });

  (async () => {
    for (let i = 0; i < PORT_SCAN; i += 1) {
      const port = preferredPort + i;
      try {
        await listen(port);
        globalThis.__dshCozyRoomServer = server;
        ctx.logger?.info?.(`[dsh-cozy-room] serving ${root} at http://127.0.0.1:${port}`);
        return;
      } catch (error) {
        if (error && error.code !== 'EADDRINUSE') {
          ctx.logger?.warn?.(`[dsh-cozy-room] listen failed on ${port}: ${error.message}`);
        }
      }
    }
    ctx.logger?.warn?.(`[dsh-cozy-room] no free port in ${preferredPort}..${preferredPort + PORT_SCAN - 1}`);
  })();

  ctx.on('dispose', () => {
    try { if (typeof off === 'function') off(); } catch {}
    try { clearInterval(guard); } catch {}
    try { server.close(); } catch {}
  });
}
