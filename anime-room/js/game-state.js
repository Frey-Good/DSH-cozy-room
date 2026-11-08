/* Purple room - game state + message model (data layer, DOM-free).
   Classic script, no dependencies. Mounts window.PR.store.
   Contract: docs/phone-contract.md sections 2, 3 and 7. */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});

  var KEY = 'cozy-room-game';
  var VERSION = 1;
  var MAX_MESSAGES = 200;

  function defaults() {
    return {
      v: VERSION,
      coins: 0,
      counters: {},
      flags: {},
      messages: [],
      unread: 0,
      lastSeen: 0,
      achievements: [],
      garden: null,
      travel: null,
    };
  }

  function isObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  var state = defaults();
  var subscribers = [];
  var phoneOpen = false;   // section 7.2: internal flag, never a state field
  var busBound = false;

  // Only the frozen fields are copied; unknown/extra keys from older builds
  // are dropped. Migration hook: branch on raw.v when a newer shape lands.
  function migrate(raw) {
    var d = defaults();
    if (!isObject(raw)) return d;
    d.v = VERSION;
    if (typeof raw.coins === 'number' && isFinite(raw.coins)) d.coins = raw.coins;
    if (isObject(raw.counters)) d.counters = raw.counters;
    if (isObject(raw.flags)) d.flags = raw.flags;
    if (Array.isArray(raw.messages)) d.messages = raw.messages.slice(-MAX_MESSAGES);
    if (typeof raw.unread === 'number' && isFinite(raw.unread)) d.unread = Math.max(0, raw.unread);
    if (typeof raw.lastSeen === 'number' && isFinite(raw.lastSeen)) d.lastSeen = raw.lastSeen;
    if (Array.isArray(raw.achievements)) d.achievements = raw.achievements;
    if (raw.garden !== undefined) d.garden = raw.garden;
    if (raw.travel !== undefined) d.travel = raw.travel;
    return d;
  }

  function notify(info) {
    var list = subscribers.slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](state, info);
      } catch (err) {
        // One broken subscriber must not break the others.
      }
    }
  }

  function load() {
    var raw = null;
    try {
      var rawText = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
      raw = rawText ? JSON.parse(rawText) : null;
    } catch (err) {
      raw = null;
    }
    var d = migrate(raw);
    // In-place write keeps any cached PR.store.state reference valid (section 7.4).
    Object.keys(d).forEach(function (k) { state[k] = d[k]; });
    notify({ type: 'load' });
    return state;
  }

  function save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // Privacy mode / quota exceeded: keep the in-memory state, do not throw.
    }
  }

  function patch(fn) {
    if (typeof fn === 'function') fn(state);
    save();
    notify({ type: 'patch' });
    return state;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  function message(text, opts) {
    var o = opts || {};
    var msg = {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      from: o.from === 'me' ? 'me' : 'her',   // section 7.1: default 'her'
      text: String(text == null ? '' : text),
      ts: Date.now(),
      kind: (o.kind === 'photo' || o.kind === 'event') ? o.kind : 'text',
      read: false,
      meta: isObject(o.meta) ? o.meta : {},
    };
    state.messages.push(msg);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    }
    if (msg.from === 'her' && !phoneOpen) state.unread += 1;
    save();
    notify({ type: 'message', message: msg });
    return msg;
  }

  function markRead() {
    state.unread = 0;
    for (var i = 0; i < state.messages.length; i++) {
      state.messages[i].read = true;
    }
    save();
    notify({ type: 'markRead' });
    return state;
  }

  // Bind lazily: bus.js may be loaded after this file (section 7.7).
  // A one-shot setTimeout(0) is NOT enough: the browser can yield between two
  // external <script src> downloads, so bus.js may still be missing. Poll for
  // up to ~1s instead.
  function bindBus(attempt) {
    if (busBound) return;
    if (!PR.bus || typeof PR.bus.on !== 'function') {
      var n = attempt || 0;
      if (n < 20 && typeof setTimeout === 'function') {
        setTimeout(function () { bindBus(n + 1); }, 50);
      }
      return;
    }
    busBound = true;
    PR.bus.on('phone:open', function () { phoneOpen = true; });
    PR.bus.on('phone:close', function () { phoneOpen = false; });
  }

  load();                     // section 7.4: refresh restores immediately
  if (typeof setTimeout === 'function') setTimeout(function () { bindBus(0); }, 0);

  PR.store = {
    get state() { return state; },
    load: load,
    save: save,
    patch: patch,
    subscribe: subscribe,
    message: message,
    markRead: markRead,
  };
})();
