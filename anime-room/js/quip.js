/* 头顶气泡：让模型说一句短话（不写动作、不带引号）。
   PR.quip.get(kind, fallback) -> Promise<string> */
window.PR = window.PR || {};

PR.quip = (function () {
  'use strict';
  var lastAt = 0;
  var MIN_GAP = 12000; // 同一时间只让模型说一句，避免刷屏/烧 token

  function get(kind, fallback) {
    if (typeof PR.quipsEnabled !== 'undefined' && PR.quipsEnabled === false) {
      return Promise.resolve(fallback || '');
    }
    var now = Date.now();
    if (now - lastAt < MIN_GAP) return Promise.resolve(fallback || '');
    lastAt = now;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
    return fetch('/quip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: String(kind || '') }),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) { return r.json(); }).then(function (j) {
      return (j && j.ok && j.text) ? j.text : (fallback || '');
    }).catch(function () { return fallback || ''; }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  return { get: get };
})();
