/* Purple room - room wear visuals (staged): floor dust, dusty furniture with
   growing stains, wilted plants in stages, slip reaction.
   Reads PR.store.state.room; never writes it. */
window.PR = window.PR || {};

PR.roomVisuals = (function () {
  var T = window.THREE;
  var scene = null;
  var floorLayer = null;
  var dustTex = null;
  var spotTex = null;
  var items = [];
  var itemState = {};      // uid -> {dust, water}
  var origColors = {};     // mesh.uuid -> THREE.Color
  var spotGroups = {};     // uid -> THREE.Group
  var baseScale = {};      // uid -> number

  function makeBlobTexture(alpha, dark) {
    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    var ctx = cv.getContext('2d');
    for (var i = 0; i < 26; i++) {
      var x = Math.random() * 64, y = Math.random() * 64, r = 5 + Math.random() * 12;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + dark + ',' + alpha + ')');
      g.addColorStop(1, 'rgba(' + dark + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (var j = 0; j < 26; j++) {
      ctx.fillStyle = 'rgba(96,80,60,' + (alpha * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  function init(s) {
    scene = s;
    floorLayer = new T.Group();
    floorLayer.name = 'room-dust-floor';
    scene.add(floorLayer);
    dustTex = makeBlobTexture(0.42, '120,100,78');
    spotTex = makeBlobTexture(0.5, '110,92,70');
  }

  function setItems(list) {
    items = (list || []).slice();
    baseScale = {};
    items.forEach(function (it) {
      if (it.group) baseScale[it.uid] = it.group.scale.x || 1;
    });
    clearSpots();
    refresh();
  }

  function restore(mesh) {
    if (origColors[mesh.uuid]) mesh.material.color.copy(origColors[mesh.uuid]);
  }

  function tintMesh(mesh, color, amount) {
    if (!origColors[mesh.uuid]) origColors[mesh.uuid] = mesh.material.color.clone();
    if (!mesh.material.color) return;
    mesh.material.color.copy(origColors[mesh.uuid]).lerp(new T.Color(color), amount);
  }

  function tintGroup(group, color, amount) {
    group.traverse(function (o) {
      if (!o.isMesh || !o.material || !o.material.color) return;
      if (amount <= 0) restore(o); else tintMesh(o, color, amount);
    });
  }

  // ------------------------------------------------------------- floor dust
  function applyFloor(room) {
    while (floorLayer.children.length) floorLayer.remove(floorLayer.children[0]);
    var f = (room && room.dust && room.dust.floor) || [];
    for (var i = 0; i < f.length; i++) {
      var cell = f[i];
      var lv = Math.max(1, Math.min(3, cell.level || 1));
      var mat = new T.MeshBasicMaterial({ map: dustTex, color: 0xbfae94, transparent: true, opacity: 0.5 + lv * 0.15, depthWrite: false });
      var m = new T.Mesh(new T.PlaneGeometry(0.96, 0.96), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((cell.gx + 0.5) * 1.0, 0.05 + lv * 0.002, (cell.gz + 0.5) * 1.0);
      floorLayer.add(m);
    }
  }

  // ---------------------------------------------------------- furniture dust
  function ensureSpots(item) {
    if (spotGroups[item.uid]) return spotGroups[item.uid];
    var g = new T.Group();
    g.name = 'dust-' + item.uid;
    scene.add(g);            // world space, so bbox coords work directly
    spotGroups[item.uid] = g;
    return g;
  }

  function clearSpots() {
    Object.keys(spotGroups).forEach(function (uid) {
      if (spotGroups[uid]) scene.remove(spotGroups[uid]);
    });
    spotGroups = {};
  }

  function applyItemDust(item, level) {
    var lv = Math.max(0, Math.min(3, level || 0));
    var g = ensureSpots(item);
    var want = lv === 0 ? 0 : [0, 3, 6, 10][lv];
    while (g.children.length > want) g.remove(g.children[0]);
    if (g.children.length < want) {
      var box = new T.Box3().setFromObject(item.group);
      var cx = (box.min.x + box.max.x) / 2;
      var cz = (box.min.z + box.max.z) / 2;
      var sx = Math.max(0.2, (box.max.x - box.min.x) * 0.7);
      var sz = Math.max(0.2, (box.max.z - box.min.z) * 0.7);
      while (g.children.length < want) {
        var spot = new T.Mesh(
          new T.PlaneGeometry(0.16 + Math.random() * 0.22, 0.16 + Math.random() * 0.22),
          new T.MeshBasicMaterial({ map: spotTex, color: 0xbfae94, transparent: true, opacity: 0.7, depthWrite: false })
        );
        spot.rotation.x = -Math.PI / 2;
        spot.position.set(
          cx + (Math.random() - 0.5) * sx,
          box.max.y + 0.012,
          cz + (Math.random() - 0.5) * sz
        );
        g.add(spot);
      }
    }
    g.visible = lv > 0;
    tintGroup(item.group, 0x8f8474, [0, 0.16, 0.3, 0.44][lv]);
  }

  // ---------------------------------------------------------------- plants
  function applyPlant(item, water) {
    var w = Math.max(0, Math.min(3, water == null ? 3 : water));
    var stage = 3 - w; // 0 healthy -> 3 wilted
    if (baseScale[item.uid] == null) baseScale[item.uid] = item.group.scale.x || 1;
    var base = baseScale[item.uid];
    if (stage === 0) {
      // fully healthy: force the original look, even if a previous stage left residue
      item.group.scale.setScalar(base);
      tintGroup(item.group, 0xa8904a, 0);
      return;
    }
    var scale = [1, 0.97, 0.92, 0.85][stage];
    item.group.scale.setScalar(base * scale);
    tintGroup(item.group, 0xa8904a, [0, 0.12, 0.3, 0.55][stage]);
  }

  // ---------------------------------------------------------------- bed
  function applyBed(item, tidyAt) {
    var days = tidyAt ? (Date.now() - tidyAt) / 86400000 : 0;
    var stage = days >= 7 ? 2 : days >= 4 ? 1 : 0;
    tintGroup(item.group, 0x9a8f7a, [0, 0.12, 0.24][stage]);
  }

  function refresh() {
    if (!scene) return;
    var room = (PR.store && PR.store.state && PR.store.state.room) || null;
    applyFloor(room);
    var dustById = {};
    var dust = (room && room.dust && room.dust.items) || [];
    for (var i = 0; i < dust.length; i++) dustById[dust[i].id] = dust[i].level || 1;
    var plantsById = {};
    var plants = (room && room.plants) || [];
    for (var j = 0; j < plants.length; j++) plantsById[plants[j].id] = plants[j].water;

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.def.id === 'plant' || it.def.id === 'palm') {
        applyPlant(it, plantsById[it.uid]);
        continue;
      }
      if (it.def.id === 'bed' && room && room.bed) applyBed(it, room.bed.tidyAt);
      applyItemDust(it, dustById[it.uid] || 0);
    }
  }

  // ------------------------------------------------------------- sparkles
  function sparkleAt(x, y, z) {
    var n = 20;
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var vel = [];
    for (var i = 0; i < n; i++) {
      pos[i * 3] = x + (Math.random() - 0.5) * 0.35;
      pos[i * 3 + 1] = y + Math.random() * 0.15;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.35;
      vel.push({
        x: (Math.random() - 0.5) * 0.35,
        y: 0.35 + Math.random() * 0.5,
        z: (Math.random() - 0.5) * 0.35,
      });
    }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      color: 0xfff4cf, size: 0.11, transparent: true, opacity: 1,
      depthWrite: false, blending: T.AdditiveBlending,
    });
    var pts = new T.Points(geo, mat);
    scene.add(pts);
    var t0 = performance.now();
    (function fly() {
      var k = (performance.now() - t0) / 900;
      if (k >= 1) {
        scene.remove(pts);
        geo.dispose(); mat.dispose();
        return;
      }
      var arr = geo.attributes.position.array;
      for (var i = 0; i < n; i++) {
        arr[i * 3] += vel[i].x * 0.016;
        arr[i * 3 + 1] += vel[i].y * 0.016;
        arr[i * 3 + 2] += vel[i].z * 0.016;
        vel[i].y -= 0.5 * 0.016;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k;
      requestAnimationFrame(fly);
    })();
  }

  function fadeFloor(gx, gz) {
    var kids = floorLayer.children.slice();
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (Math.abs(c.position.x - (gx + 0.5)) > 0.01) continue;
      if (Math.abs(c.position.z - (gz + 0.5)) > 0.01) continue;
      (function (mesh) {
        var t0 = performance.now();
        var op = mesh.material.opacity;
        (function fade() {
          var k = (performance.now() - t0) / 320;
          if (k >= 1) { floorLayer.remove(mesh); return; }
          mesh.material.opacity = op * (1 - k);
          requestAnimationFrame(fade);
        })();
      })(c);
    }
  }

  function bounce(group) {
    var t0 = performance.now();
    var base = group.scale.x || 1;
    (function tick() {
      var k = (performance.now() - t0) / 420;
      if (k >= 1) { group.scale.setScalar(base); return; }
      group.scale.setScalar(base * (1 + Math.sin(k * Math.PI) * 0.06));
      requestAnimationFrame(tick);
    })();
  }

  function shineTile(gx, gz) {
    var mat = new T.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending });
    var m = new T.Mesh(new T.PlaneGeometry(0.96, 0.96), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((gx + 0.5), 0.07, (gz + 0.5));
    scene.add(m);
    var t0 = performance.now();
    (function fade() {
      var k = (performance.now() - t0) / 700;
      if (k >= 1) { scene.remove(m); mat.dispose(); m.geometry.dispose(); return; }
      mat.opacity = 0.55 * (1 - k);
      requestAnimationFrame(fade);
    })();
  }

  function celebrate(kind, ref) {
    if (!scene) return;
    if (kind === 'clean' && ref && typeof ref.gx === 'number' && typeof ref.gz === 'number') {
      fadeFloor(ref.gx, ref.gz);
      sparkleAt((ref.gx + 0.5), 0.08, (ref.gz + 0.5));
      shineTile(ref.gx, ref.gz);
      return;
    }
    if (!ref) return;
    var id = ref.id || ref;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.uid !== id && it.def.id !== id) continue;
      var box = new T.Box3().setFromObject(it.group);
      sparkleAt((box.min.x + box.max.x) / 2, box.max.y + 0.05, (box.min.z + box.max.z) / 2);
      if (kind === 'water' || kind === 'tidy') bounce(it.group);
      return;
    }
  }

  function slip(root) {
    if (!root) return;
    var t0 = performance.now();
    var base = root.rotation.z || 0;
    (function wobble() {
      var k = (performance.now() - t0) / 500;
      if (k >= 1) { root.rotation.z = base; return; }
      root.rotation.z = base + Math.sin(k * Math.PI * 3) * 0.22 * (1 - k);
      requestAnimationFrame(wobble);
    })();
  }

  return { init: init, setItems: setItems, refresh: refresh, slip: slip, celebrate: celebrate };
})();
