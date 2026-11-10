/* Purple room - memory stream (first person diary).
   Mounts window.PR.memory. Append-only, stored in PR.store.state.memories. */
window.PR = window.PR || {};

PR.memory = (function () {
  'use strict';
  var CAP = 5000;
  var KEY = 'cozy-room-memories';
  var syncTimer = 0;
  var DAY = 86400000;

  function state() { return PR.store && PR.store.state ? PR.store.state : null; }
  function all() {
    var s = state();
    if (!s) return [];
    if (!Array.isArray(s.memories)) s.memories = [];
    scheduleSync();
    return s.memories;
  }
  function sync() {
    try {
      var list = all().slice(-800);
      if (!list.length) return;
      fetch('/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: list }),
      }).catch(function () {});
    } catch (e) {}
  }

  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(function () { syncTimer = 0; sync(); }, 2000);
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(all().slice(-CAP))); } catch (e) {}
    if (PR.store && PR.store.save) PR.store.save();
    scheduleSync();
  }
  function load() {
    var s = state();
    if (!s) return [];
    if (!Array.isArray(s.memories)) s.memories = [];
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(raw) && raw.length) {
        var seen = {};
        for (var i = 0; i < s.memories.length; i++) seen[s.memories[i].id] = 1;
        for (var j = 0; j < raw.length; j++) if (!seen[raw[j].id]) s.memories.push(raw[j]);
      }
    } catch (e) {}
    return s.memories;
  }
  function norm(t) { return String(t || '').replace(/\s+/g, '').slice(0, 40); }

  function add(kind, text, base, tags) {
    var s = state();
    if (!s) return null;
    var list = all();
    var n = norm(text);
    var now = Date.now();
    // repetition: same thing again -> mentions++, importance up (log curve)
    for (var i = list.length - 1; i >= Math.max(0, list.length - 60); i--) {
      var m = list[i];
      if (m.kind === kind && norm(m.text) === n) {
        m.mentions = (m.mentions || 1) + 1;
        m.lastMentioned = now;
        m.importance = Math.min(10, m.baseImportance + 1.2 * Math.log2(1 + m.mentions));
        persist();
        return m;
      }
    }
    var entry = {
      id: 'm_' + now + '_' + Math.floor(Math.random() * 1000),
      ts: now,
      kind: kind,
      text: String(text || '').slice(0, 120),
      baseImportance: Math.max(1, Math.min(10, base || 3)),
      importance: Math.max(1, Math.min(10, base || 3)),
      mentions: 1,
      lastMentioned: now,
      tags: tags || [],
      source: kind,
    };
    list.push(entry);
    if (list.length > CAP) list.splice(0, list.length - CAP);
    persist();
    return entry;
  }

  // daily decay: important things fade slower
  function decay() {
    var list = all();
    var now = Date.now();
    var changed = false;
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (m.baseImportance >= 9) continue;
      var days = (now - (m.lastMentioned || m.ts)) / DAY;
      if (days < 1) continue;
      var kindRate = m.kind === 'want' ? 0.3 : (m.kind === 'obtained' ? 0.25 : 1);
      var drop = 0.15 * kindRate * (1 - m.importance / 10) * Math.floor(days);
      if (drop <= 0) continue;
      m.importance = Math.max(0, m.importance - drop);
      m.lastMentioned = now;
      changed = true;
      if (m.importance < 2) {
        list.splice(i, 1);
      }
    }
    if (changed) persist();
  }

  // re-mention: touch memories whose tags appear in the new text
  function touch(text) {
    var t = String(text || '');
    if (!t) return 0;
    var list = all();
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var hit = false;
      for (var j = 0; j < (m.tags || []).length; j++) {
        if (t.indexOf(m.tags[j]) >= 0) { hit = true; break; }
      }
      if (hit) { m.lastMentioned = Date.now(); n += 1; }
    }
    if (n) persist();
    return n;
  }

  function wantObtained(keyword) {
    var list = all();
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].kind === 'want' && list[i].text.indexOf(keyword) >= 0) {
        add('obtained', '我想要「' + keyword + '」，现在得到了', 8, ['得到', keyword]);
        list[i].importance = Math.max(0, list[i].importance - 6);
        persist();
        return true;
      }
    }
    return false;
  }

  function search(query, k) {
    var list = all().slice();
    var q = String(query || '');
    var now = Date.now();
    list.forEach(function (m) {
      var recency = 1 / (1 + (now - m.ts) / DAY);
      var kw = q && q.length >= 2 && m.text.indexOf(q) >= 0 ? 1.5 : 0;
      m._score = recency + m.importance / 10 + kw;
    });
    list.sort(function (a, b) { return b._score - a._score; });
    return list.slice(0, k || 10).map(function (m) {
      return { id: m.id, ts: m.ts, kind: m.kind, text: m.text, importance: m.importance, tags: m.tags };
    });
  }

  function reflect() {
    var s = state();
    if (!s) return Promise.resolve(false);
    var list = all().slice().sort(function (a, b) {
      return (b.importance + b.ts / 1e13) - (a.importance + a.ts / 1e13);
    }).slice(0, 40).map(function (m) { return { text: m.text, importance: m.importance, ts: m.ts }; });
    if (!list.length) return Promise.resolve(false);
    return fetch('/reflect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories: list }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return false;
      s.self = j.text;
      s.lastReflect = Date.now();
      function section(name) {
        var re = new RegExp('【' + name + '】([\\s\\S]*?)(?=【|$)');
        var m = re.exec(j.text || '');
        if (!m) return [];
        return m[1].split('\n').map(function (x) {
          return x.replace(/^[-•*\d.、\s]+/, '').trim();
        }).filter(function (x) { return x.length > 0; });
      }
      var top = section('最想要');
      var wants = section('想要');
      s.topWant = top[0] || '';
      if (top[0]) add('want', top[0], 9, ['想要', '最想要']);
      wants.forEach(function (w) { add('want', w, 7, ['想要']); });
      add('reflection', '我重新想了想自己是什么样的人', 8, ['反思']);
      persist();
      return true;
    }).catch(function () { return false; });
  }

  return { add: add, list: all, decay: decay, search: search, load: load, persist: persist, reflect: reflect, touch: touch, wantObtained: wantObtained };
})();
