/* Purple room - scheduler: period / one-shot / offline catch-up.
   Classic script, no dependencies. Mounts window.PR.scheduler.
   Contract: docs/phone-contract.md sections 5 and 7. */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});

  var MAX_CATCHUP_MS = 24 * 60 * 60 * 1000;   // section 5: hard 24h cap
  var MAX_PER_TASK = 50;                       // section 7.5: anti-flood cap
  var DEFAULT_MS = 1000;

  var tasks = [];
  var paused = (typeof document !== 'undefined' && !!document.hidden);

  function now() { return Date.now(); }
  function store() { return (PR.store && PR.store.state) ? PR.store : null; }

  function normalize(ms, fn) {
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) n = DEFAULT_MS;
    return { ms: n, fn: typeof fn === 'function' ? fn : function () {} };
  }

  function arm(t) {
    if (paused || t.cancelled || t.timer !== null) return;
    t.remaining = Math.max(0, t.remaining);
    t.due = now() + t.remaining;
    t.timer = setTimeout(function () {
      t.timer = null;
      if (paused || t.cancelled) return;
      try {
        t.fn();
      } catch (err) {
        // Isolate a broken callback.
      }
      if (t.cancelled) return;
      if (t.type === 'after') {
        t.cancelled = true;
        return;
      }
      t.remaining = t.ms;
      arm(t);
    }, t.remaining);
  }

  function add(type, ms, fn) {
    var p = normalize(ms, fn);
    var t = {
      type: type,
      ms: p.ms,
      fn: p.fn,
      remaining: p.ms,
      due: 0,
      timer: null,
      cancelled: false,
    };
    tasks.push(t);
    arm(t);
    return {
      cancel: function () {
        t.cancelled = true;
        if (t.timer !== null) {
          clearTimeout(t.timer);
          t.timer = null;
        }
      },
      get cancelled() { return t.cancelled; },
    };
  }

  function every(ms, fn) { return add('every', ms, fn); }
  function after(ms, fn) { return add('after', ms, fn); }

  function pause() {
    if (paused) return;
    paused = true;
    var t0 = now();
    tasks.forEach(function (t) {
      if (t.timer !== null) {
        clearTimeout(t.timer);
        t.timer = null;
      }
      if (!t.cancelled) t.remaining = Math.max(0, t.due - t0);
    });
  }

  function resume() {
    if (!paused) return;
    paused = false;
    tasks.forEach(arm);
  }

  function writeLastSeen() {
    var s = store();
    if (!s) return;
    s.patch(function (st) { st.lastSeen = now(); });
  }

  // Catch up the period callbacks missed while the page was hidden / closed.
  function tick() {
    var result = { elapsed: 0, capped: false, fired: 0, perTask: [] };
    var s = store();
    var t0 = now();
    var last = s ? Number(s.state.lastSeen) : 0;
    if (!isFinite(last) || last < 0) last = 0;
    var elapsed = last > 0 ? t0 - last : 0;
    if (elapsed < 0) elapsed = 0;
    var capped = false;
    if (elapsed > MAX_CATCHUP_MS) {
      elapsed = MAX_CATCHUP_MS;
      capped = true;
    }
    result.elapsed = elapsed;
    result.capped = capped;

    if (elapsed > 0) {
      tasks.forEach(function (t) {
        if (t.cancelled || t.type !== 'every') return;
        var n = Math.min(Math.floor(elapsed / t.ms), MAX_PER_TASK);
        var fired = 0;
        for (var i = 0; i < n; i++) {
          try {
            t.fn({ offline: true, index: i, total: n, elapsed: elapsed });
            fired++;
          } catch (err) {
            // Isolate a broken callback.
          }
        }
        result.fired += fired;
        result.perTask.push({ ms: t.ms, fired: fired });
      });
    }

    if (s) {
      s.patch(function (st) { st.lastSeen = t0; });
    }
    return result;
  }

  function onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      pause();
      writeLastSeen();
    } else {
      tick();
      resume();
    }
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', onVisibility);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', writeLastSeen);
    window.addEventListener('beforeunload', writeLastSeen);
  }

  // Boot catch-up waits for PR.store to mount. A bare setTimeout(0) is not
  // reliable: the browser can yield between external <script src> downloads,
  // so game-state.js may not have run yet. Poll for up to ~1s (section 7.7).
  function bootTick(attempt) {
    if (!store()) {
      var n = attempt || 0;
      if (n < 20 && typeof setTimeout === 'function') {
        setTimeout(function () { bootTick(n + 1); }, 50);
      }
      return;
    }
    if (!paused) tick();
  }
  if (typeof setTimeout === 'function') {
    setTimeout(function () { bootTick(0); }, 0);
  }

  PR.scheduler = {
    every: every,
    after: after,
    tick: tick,
  };
})();
