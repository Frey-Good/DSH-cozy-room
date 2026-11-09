/* Purple room - memory stream (first person diary).
   Mounts window.PR.memory. Append-only, stored in PR.store.state.memories. */
window.PR = window.PR || {};

PR.memory = (function () {
  'use strict';
  var CAP = 5000;
  var KEY = 'cozy-room-memories';
  var DAY = 86400000;

  function state() { return PR.store && PR.store.state ? PR.store.state : null; }
  function all() {
    var s = state();
    if (!s) return [];
    if (!Array.isArray(s.memories)) s.memories = [];
    return s.memories;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(all().slice(-CAP))); } catch (e) {}
    if (PR.store && PR.store.save) PR.store.save();
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
      var drop = 0.15 * (1 - m.importance / 10) * Math.floor(days);
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

  return { add: add, list: all, decay: decay, search: search, load: load, persist: persist };
})();
