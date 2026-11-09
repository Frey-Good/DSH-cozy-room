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
      var mat = new T.MeshBasicMaterial({ map: dustTex, transparent: true, opacity: 0.45 + lv * 0.15, depthWrite: false });
      var m = new T.Mesh(new T.PlaneGeometry(0.96, 0.96), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((cell.gx + 0.5) * 1.0, 0.016 + lv * 0.001, (cell.gz + 0.5) * 1.0);
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
          new T.MeshBasicMaterial({ map: spotTex, transparent: true, opacity: 0.75, depthWrite: false })
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

  return { init: init, setItems: setItems, refresh: refresh, slip: slip };
})();
