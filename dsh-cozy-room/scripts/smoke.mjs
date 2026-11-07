// Headless smoke test for dsh-cozy-room. No deps (needs Node >= 22 for global WebSocket).
//
//   node scripts/smoke.mjs                                  # default: host on 8140
//   node scripts/smoke.mjs http://127.0.0.1:8000/?embed=1  # standalone python http.server
//
// Optional env: CDP_PORT (default 9333), SMOKE_WAIT (default 7000 ms).
// Asserts: boot, furniture count, action library, no forced sleep, work-state linkage,
// and collects console/exception errors. Exit code 1 when a hard assertion fails.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const BROWSER = CANDIDATES.find((p) => fs.existsSync(p));
const PORT = Number(process.env.CDP_PORT || 9333);
const WAIT = Number(process.env.SMOKE_WAIT || 7000);
const TARGET = process.argv[2] || 'http://127.0.0.1:8140/?embed=1';
const TARGET_ORIGIN = new URL(TARGET).origin;
const profile = path.join(os.tmpdir(), 'cozy-room-smoke-' + process.pid);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!BROWSER) {
  console.error('No Edge/Chrome found. Edit CANDIDATES in this script.');
  process.exit(1);
}

const browser = spawn(BROWSER, [
  '--headless=new', '--no-sandbox', '--hide-scrollbars', '--disable-gpu-sandbox',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1400,900', TARGET,
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); }
    }, 12000);
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text };
  return r.result.value;
}

let failed = false;
try {
  let targets = [];
  for (let i = 0; i < 30; i += 1) {
    await sleep(500);
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch {}
    if (targets.some((t) => t.type === 'page' && t.url.startsWith(TARGET_ORIGIN))) break;
  }
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith(TARGET_ORIGIN));
  if (!page) throw new Error('no page target: ' + JSON.stringify(targets.map((t) => t.url)));

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails?.text + ' ' + (msg.params.exceptionDetails?.exception?.description || ''));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(WAIT);

  const scene = await evaluate(`(function(){
    if (!window.__purpleRoom) return { booted:false };
    const p = window.__purpleRoom, c = document.querySelector('#scene');
    return { booted:true, items:p.items, library:p.library, clip:p.clip, sleeping:p.sleeping,
      petPos:p.petPos, cat:p.cat, visible:p.visible, night:p.night,
      canvas: c ? [c.width,c.height] : null, embed: document.body.classList.contains('embed'),
      actionLibCount: (window.PR && PR.actionLibrary) ? PR.actionLibrary.length : null };
  })()`);

  // Work-state linkage: sample fast. 'scared' finishes quickly and status.json
  // (1.5s poll) resets workState to idle, so a late sample will always read 'idle'.
  await evaluate(`window.__purpleRoom && __purpleRoom.work('error')`);
  await sleep(150);
  const workClip = await evaluate(`window.__purpleRoom ? __purpleRoom.clip : null`);

  const checks = {
    booted: scene.booted === true,
    canvas: Array.isArray(scene.canvas) && scene.canvas[0] > 0,
    furniture: scene.items > 0,
    library109: scene.library === 109,
    notForcedSleep: scene.sleeping === false,
    workLinkage: workClip === 'scared',
    noConsoleErrors: errors.length === 0,
  };
  failed = Object.values(checks).some((v) => !v);

  console.log(JSON.stringify({ url: page.url, checks, scene, workClip, errors: errors.slice(0, 12) }, null, 2));
  console.log(failed ? '\nSMOKE FAILED' : '\nSMOKE OK');
} catch (error) {
  failed = true;
  console.log(JSON.stringify({ fatal: String(error), errors: errors.slice(0, 12) }, null, 2));
} finally {
  try { ws?.close(); } catch {}
  browser.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(failed ? 1 : 0);
