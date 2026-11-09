/* Purple room - "the room gets old" (data layer, DOM-free).
   Classic script, no dependencies. Mounts window.PR.roomlife.
   Contract: docs/room-life-contract.md (v1.1, frozen state/API).
   Design:   docs/ROOM-LIFE.md (parameters & task priority).

   Persistence note (documented in REPORTS/REPORT-007.md):
   PR.store's migrate() deliberately drops unknown keys, so a room written to
   state.room does NOT survive PR.store.load() on refresh. This module keeps
   its own localStorage key as the durable source of truth and mirrors the
   same object onto PR.store.state.room for the presentation layer, which
   reads that path only. Every mutation calls PR.store.save() as well, so a
   plain PR.store.load() dump still contains the room for debugging.

   This file never touches the DOM. The only window usage is the PR namespace,
   localStorage, setTimeout and Date/Math - all safe in a worker-like context. */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});

  // ------------------------------------------------------------------ constants
  var DAY = 86400000;
  var KEY = 'cozy-room-roomlife';     // durable source of truth
  var STORE_KEY = 'cozy-room-game';   // migration fallback (debugDust / old saves)
  var VERSION = 1;

  var FLOOR_MAX = 12;                 // max dirty floor cells
  var ITEM_MAX = 3;                   // max simultaneously dusty furniture
  var LEVEL_MAX = 3;                  // dust stages: day 1 / 2 / 3+
  var WATER_MAX = 3;                  // healthy plant
  var BED_L1_DAYS = 4;               // bed stage 1 (rumpled)
  var BED_L2_DAYS = 7;               // bed stage 2 (cannot sleep)
  var FLOOR_TASK_MIN = 3;             // "擦地 脏砖 >= 3" in ROOM-LIFE.md §2
  var PLANT_TASK_WATER = 1;           // plant counts as "needy" at water <= 1
  var MAX_DAYS = 366;                 // defensive cap against clock anomalies
  var SLIP_RATE = 0.5;                // 50% chance on a dirty cell

  // assets.js defines PR.ROOM = { w: 8, d: 8 }; room-visuals.js places a dust
  // tile at (gx + 0.5) * 1.0, i.e. a 1-unit grid. Contract does not declare the
  // grid size, so read it from PR.ROOM and fall back to 8x8 when standalone.
  var GRID_W = 8;
  var GRID_D = 8;
  if (PR.ROOM && isFiniteNumber(PR.ROOM.w) && PR.ROOM.w > 0) GRID_W = Math.max(1, Math.floor(PR.ROOM.w));
  if (PR.ROOM && isFiniteNumber(PR.ROOM.d) && PR.ROOM.d > 0) GRID_D = Math.max(1, Math.floor(PR.ROOM.d));

  var subscribers = [];
  var registered = Object.create(null);   // stable uid -> { x, z }
  var fallbackRoom = null;                // used when PR.store is not loaded yet
  var storeBound = false;

  // --------------------------------------------------------------------- helpers
  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clamp(v, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }
  function rng() { return Math.random(); }

  function defaults() {
    return {
      v: VERSION,
      dust: { floor: [], items: [] },
      plants: [],
      bed: { tidyAt: 0 },
      cat: { fedAt: 0 },
      lastTick: 0,
    };
  }

  // Defensive normalisation: accept debugDust() output, older saves and hand
  // edited localStorage without ever producing NaN/duplicate/out-of-range data.
  function normalize(r) {
    r.v = VERSION;
    if (!isObject(r.dust)) r.dust = { floor: [], items: [] };
    if (!Array.isArray(r.dust.floor)) r.dust.floor = [];
    if (!Array.isArray(r.dust.items)) r.dust.items = [];
    if (!Array.isArray(r.plants)) r.plants = [];
    if (!isObject(r.bed)) r.bed = { tidyAt: 0 };
    if (!isObject(r.cat)) r.cat = { fedAt: 0 };
    if (!isFiniteNumber(r.bed.tidyAt)) r.bed.tidyAt = 0;
    if (!isFiniteNumber(r.cat.fedAt)) r.cat.fedAt = 0;
    if (!isFiniteNumber(r.lastTick)) r.lastTick = 0;

    var seenF = Object.create(null);
    var floor = [];
    for (var i = 0; i < r.dust.floor.length && floor.length < FLOOR_MAX; i++) {
      var c = r.dust.floor[i];
      if (!isObject(c)) continue;
      var gx = Math.floor(Number(c.gx));
      var gz = Math.floor(Number(c.gz));
      if (!isFinite(gx) || !isFinite(gz)) continue;
      var fk = gx + ',' + gz;
      if (seenF[fk]) continue;
      seenF[fk] = 1;
      floor.push({ gx: gx, gz: gz, level: clamp(c.level, 1, LEVEL_MAX) });
    }
    r.dust.floor = floor;

    var seenI = Object.create(null);
    var items = [];
    for (var j = 0; j < r.dust.items.length && items.length < ITEM_MAX; j++) {
      var d = r.dust.items[j];
      if (!isObject(d)) continue;
      var id = String(d.id == null ? '' : d.id);
      if (!id || seenI[id]) continue;
      seenI[id] = 1;
      items.push({ id: id, level: clamp(d.level, 1, LEVEL_MAX) });
    }
    r.dust.items = items;

    var seenP = Object.create(null);
    var plants = [];
    for (var p = 0; p < r.plants.length; p++) {
      var pl = r.plants[p];
      if (!isObject(pl)) continue;
      var pid = String(pl.id == null ? '' : pl.id);
      if (!pid || seenP[pid]) continue;
      seenP[pid] = 1;
      plants.push({ id: pid, water: clamp(pl.water == null ? WATER_MAX : pl.water, 0, WATER_MAX) });
    }
    r.plants = plants;
    return r;
  }

  function readPersisted() {
    var raw = null;
    try {
      if (typeof localStorage !== 'undefined') raw = localStorage.getItem(KEY);
    } catch (err) { raw = null; }
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (isObject(d)) return d;
      } catch (err) { /* corrupted save -> fall through */ }
    }
    // Migration fallback: older builds / __purpleRoom.debugDust() wrote the
    // room into the store key directly. PR.store.load() drops it, we keep it.
    try {
      if (typeof localStorage !== 'undefined') {
        var s = localStorage.getItem(STORE_KEY);
        if (s) {
          var g = JSON.parse(s);
          if (isObject(g) && isObject(g.room)) return g.room;
        }
      }
    } catch (err) { /* ignore */ }
    return null;
  }

  // Runtime authority is always PR.store.state.room when available, so a
  // console edit like `PR.store.state.room.lastTick = Date.now() - 3*86400000`
  // is picked up by the very next tick() - the acceptance script relies on it.
  function currentRoom() {
    if (PR.store && PR.store.state) {
      if (!isObject(PR.store.state.room)) PR.store.state.room = fallbackRoom || defaults();
      return PR.store.state.room;
    }
    if (!fallbackRoom) fallbackRoom = defaults();
    return fallbackRoom;
  }

  function persist(r) {
    var room = r || currentRoom();
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(room));
    } catch (err) { /* privacy mode / quota: keep in-memory state */ }
    try {
      if (PR.store && typeof PR.store.save === 'function') PR.store.save();
    } catch (err) { /* never let persistence break gameplay */ }
  }

  function emit(name, payload) {
    try {
      if (PR.bus && typeof PR.bus.emit === 'function') return PR.bus.emit(name, payload);
    } catch (err) { /* a broken listener must not break the logic layer */ }
    return 0;   // bus not loaded yet: event silently dropped, state still valid
  }

  function notify(info) {
    var room = currentRoom();
    var list = subscribers.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](room, info); } catch (err) { /* isolate subscribers */ }
    }
  }

  // 0 means "never" and is treated as fresh, matching room-visuals.applyBed()
  // which maps tidyAt === 0 to stage 0.
  function daysSince(ts, now) {
    if (!isFiniteNumber(ts) || ts <= 0) return 0;
    var d = Math.floor((now - ts) / DAY);
    return d > 0 ? d : 0;
  }

  function bedLevel(now) {
    var room = currentRoom();
    var d = daysSince(room.bed.tidyAt, now);
    return d >= BED_L2_DAYS ? 2 : (d >= BED_L1_DAYS ? 1 : 0);
  }

  function hungryDays(now) {
    return daysSince(currentRoom().cat.fedAt, now);
  }

  function findPlant(room, id) {
    for (var i = 0; i < room.plants.length; i++) {
      if (room.plants[i].id === id) return room.plants[i];
    }
    return null;
  }

  function isPlant(it) {
    if (it.plant === true || it.isPlant === true) return true;
    var t = String(it.type || it.kind || '').toLowerCase();
    if (t.indexOf('plant') >= 0) return true;
    if (it.def && (it.def.id === 'plant' || it.def.id === 'palm')) return true;
    return false;
  }

  function itemSpot(id) {
    var rec = registered[id];
    return rec ? { x: rec.x, z: rec.z } : null;
  }

  // --------------------------------------------------------------- daily decay
  function pickFloorCells(room, n) {
    var used = Object.create(null);
    for (var i = 0; i < room.dust.floor.length; i++) {
      used[room.dust.floor[i].gx + ',' + room.dust.floor[i].gz] = 1;
    }
    var out = [];
    var tries = 0;
    var limit = n * 40 + 40;
    while (out.length < n && tries < limit) {
      tries++;
      var gx = Math.floor(rng() * GRID_W);
      var gz = Math.floor(rng() * GRID_D);
      var k = gx + ',' + gz;
      if (used[k]) continue;
      used[k] = 1;
      out.push({ gx: gx, gz: gz });
    }
    return out;
  }

  function pickItemIds(room, n) {
    var used = Object.create(null);
    for (var i = 0; i < room.dust.items.length; i++) used[room.dust.items[i].id] = 1;
    var pool = [];
    for (var id in registered) {
      if (Object.prototype.hasOwnProperty.call(registered, id) && !used[id]) pool.push(id);
    }
    var out = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return out;
  }

  // Exactly one calendar day of wear. Called once per elapsed 24h so an
  // offline gap of N days deepens existing dust N times before adding new dust.
  function advanceOneDay(room, s, pending) {
    var i;
    for (i = 0; i < room.dust.floor.length; i++) {
      if (room.dust.floor[i].level < LEVEL_MAX) {
        room.dust.floor[i].level++;
        s.upgradedFloor++;
      }
    }
    for (i = 0; i < room.dust.items.length; i++) {
      if (room.dust.items[i].level < LEVEL_MAX) {
        room.dust.items[i].level++;
        s.upgradedItems++;
      }
    }
    for (i = 0; i < room.plants.length; i++) {
      if (room.plants[i].water > 0) {
        room.plants[i].water--;
        s.waterLost++;
      }
    }

    var wantFloor = 1 + Math.floor(rng() * 3);            // 1..3 per day
    var freeFloor = Math.max(0, FLOOR_MAX - room.dust.floor.length);
    var cells = pickFloorCells(room, Math.min(wantFloor, freeFloor));
    for (i = 0; i < cells.length; i++) {
      room.dust.floor.push({ gx: cells[i].gx, gz: cells[i].gz, level: 1 });
      s.addedFloor++;
      pending.push({ name: 'room:dust', payload: { kind: 'floor', ref: { gx: cells[i].gx, gz: cells[i].gz } } });
    }

    var wantItems = Math.floor(rng() * 3);                // 0..2 per day
    var freeItems = Math.max(0, ITEM_MAX - room.dust.items.length);
    var ids = pickItemIds(room, Math.min(wantItems, freeItems));
    for (i = 0; i < ids.length; i++) {
      room.dust.items.push({ id: ids[i], level: 1 });
      s.addedItems++;
      pending.push({ name: 'room:dust', payload: { kind: 'item', ref: ids[i] } });
    }
  }

  // ------------------------------------------------------------------------ API
  function load() {
    var room = normalize(readPersisted() || defaults());
    if (!room.lastTick || room.lastTick <= 0) room.lastTick = Date.now();
    fallbackRoom = room;
    if (PR.store && PR.store.state) PR.store.state.room = room;
    persist(room);
    notify({ type: 'load' });
    return room;
  }

  function tick(now) {
    var t = isFiniteNumber(now) ? now : Date.now();
    var room = normalize(currentRoom());
    var s = {
      now: t, elapsed: 0, days: 0, capped: false,
      addedFloor: 0, addedItems: 0,
      upgradedFloor: 0, upgradedItems: 0, waterLost: 0,
      dustEventCount: 0, changed: false,
    };

    // First run after a fresh install, or clock moved backwards: do not
    // invent years of history, just re-anchor the clock.
    if (!room.lastTick || room.lastTick <= 0 || t < room.lastTick) {
      room.lastTick = t;
      s.changed = true;
      persist(room);
      notify({ type: 'tick', summary: s });
      return s;
    }

    s.elapsed = t - room.lastTick;
    var days = Math.floor(s.elapsed / DAY);
    if (days > MAX_DAYS) { days = MAX_DAYS; s.capped = true; }
    s.days = days;

    var pending = [];
    for (var d = 0; d < days; d++) advanceOneDay(room, s, pending);

    if (days > 0) {
      // Keep the sub-day remainder so frequent ticks never lose a day.
      room.lastTick = s.capped ? t : (room.lastTick + days * DAY);
      s.changed = true;
    }

    // Emit after the loop: listeners must never re-enter mid-calculation.
    for (var e = 0; e < pending.length; e++) emit(pending[e].name, pending[e].payload);
    s.dustEventCount = pending.length;

    if (s.changed) {
      persist(room);
      notify({ type: 'tick', summary: s });
    }
    return s;
  }

  function setItems(list) {
    var room = normalize(currentRoom());
    var arr = Array.isArray(list) ? list : [];
    var next = Object.create(null);
    var count = 0;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!isObject(it)) continue;
      var id = it.id != null ? String(it.id) : (it.uid != null ? String(it.uid) : '');
      if (!id) continue;
      var x = Number(it.x);
      var z = Number(it.z);
      next[id] = { x: isFinite(x) ? x : 0, z: isFinite(z) ? z : 0 };
      count++;
      // A newly registered plant starts healthy; an existing one keeps its
      // current water level across reloads.
      if (isPlant(it) && !findPlant(room, id)) room.plants.push({ id: id, water: WATER_MAX });
    }
    registered = next;
    // uid is stable per contract, so dust on removed furniture must go.
    room.dust.items = room.dust.items.filter(function (d) { return !!next[d.id]; });
    persist(room);
    notify({ type: 'setItems', count: count });
    return count;
  }

  function dirtyList() {
    var room = normalize(currentRoom());
    var out = [];
    for (var i = 0; i < room.dust.floor.length; i++) {
      var c = room.dust.floor[i];
      out.push({
        kind: 'floor', gx: c.gx, gz: c.gz, level: c.level,
        spot: { x: c.gx + 0.5, z: c.gz + 0.5 },
      });
    }
    for (var j = 0; j < room.dust.items.length; j++) {
      var d = room.dust.items[j];
      out.push({ kind: 'item', id: d.id, level: d.level, spot: itemSpot(d.id) });
    }
    return out;
  }

  function floorRef(ref) {
    var gx, gz;
    if (Array.isArray(ref)) { gx = Number(ref[0]); gz = Number(ref[1]); }
    else if (isObject(ref)) {
      gx = Number(ref.gx != null ? ref.gx : ref.x);
      gz = Number(ref.gz != null ? ref.gz : ref.z);
    } else if (typeof ref === 'string' && ref.indexOf(',') >= 0) {
      var parts = ref.split(',');
      gx = Number(parts[0]); gz = Number(parts[1]);
    } else { gx = NaN; gz = NaN; }
    return { gx: Math.floor(gx), gz: Math.floor(gz) };
  }

  function itemRef(ref) {
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'number' && isFinite(ref)) return String(ref);
    if (isObject(ref)) {
      var id = ref.id != null ? ref.id : ref.uid;
      return id == null ? '' : String(id);
    }
    return '';
  }

  // Contract says "clear to 0"; keeping a level:0 entry would be wrong because
  // room-visuals.js does `dustById[id] = entry.level || 1` and would render it
  // as level 1 again. Removing the entry is the equivalent of level 0.
  function clean(kind, ref) {
    var room = normalize(currentRoom());
    var k = String(kind == null ? '' : kind).toLowerCase();
    var i;
    if (k === 'floor') {
      var f = floorRef(ref);
      if (!isFinite(f.gx) || !isFinite(f.gz)) return false;
      for (i = 0; i < room.dust.floor.length; i++) {
        if (room.dust.floor[i].gx === f.gx && room.dust.floor[i].gz === f.gz) {
          room.dust.floor.splice(i, 1);
          emit('room:clean', { kind: 'floor', ref: { gx: f.gx, gz: f.gz } });
          persist(room);
          notify({ type: 'clean', kind: 'floor', ref: f });
          return true;
        }
      }
      return false;
    }
    if (k === 'item') {
      var id = itemRef(ref);
      if (!id) return false;
      for (i = 0; i < room.dust.items.length; i++) {
        if (room.dust.items[i].id === id) {
          room.dust.items.splice(i, 1);
          emit('room:clean', { kind: 'item', ref: id });
          persist(room);
          notify({ type: 'clean', kind: 'item', ref: id });
          return true;
        }
      }
      return false;
    }
    return false;
  }

  function water(plantId) {
    var room = normalize(currentRoom());
    var id = String(plantId == null ? '' : plantId);
    if (!id) return false;
    var plant = findPlant(room, id);
    if (plant) plant.water = WATER_MAX;              // "浇水立刻回到 3"
    else room.plants.push({ id: id, water: WATER_MAX });
    emit('room:water', {});
    persist(room);
    notify({ type: 'water', id: id });
    return true;
  }

  function tidyBed() {
    var room = normalize(currentRoom());
    room.bed.tidyAt = Date.now();
    emit('room:tidy', {});
    persist(room);
    notify({ type: 'tidy' });
    return room.bed.tidyAt;
  }

  function feedCat() {
    var room = normalize(currentRoom());
    room.cat.fedAt = Date.now();
    emit('room:feed', {});
    persist(room);
    notify({ type: 'feed' });
    return room.cat.fedAt;
  }

  function canSleep() {
    return bedLevel(Date.now()) < 2;
  }

  function task(kind, ref, priority, reason) {
    return { kind: kind, ref: ref, priority: priority, reason: reason };
  }

  // Priority order from TASKS/007: 床单 > 猫 > 花 > 地 > 工作 > 休闲 > 发呆.
  // Only state.room signals are available in this card, so "work"/"leisure"
  // are opt-in via the optional (non-contract) ctx argument; without a signal
  // they are skipped and the queue falls through to "idle".
  function nextTask(ctx) {
    var now = Date.now();
    var room = normalize(currentRoom());
    var c = isObject(ctx) ? ctx : {};

    var lv = bedLevel(now);
    if (lv >= 2) return task('tidy', 'bed', 1, '床单 2 级（≥7 天未整理），不能睡');

    var hungry = hungryDays(now);
    if (hungry >= 1) return task('feed', 'cat', 2, '猫 ' + hungry + ' 天没喂了');

    var worst = null;
    for (var i = 0; i < room.plants.length; i++) {
      var p = room.plants[i];
      if (p.water <= PLANT_TASK_WATER && (!worst || p.water < worst.water)) worst = p;
    }
    if (worst) return task('water', worst.id, 3, '花蔫了（water=' + worst.water + '）');

    if (room.dust.floor.length >= FLOOR_TASK_MIN) {
      var cell = room.dust.floor[0];
      for (var f = 1; f < room.dust.floor.length; f++) {
        if (room.dust.floor[f].level > cell.level) cell = room.dust.floor[f];
      }
      return task('clean', { gx: cell.gx, gz: cell.gz }, 4, '地上 ' + room.dust.floor.length + ' 块脏砖');
    }

    if (c.working) return task('work', 'desk', 5, '想赚点钱 / 你也在工作');
    if (c.wantLeisure) return task('leisure', 'tv', 6, '想看电影 / 刷 B 站');
    return task('idle', null, 7, '什么都不急');
  }

  // She landed on (gx, gz): only a dirty cell can trigger a slip, and even
  // then only 50% of the time. Returns true when room:slip was emitted.
  function trySlip(gx, gz) {
    var room = normalize(currentRoom());
    var x = Math.floor(Number(gx));
    var z = Math.floor(Number(gz));
    if (!isFinite(x) || !isFinite(z)) return false;
    var dirty = false;
    for (var i = 0; i < room.dust.floor.length; i++) {
      if (room.dust.floor[i].gx === x && room.dust.floor[i].gz === z) { dirty = true; break; }
    }
    if (!dirty || rng() >= SLIP_RATE) return false;
    emit('room:slip', { gx: x, gz: z });
    return true;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  // -------------------------------------------------------------- store attach
  // External classic scripts can yield between downloads (see REPORT-006), so
  // a one-shot setTimeout(0) is not enough when game-state.js loads later.
  function attachStore(attempt) {
    if (storeBound) return;
    if (!PR.store || !PR.store.state) {
      var n = attempt || 0;
      if (n < 20 && typeof setTimeout === 'function') {
        setTimeout(function () { attachStore(n + 1); }, 50);
      }
      return;
    }
    storeBound = true;
    if (!isObject(PR.store.state.room)) PR.store.state.room = fallbackRoom || defaults();
    else fallbackRoom = PR.store.state.room;
    try { PR.store.save(); } catch (err) { /* ignore */ }
    // PR.store.load() drops room via migrate(); restore the mirror if the
    // presentation layer ever reloads the store at runtime.
    if (typeof PR.store.subscribe === 'function') {
      PR.store.subscribe(function (s, info) {
        if (info && info.type === 'load' && !isObject(s.room)) {
          s.room = normalize(readPersisted() || defaults());
          fallbackRoom = s.room;
        }
      });
    }
  }

  PR.roomlife = {
    load: load,
    tick: tick,
    setItems: setItems,
    dirtyList: dirtyList,
    clean: clean,
    water: water,
    tidyBed: tidyBed,
    feedCat: feedCat,
    canSleep: canSleep,
    nextTask: nextTask,
    trySlip: trySlip,
    subscribe: subscribe,
  };

  load();
  if (typeof setTimeout === 'function') setTimeout(function () { attachStore(0); }, 0);
})();
