/* Purple room - room wear visuals: floor dust, dusty furniture, wilted plants,
   rumpled bed, slip reaction. Reads PR.store.state.room; never writes it. */
window.PR = window.PR || {};

PR.roomVisuals = (function () {
  var T = window.THREE;
  var scene = null;
  var floorLayer = null;
  var dustTex = null;
  var items = [];          // [{uid, def, group, x, z}]
  var itemDust = {};       // uid -> true
  var origColors = {};     // mesh.uuid -> THREE.Color

  function makeDustTexture() {
    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    for (var i = 0; i < 26; i++) {
      var x = Math.random() * 64, y = Math.random() * 64, r = 5 + Math.random() * 12;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(120,100,78,.42)');
      g.addColorStop(1, 'rgba(120,100,78,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (var j = 0; j < 26; j++) {
      ctx.fillStyle = 'rgba(96,80,60,' + (0.25 + Math.random() * 0.35) + ')';
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
    dustTex = makeDustTexture();
    refresh();
  }

  function setItems(list) {
    items = (list || []).slice();
    refresh();
  }

  function restore(mesh) {
    if (origColors[mesh.uuid]) mesh.material.color.copy(origColors[mesh.uuid]);
  }

  function tintMesh(mesh, color, amount) {
    if (!origColors[mesh.uuid]) origColors[mesh.uuid] = mesh.material.color.clone();
    mesh.material.color.copy(origColors[mesh.uuid]).lerp(new T.Color(color), amount);
  }

  function applyDust() {
    var room = (PR.store && PR.store.state && PR.store.state.room) || null;
    var dust = room && room.dust ? room.dust : { floor: [], items: [] };
    // floor decals
    while (floorLayer.children.length) floorLayer.remove(floorLayer.children[0]);
    var f = dust.floor || [];
    for (var i = 0; i < f.length; i++) {
      var cell = f[i];
      var m = new T.Mesh(
        new T.PlaneGeometry(0.96, 0.96),
        new T.MeshBasicMaterial({ map: dustTex, transparent: true, opacity: 0.9, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set((cell.gx + 0.5) * 1.0, 0.016, (cell.gz + 0.5) * 1.0);
      floorLayer.add(m);
    }
    // furniture tint
    var nowDust = {};
    var list = dust.items || [];
    for (var j = 0; j < list.length; j++) nowDust[list[j].id] = true;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var group = it.group;
      if (!group) continue;
      var dusty = !!nowDust[it.uid] || !!nowDust[it.id];
      if (itemDust[it.uid] === dusty) continue;
      itemDust[it.uid] = dusty;
      group.traverse((function (g, on) {
        return function (o) {
          if (!o.isMesh || !o.material || !o.material.color) return;
          if (on) tintMesh(o, 0x8f8474, 0.45);
          else restore(o);
        };
      })(group, dusty));
    }
  }

  function applyPlants() {
    var room = (PR.store && PR.store.state && PR.store.state.room) || null;
    var plants = room && room.plants ? room.plants : [];
    var byId = {};
    for (var i = 0; i < plants.length; i++) byId[plants[i].id] = plants[i].water;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.def.id !== 'plant' && it.def.id !== 'palm') continue;
      var water = byId[it.uid];
      if (water === undefined) continue;
      var wilted = water <= 0;
      if (it._wilted === wilted) continue;
      it._wilted = wilted;
      it.group.traverse((function (g, on) {
        return function (o) {
          if (!o.isMesh || !o.material || !o.material.color) return;
          if (on) tintMesh(o, 0xa8904a, 0.55);
          else restore(o);
        };
      })(it.group, wilted));
    }
  }

  function refresh() {
    if (!scene) return;
    applyDust();
    applyPlants();
  }

  // quick stumble: tilt the character root and put it back
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
