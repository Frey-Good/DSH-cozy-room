/* Purple Room — decoration system, pathfinding, UI and render loop. */
(function () {
  'use strict';
  var T = THREE;
  var PR = window.PR;
  var R = PR.ROOM;
  var WIN = PR.WIN;
  var world = PR.world;
  var scene = world.scene;
  var camera = world.camera;
  var renderer = world.renderer;
  var canvas = document.getElementById('scene');

  var EDGE = 0.03;
  var SNAP = 0.25;
  var SPEED = 1.15;
  var SAVE_KEY = 'purple-room-v1';

  var state = {
    items: [],
    placing: null,
    selected: null,
    drag: null,
    night: false,
    working: false,
    present: true,
    skin: 'pet',
    char: null,
  };

  var SETTINGS_KEY = 'cozy-room-settings';
  var DEFAULT_SETTINGS = {
    followWork: true,
    nightSleep: true,
    wander: true,
    catRoam: true,
    parallax: true,
    pace: 'normal',
    scale: 1,
    timeSync: true,
    weatherSync: false,
    city: '沈阳',
  };
  state.settings = Object.assign({}, DEFAULT_SETTINGS);
  try {
    Object.assign(state.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch (err) { /* ignore */ }

  var thumbs = {};
  var ui = {
    catalog: document.getElementById('catalog'),
    tabs: document.getElementById('tabs'),
    hint: document.getElementById('hint'),
    selbar: document.getElementById('selbar'),
    selname: document.getElementById('sel-name'),
    btnNight: document.getElementById('btn-night'),
    btnReset: document.getElementById('btn-reset'),
    btnRotate: document.getElementById('btn-rotate'),
    btnRemove: document.getElementById('btn-remove'),
    toast: document.getElementById('toast'),
    loading: document.getElementById('loading'),
    bubble: document.getElementById('bubble'),
    clockTime: document.getElementById('clock-time'),
    clockWeather: document.getElementById('clock-weather'),
  };

  // --------------------------------------------------------------- utilities
  function snap(v) { return Math.round(v / SNAP) * SNAP; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function footprint(def, rot) {
    var odd = Math.abs(Math.sin(rot || 0)) > 0.5;
    return odd ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
  }

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { ui.toast.classList.add('hidden'); }, 1800);
  }

  // ------------------------------------------------------------- selection UI
  var selPad = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({ color: 0xffcf90, transparent: true, opacity: 0.12, depthWrite: false })
  );
  selPad.rotation.x = -Math.PI / 2;
  selPad.visible = false;
  scene.add(selPad);

  var selEdge = new T.LineSegments(
    new T.EdgesGeometry(new T.PlaneGeometry(1, 1)),
    new T.LineBasicMaterial({ color: 0xffd8a4, transparent: true, opacity: 0.8 })
  );
  selEdge.rotation.x = -Math.PI / 2;
  selEdge.visible = false;
  scene.add(selEdge);

  var selHelper = null;

  var padFloor = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({ color: 0x8be3a4, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide })
  );
  padFloor.rotation.x = -Math.PI / 2;
  padFloor.visible = false;
  scene.add(padFloor);

  var padWall = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({ color: 0x8be3a4, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide })
  );
  padWall.visible = false;
  scene.add(padWall);

  var marker = new T.Mesh(
    new T.RingGeometry(0.15, 0.21, 24),
    new T.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, depthWrite: false })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.02;
  scene.add(marker);
  var markerLife = 0;

  // ------------------------------------------------------------------- items
  function spawn(def, opts) {
    opts = opts || {};
    var variant = opts.variant == null ? 0 : opts.variant;
    var group = def.build(variant);
    var rec = {
      def: def,
      group: group,
      variant: variant,
      wall: opts.wall || null,
      x: opts.x || 0,
      z: opts.z || 0,
      rot: opts.rot || 0,
      u: opts.u || 0,
      y: opts.y || 0,
      light: null,
      sprite: null,
      glow: [],
    };
    group.userData.item = rec;

    if (rec.wall) {
      if (rec.wall === 'north') {
        group.position.set(rec.u, rec.y - def.h / 2, 0.03);
        group.rotation.y = 0;
      } else {
        group.position.set(0.03, rec.y - def.h / 2, rec.u);
        group.rotation.y = Math.PI / 2;
      }
    } else {
      group.position.set(rec.x, 0, rec.z);
      group.rotation.y = rec.rot;
    }
    scene.add(group);

    if (!rec.wall) {
      var parts = [];
      group.traverse(function (o) { if (o.isMesh) parts.push(o); });
      parts.forEach(function (m) { if (!m.userData.isOutline) PR.addOutline(m, 1.018); });
    }

    if (!rec.wall && !def.flat) {
      var shadowFp = footprint(def, rec.rot);
      var blob = new T.Mesh(new T.PlaneGeometry(shadowFp.w * 1.3, shadowFp.d * 1.3), PR.shadowMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(0, 0.028, 0);
      blob.renderOrder = 1;
      group.add(blob);
      rec.shadowBlob = blob;
    }

    if (def.light) {
      var light = new T.PointLight(def.light.color, 1.2, 8, 2);
      light.position.set(0, def.light.y, 0);
      group.add(light);
      var sprite = new T.Sprite(new T.SpriteMaterial({
        map: PR.tex.glow,
        color: 0xffbe86,
        transparent: true,
        opacity: 0.16,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }));
      sprite.scale.set(1.7, 1.7, 1);
      sprite.position.set(0, def.light.y + 0.04, 0);
      group.add(sprite);
      group.traverse(function (o) {
        if (o.isMesh && o.userData.glow && o.material && o.material.emissive) rec.glow.push(o.material);
      });
      rec.light = light;
      rec.sprite = sprite;
      world.lamps.push({ light: light, sprite: sprite, materials: rec.glow });
    }

    state.items.push(rec);
    return rec;
  }

  function disposeGroup(group) {
    group.traverse(function (o) {
      if (o.isMesh) o.geometry.dispose();
    });
  }

  function removeItem(rec) {
    if (!rec) return;
    scene.remove(rec.group);
    disposeGroup(rec.group);
    if (rec.light) {
      for (var i = world.lamps.length - 1; i >= 0; i--) {
        if (world.lamps[i].light === rec.light) world.lamps.splice(i, 1);
      }
      if (rec.sprite) rec.sprite.material.dispose();
    }
    state.items = state.items.filter(function (it) { return it !== rec; });
    if (state.selected === rec) select(null);
    rebuildNav();
    save();
  }

  function clearAll() {
    state.items.slice().forEach(function (rec) {
      scene.remove(rec.group);
      disposeGroup(rec.group);
      if (rec.light) {
        for (var i = world.lamps.length - 1; i >= 0; i--) {
          if (world.lamps[i].light === rec.light) world.lamps.splice(i, 1);
        }
        if (rec.sprite) rec.sprite.material.dispose();
      }
    });
    state.items = [];
    select(null);
    rebuildNav();
  }

  function defById(id) { return PR.itemById(id); }

  function canPlaceFloor(def, x, z, rot, self) {
    var f = footprint(def, rot);
    if (x - f.w / 2 < EDGE || z - f.d / 2 < EDGE) return false;
    if (x + f.w / 2 > R.w - EDGE || z + f.d / 2 > R.d - EDGE) return false;
    if (def.flat) return true;
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it === self || it.wall || it.def.flat) continue;
      var g = footprint(it.def, it.rot);
      if (Math.abs(x - it.x) < (f.w + g.w) / 2 - 0.02 && Math.abs(z - it.z) < (f.d + g.d) / 2 - 0.02) return false;
    }
    return true;
  }

  function canPlaceWall(def, wall, u, y, self) {
    var w = def.w;
    var h = def.h;
    var limit = wall === 'north' ? R.w : R.d;
    if (u - w / 2 < 0.35 || u + w / 2 > limit - 0.35) return false;
    if (y - h / 2 < 0.35 || y + h / 2 > R.wallH - 0.08) return false;
    if (wall === 'north') {
      if (u + w / 2 > WIN.x1 - 0.06 && u - w / 2 < WIN.x2 + 0.06 && y + h / 2 > WIN.y1 - 0.06 && y - h / 2 < WIN.y2 + 0.06) return false;
    }
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it === self || it.wall !== wall) continue;
      if (Math.abs(u - it.u) < (w + it.def.w) / 2 - 0.02 && Math.abs(y - it.y) < (h + it.def.h) / 2 - 0.02) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- navigation
  var CELL = 0.25;
  var GW = Math.ceil(R.w / CELL);
  var GD = Math.ceil(R.d / CELL);
  var blocked = new Uint8Array(GW * GD);

  function rebuildNav() {
    blocked.fill(0);
    for (var gz = 0; gz < GD; gz++) {
      for (var gx = 0; gx < GW; gx++) {
        var x = (gx + 0.5) * CELL;
        var z = (gz + 0.5) * CELL;
        var b = x < 0.3 || z < 0.3 || x > R.w - 0.3 || z > R.d - 0.3;
        if (!b) {
          for (var i = 0; i < state.items.length; i++) {
            var it = state.items[i];
            if (it.wall || it.def.flat) continue;
            var f = footprint(it.def, it.rot);
            if (x > it.x - f.w / 2 - 0.17 && x < it.x + f.w / 2 + 0.17 && z > it.z - f.d / 2 - 0.17 && z < it.z + f.d / 2 + 0.17) {
              b = true;
              break;
            }
          }
        }
        blocked[gz * GW + gx] = b ? 1 : 0;
      }
    }
  }

  function isBlocked(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= GW || gz >= GD) return true;
    return blocked[gz * GW + gx] === 1;
  }

  function blockedWorld(x, z) {
    return isBlocked(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  function nearestFree(gx, gz) {
    for (var r = 1; r <= 10; r++) {
      for (var dz = -r; dz <= r; dz++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (!isBlocked(gx + dx, gz + dz)) return { x: gx + dx, z: gz + dz };
        }
      }
    }
    return null;
  }

  function clearLine(a, b) {
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var steps = Math.max(1, Math.ceil(d / 0.08));
    for (var s = 1; s <= steps; s++) {
      if (blockedWorld(a.x + (dx * s) / steps, a.z + (dz * s) / steps)) return false;
    }
    return true;
  }

  function findPath(sx, sz, tx, tz) {
    var sg = { x: Math.floor(sx / CELL), z: Math.floor(sz / CELL) };
    var tg = { x: Math.floor(tx / CELL), z: Math.floor(tz / CELL) };
    if (isBlocked(tg.x, tg.z)) {
      var nf = nearestFree(tg.x, tg.z);
      if (!nf) return [];
      tg = nf;
    }
    if (isBlocked(sg.x, sg.z)) {
      var nf2 = nearestFree(sg.x, sg.z);
      if (!nf2) return [];
      sg = nf2;
    }
    var startI = sg.z * GW + sg.x;
    var goalI = tg.z * GW + tg.x;
    var open = [{ i: startI, x: sg.x, z: sg.z, g: 0, f: 0 }];
    var gScore = {};
    var came = {};
    var closed = {};
    var dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    var iter = 0;
    while (open.length && iter++ < 6000) {
      var bi = 0;
      for (var k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
      var cur = open.splice(bi, 1)[0];
      if (cur.i === goalI) return buildPath(came, cur.i, tx, tz);
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      for (var d = 0; d < dirs.length; d++) {
        var nx = cur.x + dirs[d][0];
        var nz = cur.z + dirs[d][1];
        if (isBlocked(nx, nz)) continue;
        if (dirs[d][0] !== 0 && dirs[d][1] !== 0) {
          if (isBlocked(cur.x + dirs[d][0], cur.z) || isBlocked(cur.x, cur.z + dirs[d][1])) continue;
        }
        var ni = nz * GW + nx;
        var ng = cur.g + dirs[d][2];
        if (gScore[ni] == null || ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur.i;
          var hx = Math.abs(nx - tg.x);
          var hz = Math.abs(nz - tg.z);
          var h = hx + hz + (1.414 - 2) * Math.min(hx, hz);
          open.push({ i: ni, x: nx, z: nz, g: ng, f: ng + h });
        }
      }
    }
    return [];
  }

  function buildPath(came, endI, tx, tz) {
    var cells = [];
    var i = endI;
    var guard = 0;
    while (i != null && guard++ < 4000) {
      cells.push(i);
      i = came[i];
    }
    cells.reverse();
    var pts = cells.map(function (ci) {
      return { x: ((ci % GW) + 0.5) * CELL, z: (Math.floor(ci / GW) + 0.5) * CELL };
    });
    pts = smooth(pts);
    var last = pts[pts.length - 1];
    if (last && clearLine(last, { x: tx, z: tz })) pts.push({ x: tx, z: tz });
    pts.shift();
    return pts;
  }

  function smooth(pts) {
    if (pts.length < 3) return pts;
    var out = [pts[0]];
    var i = 0;
    while (i < pts.length - 1) {
      var j = pts.length - 1;
      while (j > i + 1 && !clearLine(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  // -------------------------------------------------------------- character
  function randomHomeSpot() {
    var px = state.char ? state.char.obj.root.position.x : -99;
    var pz = state.char ? state.char.obj.root.position.z : -99;
    if (!state.settings.wander && state.char) return { x: px, z: pz, y: 0 };
    for (var i = 0; i < 48; i++) {
      var gx = 1 + Math.floor(Math.random() * (GW - 2));
      var gz = 1 + Math.floor(Math.random() * (GD - 2));
      if (isBlocked(gx, gz)) continue;
      var R = PR.ROOM;
      var x = Math.min(R.w - 1.25, Math.max(1.25, (gx + 0.5) * CELL));
      var z = Math.min(R.d - 1.25, Math.max(1.25, (gz + 0.5) * CELL));
      var dx = x - px;
      var dz = z - pz;
      if (Math.sqrt(dx * dx + dz * dz) < 0.9) continue;
      return { x: x, z: z, y: 0 };
    }
    return { x: 2.4 + Math.random() * 3.0, z: 2.4 + Math.random() * 3.0, y: 0 };
  }

  function postLibrary() {
    if (!PR.actionLibrary || location.protocol !== 'http:') return;
    try {
      parent.postMessage({ type: 'cozy-room-library', items: PR.actionLibrary }, '*');
    } catch (err) { /* ignore */ }
  }

  function startStatusPoll() {
    if (location.protocol !== 'http:') return;
    setInterval(function () {
      fetch('status.json', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (s) {
          if (!state.settings.followWork) {
            state.working = false;
            return;
          }
          var st = s.state || (s.working ? 'working' : 'idle');
          state.workState = st;
          state.working = st !== 'idle';
          if (state.char) state.char.obj.setWorkState(st);
        })
        .catch(function () {});
    }, 1500);
  }

  // -------------------------------------------------------------------- cat
  var catState = null;
  var lastCmdTs = 0;

  function startCommandPoll() {
    if (location.protocol !== 'http:') return;
    setInterval(function () {
      fetch('cmd.json', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (c) {
          if (!c || !c.action || !c.ts || c.ts === lastCmdTs) return;
          lastCmdTs = c.ts;
          if (state.char) state.char.obj.command(c.action, c.x, c.z);
        })
        .catch(function () {});
    }, 1000);
  }

  function catBlocked(x, z) {
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it.wall || it.def.flat) continue;
      var odd = Math.abs(Math.sin(it.rot || 0)) > 0.5;
      var w = (odd ? it.def.d : it.def.w) / 2 + 0.12;
      var d = (odd ? it.def.w : it.def.d) / 2 + 0.12;
      if (x > it.x - w && x < it.x + w && z > it.z - d && z < it.z + d) return true;
    }
    return x < 0.45 || z < 0.45 || x > R.w - 0.45 || z > R.d - 0.45;
  }

  function catFreeSpot() {
    for (var i = 0; i < 40; i++) {
      var x = 0.6 + Math.random() * (R.w - 1.2);
      var z = 0.6 + Math.random() * (R.d - 1.2);
      if (catBlocked(x, z)) continue;
      return { x: x, z: z };
    }
    return { x: 3.9, z: 4.0 };
  }

  function spawnCat() {
    var bed = null;
    state.items.forEach(function (it) { if (it.def.id === 'catbed') bed = it; });
    var hx = bed ? bed.x : 4.6;
    var hz = bed ? bed.z : 0.7;
    var obj = PR.makeCat();
    var blob = new T.Mesh(new T.PlaneGeometry(0.42, 0.42), PR.shadowMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    obj.add(blob);
    obj.scale.setScalar(1.1);
    obj.position.set(hx, 0.3, hz);
    scene.add(obj);
    catState = {
      obj: obj,
      x: hx,
      z: hz,
      home: { x: hx, z: hz },
      y: 0.3,
      state: 'sleep',
      t: 12 + Math.random() * 12,
      target: null,
      stopsLeft: 0,
      returning: false,
    };
  }

  function catWalkTo(target, returning) {
    catState.target = target;
    catState.returning = !!returning;
    catState.state = 'walk';
    catState.y = 0;
  }

  function catArrive() {
    var c = catState;
    if (c.returning) {
      c.state = 'sleep';
      c.y = 0.3;
      c.t = 45 + Math.random() * 55;
      c.obj.position.y = c.y;
      return;
    }
    c.state = 'rest';
    c.y = 0;
    c.doze = Math.random() < 0.45;
    c.t = c.doze ? 6 + Math.random() * 6 : 2.5 + Math.random() * 3;
    c.stopsLeft -= 1;
  }

  function updateCat(dt, now) {
    var c = catState;
    if (!c || !state.settings.catRoam) return;
    c.t -= dt;
    if (c.state === 'sleep') {
      c.obj.rotation.z = 0.12;
      c.obj.position.y = c.y + Math.sin(now * 0.002) * 0.004;
      if (c.t <= 0) {
        c.obj.rotation.z = 0;
        c.stopsLeft = 2 + Math.floor(Math.random() * 3);
        catWalkTo(catFreeSpot(), false);
      }
    } else if (c.state === 'rest') {
      c.obj.rotation.z = c.doze ? 0.16 : 0.06;
      c.obj.position.y = c.doze ? 0.02 : 0.01;
      if (c.t <= 0) {
        c.obj.rotation.z = 0;
        if (c.stopsLeft > 0) catWalkTo(catFreeSpot(), false);
        else catWalkTo({ x: c.home.x, z: c.home.z }, true);
      }
    } else if (c.state === 'walk') {
      var dx = c.target.x - c.x;
      var dz = c.target.z - c.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.14) {
        c.x = c.target.x;
        c.z = c.target.z;
        catArrive();
      } else {
        var step = Math.min(d, 0.55 * dt);
        var nx = c.x + (dx / d) * step;
        var nz = c.z + (dz / d) * step;
        var nearHome = Math.sqrt((c.x - c.home.x) * (c.x - c.home.x) + (c.z - c.home.z) * (c.z - c.home.z)) < 0.65;
        if (catBlocked(nx, nz) && !(nearHome && !c.returning)) {
          if (c.returning) {
            c.x = c.home.x;
            c.z = c.home.z;
            catArrive();
          } else {
            catArrive();
          }
        } else {
          c.x = nx;
          c.z = nz;
          c.obj.rotation.y = Math.atan2(dx, dz);
          c.obj.position.y = 0.02 + Math.abs(Math.sin(now * 0.012)) * 0.02;
        }
      }
    }
    c.obj.position.x = c.x;
    c.obj.position.z = c.z;
    var parts = c.obj.userData.cat;
    if (parts) {
      parts.tail.rotation.z = Math.sin(now * 0.004) * 0.18;
      parts.head.rotation.y = Math.sin(now * 0.0009) * 0.35;
    }
  }

  // ---------------------------------------------------------------- anchors
  // The video pet's bed / desk / home anchors have to follow the furniture:
  // recompute them after every layout change instead of only once at startup.
  function anchorItems() {
    var found = { bed: null, computer: null, sofa: null, catbed: null };
    state.items.forEach(function (it) {
      var id = it.def.id;
      if (id === 'bed') found.bed = it;
      else if (id === 'computer') found.computer = it;
      else if (id === 'sofa') found.sofa = it;
      else if (id === 'catbed') found.catbed = it;
    });
    return found;
  }

  function deskAnchor(computerItem, sofaItem, prevDesk) {
    if (computerItem) return { x: computerItem.x + 0.6, z: computerItem.z + 0.62, y: 0 };
    function inside(p) {
      return p.x > 0.45 && p.x < R.w - 0.45 && p.z > 0.45 && p.z < R.d - 0.45;
    }
    function farFromOld(p) {
      if (!prevDesk) return true;
      var dx = p.x - prevDesk.x;
      var dz = p.z - prevDesk.z;
      return Math.sqrt(dx * dx + dz * dz) > 1.5;
    }
    // Fallback 1: in front of the sofa.
    if (sofaItem) {
      var inFront = { x: sofaItem.x, z: sofaItem.z + 0.95 };
      if (inside(inFront) && !catBlocked(inFront.x, inFront.z) && farFromOld(inFront)) {
        return { x: inFront.x, z: inFront.z, y: 0 };
      }
    }
    // Fallback 2: the regular home spot.
    var homeP = { x: 3.9, z: 4.0 };
    if (inside(homeP) && !catBlocked(homeP.x, homeP.z) && farFromOld(homeP)) {
      return { x: homeP.x, z: homeP.z, y: 0 };
    }
    // Fallback 3: any legal spot that is clearly away from the old desk.
    for (var i = 0; i < 80; i++) {
      var spot = catFreeSpot();
      if (farFromOld(spot)) return { x: spot.x, z: spot.z, y: 0 };
    }
    return { x: R.w * 0.5, z: R.d * 0.62, y: 0 };
  }

  function computeAnchors(prevDesk) {
    var f = anchorItems();
    return {
      home: { x: 3.9, z: 4.0, y: 0 },
      bed: f.bed ? { x: f.bed.x, z: f.bed.z + 0.02, y: 0.86 } : { x: 1.9, z: 1.05, y: 0.86 },
      desk: deskAnchor(f.computer, f.sofa, prevDesk),
      cat: f.catbed ? { x: f.catbed.x, z: f.catbed.z + 0.8, y: 0 } : { x: 4.6, z: 1.45, y: 0 },
    };
  }

  // save() runs after every layout change (place / drag / remove / rotate /
  // reset), so hooking refreshAnchors() there covers all of them.
  function refreshAnchors() {
    if (!state.char || !state.char.obj || !state.char.obj.setAnchors) return false;
    var prev = state.char.anchors || null;
    var next = computeAnchors(prev ? prev.desk : null);
    var changed = !prev ||
      Math.abs(prev.desk.x - next.desk.x) > 1e-4 || Math.abs(prev.desk.z - next.desk.z) > 1e-4 ||
      Math.abs(prev.bed.x - next.bed.x) > 1e-4 || Math.abs(prev.bed.z - next.bed.z) > 1e-4;
    state.char.anchors = next;
    if (changed) state.char.obj.setAnchors({ home: next.home, bed: next.bed, desk: next.desk });
    return changed;
  }

  function createCharacter() {
    var anchors = computeAnchors(null);
    var obj = PR.makeVideoPet({
      home: anchors.home,
      bed: anchors.bed,
      desk: anchors.desk,
      cat: anchors.cat,
      nextHome: randomHomeSpot,
    });
    state.char = { x: 3.9, z: 4.0, obj: obj, anchors: anchors, faceAngle: Math.PI * 0.25, idleSince: performance.now(), sleeping: false, yawnAt: 0, zzAt: 0, tp: null };
    obj.root.visible = state.present;  // 召回期间创建角色也要隐藏，避免“房间里多一个”
    scene.add(obj.root);
  }

  function applySettings() {
    var s = state.settings;
    if (state.char) {
      var sc = typeof s.scale === 'number' ? s.scale : 1;
      state.char.obj.root.scale.setScalar(state.char.obj.baseScale * sc);
      if (state.char.obj.setPace) state.char.obj.setPace(s.pace);
      if (!s.followWork) {
        state.working = false;
        state.char.obj.setWorking(false);
      }
    }
    if (!s.parallax && PR.world.setParallax) PR.world.setParallax(0, 0);
    if (!s.weatherSync && PR.weather) PR.weather.set('clear');
    tickClock();
  }

  function characterHit() {
    if (!state.char) return false;
    var hits = raycaster.intersectObject(state.char.obj.root, true);
    return hits.length > 0;
  }

  function wakeUp() {
    var ch = state.char;
    if (!ch) return;
    var wasAsleep = ch.sleeping || ch.yawnAt;
    ch.sleeping = false;
    ch.yawnAt = 0;
    ch.idleSince = performance.now();
    if (wasAsleep) ch.obj.play('wake');
  }

  function petCharacter() {
    var ch = state.char;
    if (!ch) return;
    var asleep = ch.sleeping || (ch.obj.isSleeping && ch.obj.isSleeping());
    if (asleep) {
      // At night she is not a toy: poke her awake and she gets grumpy, then
      // rolls back over. (The desktop pet card has its own 3-click wake rule.)
      if (state.night) {
        say(pickLine(['唔…别吵…', '我还困着呢…', '再睡五分钟…']), 2600);
        // A little annoyed wiggle instead of a full animation switch.
        var base = ch.obj.baseScale || 1;
        var t0 = performance.now();
        (function wiggle() {
          var k = (performance.now() - t0) / 500;
          if (k >= 1) {
            ch.obj.root.scale.setScalar(base);
            return;
          }
          var pulse = 1 + Math.sin(k * Math.PI * 10) * 0.025;
          ch.obj.root.scale.setScalar(base * pulse);
          requestAnimationFrame(wiggle);
        })();
        return;
      }
      wakeUp();
      return;
    }
    wakeUp();
    ch.obj.play('wave');
    ch.idleSince = performance.now();
    say(pickLine(['嗯？', '我在～', '怎么啦？']), 1600);
  }

  function pickLine(lines) {
    return lines[Math.floor(Math.random() * lines.length)];
  }

  var bubbleUntil = 0;
  function say(text, ms) {
    if (!ui.bubble || !text) return;
    ui.bubble.textContent = text;
    ui.bubble.classList.remove('hidden');
    bubbleUntil = performance.now() + (ms || 2600);
    updateBubble();
    try {
      parent.postMessage({ type: 'cozy-room-speech', text: text }, '*');
    } catch (err) { /* ignore */ }
  }
  PR.say = say;

  function updateBubble() {
    if (!ui.bubble || !state.char) return;
    if (performance.now() > bubbleUntil) {
      ui.bubble.classList.add('hidden');
      return;
    }
    var p = state.char.obj.root.position;
    var v = new T.Vector3(p.x, (state.char.obj.root.userData.headY || 2.35), p.z);
    v.project(world.camera);
    var x = (v.x * 0.5 + 0.5) * window.innerWidth;
    var y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    ui.bubble.style.left = Math.round(x) + 'px';
    ui.bubble.style.top = Math.round(y) + 'px';
  }

  // Late-night companion: while you keep working she stays up, checks in now and
  // then, and after 1am she tells you to sleep and goes to bed herself.
  var nightTalk = { dayKey: '', last: 0, urged: false, lines: 0 };
  function nightWatch() {
    if (!state.night || !state.char) return;
    var ch = state.char;
    var asleep = ch.sleeping || (ch.obj.isSleeping && ch.obj.isSleeping());
    var d = new Date();
    var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (nightTalk.dayKey !== key) {
      nightTalk = { dayKey: key, last: 0, urged: false, lines: 0 };
    }
    if (!state.working || asleep) return;
    var h = (typeof window.__COZY_HOUR === 'number') ? window.__COZY_HOUR : d.getHours();
    if (h >= 1 && h < 5 && !nightTalk.urged) {
      nightTalk.urged = true;
      say('一点了…去睡觉吧。', 5000);
      setTimeout(function () {
        if (!state.char) return;
        if (state.char.obj.play) state.char.obj.play('sleep');
        state.char.sleeping = true;
      }, 6000);
      return;
    }
    var now = performance.now();
    if (nightTalk.lines < 3 && now - nightTalk.last > 20 * 60 * 1000) {
      nightTalk.last = now;
      nightTalk.lines += 1;
      say(pickLine(['还在忙呀…', '我陪你一会儿。', '别太晚了。']), 3200);
    }
  }

  function teleportTo(x, z) {
    var ch = state.char;
    if (!ch) return;
    wakeUp();
    var gx = Math.floor(x / CELL);
    var gz = Math.floor(z / CELL);
    if (isBlocked(gx, gz)) {
      var nf = nearestFree(gx, gz);
      if (!nf) return;
      x = (nf.x + 0.5) * CELL;
      z = (nf.z + 0.5) * CELL;
    }
    x = clamp(x, 0.4, R.w - 0.4);
    z = clamp(z, 0.4, R.d - 0.4);
    PR.fx.burst(ch.x, ch.z, 0x9fe3ff);
    PR.fx.ring(ch.x, ch.z);
    PR.fx.flash(ch.x, ch.z);
    ch.tp = { x: x, z: z, t: 0, switched: false };
    ch.idleSince = performance.now();
    marker.position.set(x, 0.02, z);
    markerLife = 1;
  }

  function updateCharacter(dt, now) {
    var ch = state.char;
    if (!ch) return;

    if (ch.tp) {
      var tp = ch.tp;
      tp.t += dt;
      var k;
      if (!tp.switched) {
        k = Math.max(0.02, 1 - tp.t / 0.2);
        if (tp.t >= 0.2) {
          tp.switched = true;
          ch.x = tp.x;
          ch.z = tp.z;
          ch.faceAngle = Math.PI * 0.25;
          ch.obj.face(ch.faceAngle);
          ch.obj.root.position.set(ch.x, 0, ch.z);
          PR.fx.burst(ch.x, ch.z, 0xc8f2ff);
          PR.fx.ring(ch.x, ch.z, 0xd8f4ff);
          PR.fx.flash(ch.x, ch.z);
        }
      } else {
        k = 1 + Math.sin(Math.min(1, (tp.t - 0.2) / 0.26) * Math.PI) * 0.16;
      }
      if (tp.t >= 0.52) {
        ch.tp = null;
        k = 1;
      }
      ch.obj.root.scale.setScalar(ch.obj.baseScale * k);
    } else {
      var wantScale = ch.obj.baseScale * (typeof state.settings.scale === 'number' ? state.settings.scale : 1);
      if (Math.abs(ch.obj.root.scale.x - wantScale) > 0.001) {
        ch.obj.root.scale.setScalar(wantScale);
      }
    }

    var hour = new Date().getHours();
    var isNight = state.settings.nightSleep && (hour >= 23 || hour < 7);
    if (!ch.tp && !ch.sleeping && !state.working && now - ch.idleSince > (isNight ? 120000 : 600000)) {
      ch.sleeping = true;
      ch.yawnAt = now;
      ch.obj.play('sleep');
    }

    ch.obj.update(dt, false);
  }

  // ------------------------------------------------------------------ placing
  var raycaster = new T.Raycaster();
  var ndc = new T.Vector2();
  var groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function setRay(e) {
    var rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  function floorPoint() {
    var p = new T.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, p) ? p : null;
  }

  function wallHit() {
    var hits = raycaster.intersectObjects(world.wallMeshes, false);
    if (!hits.length) return null;
    var h = hits[0];
    var n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    return { point: h.point, normal: n, distance: h.distance };
  }

  function itemHit() {
    var groups = state.items.map(function (it) { return it.group; });
    if (!groups.length) return null;
    var hits = raycaster.intersectObjects(groups, true);
    if (!hits.length) return null;
    var o = hits[0].object;
    while (o && !o.userData.item) o = o.parent;
    return o ? o.userData.item : null;
  }

  function transparentClone(group) {
    var mats = [];
    group.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = false;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      var cloned = list.map(function (m) {
        var c = m.clone();
        c.transparent = true;
        c.opacity = 0.55;
        c.depthWrite = false;
        mats.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
    return mats;
  }

  function startPlacing(def) {
    cancelPlacing(true);
    var variant = def.id === 'art' ? Math.floor(Math.random() * 4) : 0;
    var group = def.build(variant);
    var mats = transparentClone(group);
    group.visible = false;
    scene.add(group);
    state.placing = {
      def: def,
      variant: variant,
      group: group,
      mats: mats,
      rot: 0,
      valid: false,
      x: 0,
      z: 0,
      wall: null,
      u: 0,
      y: 0,
    };
    padFloor.visible = def.zone !== 'wall';
    padWall.visible = def.zone === 'wall';
    padFloor.material.color.set(0x8be3a4);
    padWall.material.color.set(0x8be3a4);
    updateHint();
    refreshCatalog();
  }

  function cancelPlacing(silent) {
    var p = state.placing;
    if (!p) return;
    scene.remove(p.group);
    disposeGroup(p.group);
    p.mats.forEach(function (m) { m.dispose(); });
    state.placing = null;
    padFloor.visible = false;
    padWall.visible = false;
    if (!silent) {
      updateHint();
      refreshCatalog();
    }
  }

  function updatePlacing() {
    var p = state.placing;
    if (!p) return;
    var def = p.def;
    if (def.zone === 'wall') {
      var wh = wallHit();
      if (!wh) {
        p.group.visible = false;
        p.valid = false;
        padWall.visible = false;
        return;
      }
      var wall = Math.abs(wh.normal.x) > 0.7 ? 'west' : 'north';
      var u = snap(wall === 'north' ? wh.point.x : wh.point.z);
      var y = snap(wh.point.y);
      var limit = wall === 'north' ? R.w : R.d;
      u = clamp(u, def.w / 2 + 0.35, limit - def.w / 2 - 0.35);
      y = clamp(y, def.h / 2 + 0.35, R.wallH - def.h / 2 - 0.08);
      p.wall = wall;
      p.u = u;
      p.y = y;
      p.valid = canPlaceWall(def, wall, u, y, null);
      p.group.visible = true;
      if (wall === 'north') {
        p.group.position.set(u, y - def.h / 2, 0.03);
        p.group.rotation.y = 0;
        padWall.position.set(u, y, 0.025);
        padWall.rotation.set(0, 0, 0);
      } else {
        p.group.position.set(0.03, y - def.h / 2, u);
        p.group.rotation.y = Math.PI / 2;
        padWall.position.set(0.025, y, u);
        padWall.rotation.set(0, Math.PI / 2, 0);
      }
      padWall.scale.set(def.w * 1.02, def.h * 1.02, 1);
      padWall.visible = true;
      padWall.material.color.set(p.valid ? 0x8be3a4 : 0xff7b7b);
      return;
    }

    var fp = floorPoint();
    if (!fp) {
      p.group.visible = false;
      p.valid = false;
      padFloor.visible = false;
      return;
    }
    var f = footprint(def, p.rot);
    var x = clamp(snap(fp.x), f.w / 2 + EDGE, R.w - f.w / 2 - EDGE);
    var z = clamp(snap(fp.z), f.d / 2 + EDGE, R.d - f.d / 2 - EDGE);
    p.x = x;
    p.z = z;
    p.valid = canPlaceFloor(def, x, z, p.rot, null);
    p.group.visible = true;
    p.group.position.set(x, 0, z);
    p.group.rotation.y = p.rot;
    padFloor.position.set(x, 0.012, z);
    padFloor.scale.set(f.w * 1.02, f.d * 1.02, 1);
    padFloor.visible = true;
    padFloor.material.color.set(p.valid ? 0x8be3a4 : 0xff7b7b);
  }

  function confirmPlace() {
    var p = state.placing;
    if (!p || !p.valid) {
      if (p) toast('这里放不下，换个位置试试');
      return;
    }
    var rec;
    if (p.def.zone === 'wall') {
      rec = spawn(p.def, { wall: p.wall, u: p.u, y: p.y, variant: p.variant });
    } else {
      rec = spawn(p.def, { x: p.x, z: p.z, rot: p.rot, variant: p.variant });
    }
    select(rec);
    rebuildNav();
    save();
    if (state.char) state.char.obj.play('cheer');
    toast('放好啦');
  }

  function rotatePlacing() {
    var p = state.placing;
    if (!p) return;
    if (p.def.zone === 'wall') return;
    p.rot = (p.rot + Math.PI / 2) % (Math.PI * 2);
    updatePlacing();
  }

  // ------------------------------------------------------------------ select
  function select(rec) {
    state.selected = rec;
    if (!rec) {
      selPad.visible = false;
      selEdge.visible = false;
      if (selHelper) selHelper.visible = false;
      ui.selbar.classList.add('hidden');
      updateHint();
      return;
    }
    ui.selbar.classList.remove('hidden');
    ui.selname.textContent = '「' + rec.def.name + '」';
    ui.btnRotate.style.display = rec.wall ? 'none' : '';
    updateSelVisual();
    updateHint();
  }

  function updateSelVisual() {
    var rec = state.selected;
    if (!rec) return;
    if (rec.wall) {
      selPad.visible = false;
      selEdge.visible = false;
      if (!selHelper) {
        selHelper = new T.BoxHelper(rec.group, 0xffd8a4);
        scene.add(selHelper);
      } else {
        selHelper.setFromObject(rec.group);
      }
      selHelper.visible = true;
      return;
    }
    if (selHelper) selHelper.visible = false;
    var f = footprint(rec.def, rec.rot);
    selPad.position.set(rec.x, 0.012, rec.z);
    selPad.scale.set(f.w * 1.04, f.d * 1.04, 1);
    selPad.visible = true;
    selEdge.position.set(rec.x, 0.018, rec.z);
    selEdge.scale.set(f.w * 1.04, f.d * 1.04, 1);
    selEdge.visible = true;
  }

  function rotateSelected() {
    var rec = state.selected;
    if (!rec || rec.wall) return;
    var newRot = (rec.rot + Math.PI / 2) % (Math.PI * 2);
    var applied = null;
    // Try 90° first; large pieces often cannot fit sideways but a 180° turn keeps
    // the same footprint, so fall back to that instead of refusing.
    var candidates = [newRot, (rec.rot + Math.PI) % (Math.PI * 2)];
    for (var ci = 0; ci < candidates.length; ci++) {
      var r2 = candidates[ci];
      var f2 = footprint(rec.def, r2);
      var x2 = clamp(rec.x, f2.w / 2 + EDGE, R.w - f2.w / 2 - EDGE);
      var z2 = clamp(rec.z, f2.d / 2 + EDGE, R.d - f2.d / 2 - EDGE);
      if (canPlaceFloor(rec.def, x2, z2, r2, rec)) {
        applied = { rot: r2, x: x2, z: z2 };
        break;
      }
    }
    if (!applied) {
      toast('这里转不开，先挪一下');
      return;
    }
    if (applied.rot !== newRot) toast('90° 放不下，已转 180°');
    rec.x = applied.x;
    rec.z = applied.z;
    rec.rot = applied.rot;
    rec.group.position.set(applied.x, 0, applied.z);
    rec.group.rotation.y = applied.rot;
    rebuildNav();
    updateSelVisual();
    save();
  }

  // ------------------------------------------------------------------ events
  function onDown(e) {
    if (e.button !== 0) return;
    setRay(e);
    if (state.placing) {
      updatePlacing();
      confirmPlace();
      return;
    }
    if (characterHit()) {
      petCharacter();
      return;
    }
    var rec = itemHit();
    if (rec) {
      select(rec);
      if (!rec.wall) {
        var fp = floorPoint();
        if (fp) {
          state.drag = { rec: rec, ox: fp.x - rec.x, oz: fp.z - rec.z, moved: false };
          canvas.style.cursor = 'grabbing';
        }
      }
      return;
    }
    var wh = wallHit();
    var fp2 = floorPoint();
    if (wh && (!fp2 || wh.distance < fp2.distanceTo(camera.position))) {
      select(null);
      return;
    }
    select(null);
  }

  function onMove(e) {
    setRay(e);
    if (state.placing) {
      updatePlacing();
      return;
    }
    if (state.drag) {
      var rec = state.drag.rec;
      var fp = floorPoint();
      if (!fp) return;
      var f = footprint(rec.def, rec.rot);
      var x = clamp(snap(fp.x - state.drag.ox), f.w / 2 + EDGE, R.w - f.w / 2 - EDGE);
      var z = clamp(snap(fp.z - state.drag.oz), f.d / 2 + EDGE, R.d - f.d / 2 - EDGE);
      if (canPlaceFloor(rec.def, x, z, rec.rot, rec)) {
        rec.x = x;
        rec.z = z;
        rec.group.position.set(x, 0, z);
        state.drag.moved = true;
        updateSelVisual();
      }
      return;
    }
    var hit = itemHit();
    canvas.style.cursor = hit ? 'grab' : 'default';
  }

  function onUp() {
    if (!state.drag) return;
    if (state.drag.moved) {
      rebuildNav();
      save();
    }
    state.drag = null;
    canvas.style.cursor = 'default';
    updateSelVisual();
  }

  function onLeave() {
    if (!state.drag) canvas.style.cursor = 'default';
  }

  function onContext(e) {
    e.preventDefault();
    if (state.placing) {
      cancelPlacing();
      return;
    }
    setRay(e);
    var rec = itemHit();
    if (rec) {
      removeItem(rec);
      toast('收起来啦');
    }
  }

  function onDbl(e) {
    setRay(e);
    if (state.placing) return;
    var rec = itemHit();
    if (rec) {
      removeItem(rec);
      toast('收起来啦');
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (state.placing) {
        cancelPlacing();
      } else {
        select(null);
      }
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      if (state.placing) rotatePlacing();
      else if (state.selected) rotateSelected();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selected) {
        removeItem(state.selected);
        toast('收起来啦');
      }
    }
  }

  // --------------------------------------------------------------------- UI
  var TABS = [
    { id: 'furniture', label: '家具' },
    { id: 'decor', label: '软装' },
    { id: 'wall', label: '墙面' },
  ];
  var currentTab = 'furniture';

  function buildTabs() {
    ui.tabs.innerHTML = '';
    TABS.forEach(function (tab) {
      var b = document.createElement('button');
      b.className = 'tab' + (tab.id === currentTab ? ' on' : '');
      b.textContent = tab.label;
      b.addEventListener('click', function () {
        currentTab = tab.id;
        buildTabs();
        refreshCatalog();
      });
      ui.tabs.appendChild(b);
    });
  }

  function refreshCatalog() {
    ui.catalog.innerHTML = '';
    PR.ITEMS.filter(function (d) { return d.cat === currentTab; }).forEach(function (def) {
      var b = document.createElement('button');
      var on = state.placing && state.placing.def === def;
      b.className = 'card' + (on ? ' on' : '');
      var img = document.createElement('img');
      img.src = thumbs[def.id] || '';
      img.alt = def.name;
      var span = document.createElement('span');
      span.textContent = def.name;
      b.appendChild(img);
      b.appendChild(span);
      b.addEventListener('click', function () { startPlacing(def); });
      ui.catalog.appendChild(b);
    });
  }

  function updateHint() {
    var p = state.placing;
    if (p) {
      ui.hint.textContent = p.def.zone === 'wall'
        ? '把「' + p.def.name + '」挂到墙上：点墙面放下 · Esc 取消'
        : '放置「' + p.def.name + '」：点地板放下 · R 旋转 · Esc 取消';
      return;
    }
    if (state.selected) {
      ui.hint.textContent = state.selected.wall
        ? '已选中「' + state.selected.def.name + '」· 按 Delete 或点「收起」'
        : '已选中「' + state.selected.def.name + '」· 拖动移动 · R 旋转 · Delete 收起';
      return;
    }
    ui.hint.textContent = '家具架点一件放进房间 · 拖拽摆位置 · 点小蓝摸摸她';
  }

  function applyNightUI() {
    document.body.classList.toggle('night', state.night);
  }

  function updateNightButton() {
    applyNightUI();
    ui.btnNight.textContent = state.night ? '☀ 白天' : '☾ 夜晚';
  }

  // ------------------------------------------------------------- clock / weather
  var WMO_TEXT = {
    0: '晴', 1: '晴', 2: '多云', 3: '阴', 45: '雾', 48: '雾',
    51: '小雨', 53: '小雨', 55: '中雨', 56: '冻雨', 57: '冻雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪',
    80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '阵雪',
    95: '雷阵雨', 96: '雷阵雨', 99: '雷暴',
  };
  function weatherText(code) { return WMO_TEXT[code] || '晴'; }

  function weatherKindOf(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'cloudy';
    if (code === 3) return 'overcast';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return 'cloudy';
  }

  function weatherIcon(code) {
    return { clear: '☀', cloudy: '⛅', overcast: '☁', fog: '🌫', rain: '🌧', snow: '❄', thunder: '⛈' }[weatherKindOf(code)] || '';
  }

  function renderClock() {
    var d = new Date();
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    if (ui.clockTime) ui.clockTime.textContent = hh + ':' + mm;
    if (ui.clockWeather) {
      var w = state.weather;
      ui.clockWeather.textContent = w && w.city
        ? w.city + ' · ' + weatherIcon(w.code) + ' ' + weatherText(w.code) + ' ' + Math.round(w.temp) + '°'
        : '';
    }
  }

  function clockNight() {    var h = new Date().getHours();
    return h >= 19 || h < 6;
  }

  // Real-clock day/night: keeps the room in sync with the computer clock unless
  // the user takes manual control (the ☾ button or the settings toggle).
  function tickClock() {
    renderClock();
    if (!state.settings.timeSync) return;
    var n = clockNight();
    if (n !== state.night) {
      state.night = n;
      world.setNight(n);
      updateNightButton();
      syncAmbient();
    }
  }

  // Fireflies on any dry night (clear / cloudy / overcast); not in rain, snow,
  // fog or thunder.
  function syncAmbient() {
    if (!PR.weather) return;
    var kind = PR.weather.kind;
    var dry = kind === 'clear' || kind === 'cloudy' || kind === 'overcast';
    PR.weather.setFireflies(!!state.night && dry);
  }

  // The plugin tells us where the chat column starts; keep the clock chip there
  // so it sits above the conversation instead of over the window buttons.
  function applyClockAnchor() {
    var el = document.querySelector('.room-clock');
    if (!el) return;
    // With the brand header visible (standalone / interactive room) the chip
    // belongs under the title; the chat-column anchor only applies in embed mode.
    var embedded = document.body.classList.contains('embed');
    if (state.chatAnchor && embedded) {
      el.style.left = Math.max(8, Math.round(state.chatAnchor.left + 10)) + 'px';
      el.style.top = Math.max(8, Math.round(state.chatAnchor.top + 10)) + 'px';
      el.style.right = 'auto';
    } else {
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
    }
  }

  // ------------------------------------------------------------- thumbnails
  function renderThumb(def) {
    var size = 128;
    var tmp = new T.Scene();
    var obj = def.build(def.id === 'art' ? 0 : 0);
    obj.updateMatrixWorld(true);
    tmp.add(obj);
    tmp.add(new T.HemisphereLight(0xfff2e2, 0x4a3a52, 1.5));
    var d1 = new T.DirectionalLight(0xffd9b0, 2.6);
    d1.position.set(4, 7, 5);
    tmp.add(d1);
    var d2 = new T.DirectionalLight(0x8f9bff, 0.7);
    d2.position.set(-5, 4, -4);
    tmp.add(d2);

    var bbox = new T.Box3().setFromObject(obj);
    var c = bbox.getCenter(new T.Vector3());
    var s = bbox.getSize(new T.Vector3());
    var maxDim = Math.max(s.x, s.y, s.z, 0.4);
    var pad = maxDim * 0.78;
    var cam = new T.OrthographicCamera(-pad, pad, pad, -pad, 0.05, 200);
    cam.position.set(c.x + maxDim * 1.5, c.y + maxDim * 1.5, c.z + maxDim * 1.9);
    cam.lookAt(c);

    var rt = new T.WebGLRenderTarget(size, size);
    rt.texture.colorSpace = T.SRGBColorSpace;
    var prevColor = new T.Color();
    renderer.getClearColor(prevColor);
    var prevAlpha = renderer.getClearAlpha();
    var prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(tmp, cam);
    var buf = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevColor, prevAlpha);

    var out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    var ctx = out.getContext('2d');
    var img = ctx.createImageData(size, size);
    for (var y = 0; y < size; y++) {
      var src = (size - 1 - y) * size * 4;
      img.data.set(buf.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    rt.dispose();
    disposeGroup(obj);
    return out.toDataURL('image/png');
  }

  function fallbackThumb(def) {
    var cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    var ctx = cv.getContext('2d');
    ctx.translate(64, 70);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c9a3cf';
    ctx.fillRect(-30, -30, 60, 60);
    ctx.fillStyle = '#e6cfe8';
    ctx.fillRect(-30, -40, 60, 12);
    return cv.toDataURL('image/png');
  }

  function buildThumbs() {
    PR.ITEMS.forEach(function (def) {
      try {
        thumbs[def.id] = renderThumb(def);
      } catch (err) {
        thumbs[def.id] = fallbackThumb(def);
      }
    });
  }

  // ------------------------------------------------------------- world setup
  var DEFAULT_FLOOR = [
    ['rug', 6.2, 5.4, 0],
    ['sofa', 5.3, 5.5, -Math.PI / 2],
    ['table', 6.55, 5.5, 0],
    ['tv', 7.45, 5.5, Math.PI / 2],
    ['bed', 2.0, 1.2, 0],
    ['wardrobe', 0.42, 3.15, Math.PI / 2],
    ['shelf', 0.28, 5.2, Math.PI / 2],
    ['computer', 6.3, 0.85, 0],
    ['chair', 6.3, 1.7, Math.PI],
    ['display', 3.8, 0.45, 0],
    ['catbed', 4.85, 0.6, 0],
    ['lamp', 3.3, 2.25, 0],
    ['plant', 7.6, 1.25, 0],
    ['palm', 7.45, 3.3, 0],
    ['side', 7.3, 2.7, 0],
    ['beanbag', 6.5, 2.4, 0],
    ['record', 1.0, 4.5, Math.PI / 2],
    ['boxes', 1.0, 6.4, 0],
    ['boxes', 2.1, 6.6, 0],
    ['plant', 1.6, 3.8, 0],
    ['console', 2.3, 2.7, 0],
    ['telescope', 5.2, 1.5, 0],
    ['roundRug', 3.4, 4.5, 0],
    ['cushion', 3.9, 4.9, 0],
    ['books', 2.4, 3.5, 0],
    ['lamp', 6.2, 4.4, 0],
  ];
  var DEFAULT_WALL = [
    ['wallShelf', 'north', 1.2, 2.3, 0],
    ['art', 'north', 2.75, 2.8, 0],
    ['clock', 'north', 3.75, 3.35, 0],
    ['art', 'north', 7.1, 2.6, 2],
    ['lights', 'west', 4.6, 3.3, 0],
    ['clock', 'west', 6.3, 3.3, 0],
  ];

  function applyDefaults() {
    DEFAULT_FLOOR.forEach(function (row) {
      var def = defById(row[0]);
      if (!def) return;
      spawn(def, { x: row[1], z: row[2], rot: row[3] });
    });
    DEFAULT_WALL.forEach(function (row) {
      var def = defById(row[0]);
      if (!def) return;
      spawn(def, { wall: row[1], u: row[2], y: row[3], variant: row[4] });
    });
  }

  function save() {
    try {
      var data = { v: 1, night: state.night, floor: [], wall: [] };
      state.items.forEach(function (it) {
        if (it.wall) {
          data.wall.push({ id: it.def.id, wall: it.wall, u: +it.u.toFixed(3), y: +it.y.toFixed(3), variant: it.variant });
        } else {
          data.floor.push({ id: it.def.id, x: +it.x.toFixed(3), z: +it.z.toFixed(3), rot: +it.rot.toFixed(3), variant: it.variant });
        }
      });
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) { /* storage unavailable */ }
    refreshAnchors();
  }

  function loadLayout() {
    var data = null;
    try {
      data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch (err) {
      data = null;
    }
    if (data && (Array.isArray(data.floor) || Array.isArray(data.wall))) {
      (data.floor || []).forEach(function (e) {
        var def = defById(e.id);
        if (!def) return;
        spawn(def, { x: +e.x || 0, z: +e.z || 0, rot: +e.rot || 0, variant: e.variant || 0 });
      });
      (data.wall || []).forEach(function (e) {
        var def = defById(e.id);
        if (!def) return;
        spawn(def, { wall: e.wall === 'west' ? 'west' : 'north', u: +e.u || 0, y: +e.y || 0, variant: e.variant || 0 });
      });
      if (data.night) {
        state.night = true;
        world.setNight(true);
      }
      } else {
      applyDefaults();
    }
  }

  function resetLayout() {
    clearAll();
    applyDefaults();
    rebuildNav();
    save();
    toast('已恢复最初的布置');
  }

  function hideLoading() {
    ui.loading.classList.add('done');
    setTimeout(function () {
      if (ui.loading.parentNode) ui.loading.parentNode.removeChild(ui.loading);
    }, 600);
  }

  // ------------------------------------------------------------------- loop
  function animateProps(now) {
    var t = now / 1000;
    for (var i = 0; i < state.items.length; i++) {
      var rec = state.items[i];
      var robot = rec.group.userData && rec.group.userData.robot;
      if (!robot) continue;
      robot.head.rotation.y = Math.sin(t * 0.9) * 0.45;
      robot.body.position.y = robot.baseY + Math.sin(t * 1.7) * 0.012;
      robot.eyeMat.emissiveIntensity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.4));
    }
  }

  var lastT = performance.now();
  var lastPetState = '';

  function reportPetState() {
    if (!state.char) return;
    var s = state.char.obj && state.char.obj.isSleeping ? state.char.obj.isSleeping() : !!state.char.sleeping;
    var clip = state.char.obj && state.char.obj.getClip ? state.char.obj.getClip() : '';
    var key = (s ? '1' : '0') + '|' + clip;
    if (key === lastPetState) return;
    lastPetState = key;
    try {
      parent.postMessage({ type: 'cozy-room-pet-state', sleeping: s, clip: clip }, '*');
    } catch (err) { /* ignore */ }
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    world.update(dt);
    updateCharacter(dt, now);
    updateCat(dt, now);
    animateProps(now);
    reportPetState();
    if (PR.fx) PR.fx.update(dt);
    if (PR.weather) PR.weather.update(dt);
    updateBubble();
    nightWatch();
    if (markerLife > 0) {
      markerLife = Math.max(0, markerLife - dt * 1.3);
      marker.material.opacity = markerLife * 0.9;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------- init
  function bindUI() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointermove', function (e) {
      if (!state.settings.parallax) return;
      var r = canvas.getBoundingClientRect();
      var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      if (PR.world.setParallax) PR.world.setParallax(nx, ny);
    }, { passive: true });
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('dblclick', onDbl);
    window.addEventListener('keydown', onKey);

    ui.btnNight.addEventListener('click', function () {
      state.settings.timeSync = false;
      state.night = !state.night;
      world.setNight(state.night);
      updateNightButton();
      save();
      // Manual override is authoritative: tell the plugin so its settings panel
      // and localStorage stay in sync (postMessage is the only cross-origin path).
      try {
        parent.postMessage({ type: 'cozy-room-settings', settings: { timeSync: false } }, '*');
      } catch (err) { /* ignore */ }
      toast('已切换为手动昼夜（时间同步已关闭，可在设置里重新开启）');
    });
    ui.btnReset.addEventListener('click', resetLayout);
    ui.btnRotate.addEventListener('click', function () {
      if (state.selected) rotateSelected();
    });
    ui.btnRemove.addEventListener('click', function () {
      if (state.selected) {
        removeItem(state.selected);
        toast('收起来啦');
      }
    });
  }

  function startGame() {
    createCharacter();
    startStatusPoll();
    startCommandPoll();
    spawnCat();
    postLibrary();
    applySettings();
    tickClock();
    applyClockAnchor();
    if (PR.weather) PR.weather.set(state.weather ? weatherKindOf(state.weather.code) : 'clear');
    syncAmbient();
    setInterval(tickClock, 15000);
    bindUI();
    refreshCatalog();
    updateHint();
    updateNightButton();
    applyNightUI();
    hideLoading();
    requestAnimationFrame(frame);
  }

  var booted = false;
  function boot(err, textures) {
    if (booted) return;
    booted = true;
    if (err) {
      PR.petSkinError = err;
    } else {
      PR.petTextures = textures;
    }
    startGame();
  }

  function init() {
    buildThumbs();
    buildTabs();
    loadLayout();
    rebuildNav();
    try {
      var params = new URLSearchParams(location.search);
      if (params.get('night') === '1') {
        state.night = true;
        world.setNight(true);
      }
      if (params.get('embed') === '1') document.body.classList.add('embed');
    } catch (err) { /* ignore */ }
    startGame();
  }

  window.addEventListener('message', function (e) {
    var o = e.origin;
    if (o !== 'null' && !/^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?|dsh-app:\/\/[^/]*|app:\/\/[^/]*)$/.test(o)) return;
    if (!e.data) return;
    if (e.data.type === 'cozy-room-pointer') {
      if (!state.settings.parallax) return;
      if (PR.world.setParallax) PR.world.setParallax(e.data.x, e.data.y);
      return;
    }
    if (e.data.type === 'cozy-room-anchor') {
      state.chatAnchor = { left: +e.data.left || 0, top: +e.data.top || 0 };
      applyClockAnchor();
      return;
    }
    if (e.data.type === 'cozy-room-weather') {
      state.weather = e.data.weather || null;
      if (state.weather && PR.weather) PR.weather.set(weatherKindOf(state.weather.code));
      if (!state.weather && PR.weather) PR.weather.set('clear');
      syncAmbient();
      renderClock();
      return;
    }
    if (e.data.type === 'cozy-room-presence') {
      var wasPresent = state.present;
      state.present = !!e.data.present;
      if (state.char) state.char.obj.root.visible = state.present;
      if (PR.fx && state.char && wasPresent !== state.present) {
        var wp = state.char.obj.root.position;
        if (state.present) {
          PR.fx.burst(wp.x, wp.z, 0x9fe3ff);
          PR.fx.ring(wp.x, wp.z, 0xd8f4ff);
          PR.fx.flash(wp.x, wp.z);
        } else {
          PR.fx.burst(wp.x, wp.z, 0xc8f2ff);
          PR.fx.ring(wp.x, wp.z, 0xbfe9ff);
        }
      }
      if (state.present && !wasPresent && state.char && state.char.obj.restartLife) {
        state.char.obj.restartLife();
      }
      return;
    }
    if (e.data.type === 'cozy-room-library-request') {
      postLibrary();
      return;
    }
    if (e.data.type === 'cozy-room-action') {
      if (location.protocol !== 'http:') return;
      if (state.char && state.char.obj.playExtra) state.char.obj.playExtra(e.data.id);
      return;
    }
    if (e.data.type === 'cozy-room-settings') {
      var incoming = e.data.settings || {};
      Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
        if (incoming[k] !== undefined) state.settings[k] = incoming[k];
      });
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (err) {}
      applySettings();
      return;
    }
    if (e.data.type !== 'cozy-room-mode') return;
    document.body.classList.toggle('embed', !e.data.interactive);
    applyClockAnchor();
  });
  window.__purpleRoom = {
    get items() { return state.items.length; },
    get char() { return { x: state.char.x, z: state.char.z }; },
    get petPos() { return state.char ? { x: Math.round(state.char.obj.root.position.x * 100) / 100, z: Math.round(state.char.obj.root.position.z * 100) / 100 } : null; },
    get night() { return state.night; },
    get sleeping() { return state.char.obj && state.char.obj.isSleeping ? state.char.obj.isSleeping() : !!state.char.sleeping; },
    get working() { return !!state.working; },
    work: function (st) { if (state.char) state.char.obj.setWorkState(st); },
    get cat() { return catState ? { x: catState.x, z: catState.z, state: catState.state } : null; },
    get clip() { return state.char && state.char.obj.getClip ? state.char.obj.getClip() : null; },
    get energy() { return state.char && state.char.obj.getEnergy ? state.char.obj.getEnergy() : null; },
    get settings() { return state.settings; },
    get library() { return PR.actionLibrary ? PR.actionLibrary.length : 0; },
    get visible() { return state.char ? state.char.obj.root.visible : null; },
    get scale() { return state.char ? state.char.obj.root.scale.x : null; },
    get phase() { return state.char && state.char.obj.getPhase ? state.char.obj.getPhase() : null; },
    get weather() { return { data: state.weather, kind: PR.weather ? PR.weather.kind : null }; },
    act: function (name) { if (state.char) state.char.obj.play(name); },
    // Debug-only helper for the acceptance run: move a floor item without drag.
    debugSelect: function (id) { var rec = null; for (var i = 0; i < state.items.length; i++) { if (state.items[i].def.id === id && !state.items[i].wall) { rec = state.items[i]; break; } } if (rec) select(rec); return !!rec; },
    debugRotate: function () { ui.btnRotate.click(); },
    debugSetNight: function (v) { state.night = !!v; world.setNight(!!v); updateNightButton(); },
    debugPet: function () { petCharacter(); },
    debugSleep: function () { if (state.char) { state.char.sleeping = true; state.char.obj.play('sleep'); } },
    debugSetWorking: function (v) { state.working = !!v; if (state.char) state.char.obj.setWorking(!!v); },
    say: function (text, ms) { say(text, ms); },
    debugMoveItem: function (id, x, z) {
      var rec = null;
      for (var i = 0; i < state.items.length; i++) {
        if (state.items[i].def.id === id) { rec = state.items[i]; break; }
      }
      if (!rec || rec.wall) return false;
      rec.x = +x || 0;
      rec.z = +z || 0;
      rec.group.position.set(rec.x, 0, rec.z);
      rebuildNav();
      save();
      if (state.selected === rec) updateSelVisual();
      return true;
    },
    get selected() { return state.selected ? state.selected.def.name : null; },
    get placing() { return state.placing ? state.placing.def.name : null; },
    get layout() { return state.items.map(function (it) { return { id: it.def.id, w: it.def.w, d: it.def.d, flat: !!it.def.flat, x: it.x, z: it.z, rot: it.rot, wall: it.wall, u: it.u, y: it.y }; }); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();













































