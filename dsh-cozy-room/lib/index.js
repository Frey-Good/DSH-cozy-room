import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-cozy-room';
export const inject = [];

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

function resolveRoot() {
  const here = (p) => p && fs.existsSync(path.join(p, 'index.html'));
  const candidates = [
    process.env.DSH_COZY_ROOM_DIR,
    path.join(PKG_ROOT, 'room'),
  ].filter(Boolean);
  return candidates.find(here) || candidates[0];
}

export function apply(ctx) {
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
      const localOrigin = origin === 'null' || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin || '');
      const cors = {
        'Cache-Control': 'no-store',
        ...(origin && localOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      };

      if (file === '/health.json' || file === '/health') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ app: 'dsh-cozy-room', build: BUILD_ID, port: server.address()?.port ?? null }));
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
      res.writeHead(500);
      res.end(String(error));
    }
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
