/* Purple room - tiny event bus (data layer, DOM-free).
   Classic script, no dependencies. Mounts window.PR.bus.
   Contract: docs/phone-contract.md sections 4 and 7. */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});
  var listeners = Object.create(null);

  function on(name, fn) {
    if (typeof name !== 'string' || typeof fn !== 'function') return function () {};
    (listeners[name] || (listeners[name] = [])).push(fn);
    return function () { off(name, fn); };
  }

  function off(name, fn) {
    var list = listeners[name];
    if (!list) return;
    if (typeof fn !== 'function') {
      delete listeners[name];
      return;
    }
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) delete listeners[name];
  }

  function emit(name, payload) {
    var list = listeners[name];
    if (!list || !list.length) return 0;    // no listeners: silent, never throws
    var snapshot = list.slice();            // on/off during emit is safe
    var fired = 0;
    for (var i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](payload);
        fired++;
      } catch (err) {
        // Isolate a broken listener from the others.
      }
    }
    return fired;
  }

  PR.bus = { on: on, off: off, emit: emit };
})();
