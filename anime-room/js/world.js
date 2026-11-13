/* Purple Room — renderer, isometric camera, room shell, lighting, dust. */
(function () {
  'use strict';
  var T = THREE;
  var PR = window.PR;
  var R = PR.ROOM;
  var WIN = PR.WIN;
  var C = PR.C;

  var canvas = document.getElementById('scene');
  var stage = document.getElementById('stage');

  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var scene = new T.Scene();

  var camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 160);
  var target = new T.Vector3(R.w * 0.5, 1.5, R.d * 0.5);
  camera.position.set(target.x + 22, target.y + 21, target.z + 22);
  camera.lookAt(target);

  var wallMeshes = [];

  function addWall(w, h, d, x, y, z, tag, mat) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat || PR.wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.wall = tag;
    scene.add(m);
    wallMeshes.push(m);
    return m;
  }

  // ---------------------------------------------------------------- room shell
  var slab = new T.Mesh(
    new T.BoxGeometry(R.w + 0.5, R.floorT, R.d + 0.5),
    PR.mat(C.slab, { rough: 0.95 })
  );
  slab.position.set(R.w / 2, -R.floorT / 2, R.d / 2);
  slab.receiveShadow = true;
  slab.castShadow = true;
  scene.add(slab);

  var floor = new T.Mesh(new T.PlaneGeometry(R.w, R.d), PR.floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(R.w / 2, 0.002, R.d / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // north wall (z = 0), with a window opening
  addWall(WIN.x1 + 0.26, R.wallH, R.wallT, (WIN.x1 - 0.26) / 2, R.wallH / 2, -R.wallT / 2, 'north');
  addWall(R.w + 0.26 - WIN.x2, R.wallH, R.wallT, (WIN.x2 + R.w + 0.26) / 2, R.wallH / 2, -R.wallT / 2, 'north');
  addWall(WIN.x2 - WIN.x1, WIN.y1, R.wallT, (WIN.x1 + WIN.x2) / 2, WIN.y1 / 2, -R.wallT / 2, 'north');
  addWall(WIN.x2 - WIN.x1, R.wallH - WIN.y2, R.wallT, (WIN.x1 + WIN.x2) / 2, (R.wallH + WIN.y2) / 2, -R.wallT / 2, 'north');
  // mullions
  addWall(0.06, WIN.y2 - WIN.y1, R.wallT, (WIN.x1 + WIN.x2) / 2, (WIN.y1 + WIN.y2) / 2, -R.wallT / 2, 'north');
  addWall(WIN.x2 - WIN.x1, 0.06, R.wallT, (WIN.x1 + WIN.x2) / 2, (WIN.y1 + WIN.y2) / 2, -R.wallT / 2, 'north');

  // west wall (x = 0)
  addWall(R.wallT, R.wallH, R.d + 0.26, -R.wallT / 2, R.wallH / 2, R.d / 2, 'west');

  // wall caps + baseboards
  function capAlongX(z) {
    var m = PR.box(R.w + 0.52, 0.055, R.wallT + 0.02, C.trim, { rough: 1 });
    m.position.set(R.w / 2, R.wallH + 0.0275, z);
    m.castShadow = false;
    scene.add(m);
  }
  function capAlongZ(x) {
    var m = PR.box(R.wallT + 0.02, 0.055, R.d + 0.52, C.trim, { rough: 1 });
    m.position.set(x, R.wallH + 0.0275, R.d / 2);
    m.castShadow = false;
    scene.add(m);
  }
  capAlongX(-R.wallT / 2);
  capAlongZ(-R.wallT / 2);

  var baseN = PR.box(R.w, 0.17, 0.05, C.trim);
  baseN.position.set(R.w / 2, 0.085, 0.026);
  baseN.castShadow = false;
  scene.add(baseN);
  var baseW = PR.box(0.05, 0.17, R.d, C.trim);
  baseW.position.set(0.026, 0.085, R.d / 2);
  baseW.castShadow = false;
  scene.add(baseW);

  // window trim + sill
  function trimBox(w, h, d, x, y, z) {
    var m = PR.box(w, h, d, C.trim, { rough: 0.95 });
    m.position.set(x, y, z);
    m.castShadow = false;
    scene.add(m);
    return m;
  }
  trimBox(0.09, WIN.y2 - WIN.y1 + 0.2, 0.07, WIN.x1 - 0.04, (WIN.y1 + WIN.y2) / 2, 0.028);
  trimBox(0.09, WIN.y2 - WIN.y1 + 0.2, 0.07, WIN.x2 + 0.04, (WIN.y1 + WIN.y2) / 2, 0.028);
  trimBox(WIN.x2 - WIN.x1 + 0.18, 0.09, 0.07, (WIN.x1 + WIN.x2) / 2, WIN.y2 + 0.04, 0.028);
  trimBox(WIN.x2 - WIN.x1 + 0.34, 0.09, 0.2, (WIN.x1 + WIN.x2) / 2, WIN.y1 - 0.045, 0.075);

  // window view (a warm dusk landscape behind the opening)
  var viewTex = (function () {
    var cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 220;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 220);
    g.addColorStop(0, '#8ec8f2');
    g.addColorStop(0.45, '#b9e3fa');
    g.addColorStop(0.75, '#dcf3ff');
    g.addColorStop(1, '#f4fbff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 220);
    ctx.fillStyle = 'rgba(255,246,200,0.9)';
    ctx.beginPath();
    ctx.arc(176, 54, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,200,0.28)';
    ctx.beginPath();
    ctx.arc(176, 54, 40, 0, Math.PI * 2);
    ctx.fill();
    // soft anime clouds
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    [[40, 62, 34], [76, 54, 22], [120, 78, 26], [206, 88, 30]].forEach(function (c) {
      ctx.beginPath();
      ctx.arc(c[0], c[1], c[2] * 0.55, 0, Math.PI * 2);
      ctx.arc(c[0] + c[2] * 0.55, c[1] + 4, c[2] * 0.45, 0, Math.PI * 2);
      ctx.arc(c[0] - c[2] * 0.55, c[1] + 5, c[2] * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#b9e0c2';
    ctx.beginPath();
    ctx.moveTo(0, 220);
    ctx.lineTo(0, 178);
    ctx.lineTo(52, 152);
    ctx.lineTo(104, 180);
    ctx.lineTo(150, 158);
    ctx.lineTo(206, 186);
    ctx.lineTo(256, 166);
    ctx.lineTo(256, 220);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#97cfae';
    ctx.beginPath();
    ctx.moveTo(0, 220);
    ctx.lineTo(0, 202);
    ctx.lineTo(70, 188);
    ctx.lineTo(140, 206);
    ctx.lineTo(200, 192);
    ctx.lineTo(256, 202);
    ctx.lineTo(256, 220);
    ctx.closePath();
    ctx.fill();
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  var viewMat = new T.MeshBasicMaterial({ map: viewTex });
  var viewPlane = new T.Mesh(new T.PlaneGeometry(3.0, 2.4), viewMat);
  viewPlane.position.set((WIN.x1 + WIN.x2) / 2, (WIN.y1 + WIN.y2) / 2, -0.4);
  scene.add(viewPlane);

  // curtains
  function curtain(x, flip) {
    var g = new T.Group();
    var wide = 0.42;
    PR.put(g, PR.box(wide, 3.5, 0.1, C.plum), 0, 1.75, 0);
    for (var i = 0; i < 3; i++) {
      PR.put(g, PR.box(0.06, 3.44, 0.03, i % 2 ? C.plumLight : 0x4a2f40), -wide / 2 + 0.09 + i * 0.12, 1.75, 0.06);
    }
    g.position.set(x, 0.3, 0.15);
    g.rotation.y = flip ? -0.06 : 0.06;
    g.traverse(function (o) {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(g);
  }
  curtain(WIN.x1 - 0.18, false);
  curtain(WIN.x2 + 0.18, true);

  var rod = PR.cyl(0.03, 0.03, WIN.x2 - WIN.x1 + 1.0, 8, 0x3d2c3b);
  rod.rotation.z = Math.PI / 2;
  rod.position.set((WIN.x1 + WIN.x2) / 2, 3.95, 0.15);
  rod.castShadow = false;
  scene.add(rod);

  // ------------------------------------------------------------------ lights
  var hemi = new T.HemisphereLight(0xfff4e4, 0xc0b6d8, 0.42);
  scene.add(hemi);

  var key = new T.DirectionalLight(0xffd9a0, 1.5);
  key.position.set(3.4, 7.2, -7.5);
  key.target.position.set(5.6, 0, 2.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 45;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(key.target);

  var fill = new T.DirectionalLight(0xb6d0ff, 0.32);
  fill.position.set(-8, 5, 12);
  scene.add(fill);

  var front = new T.DirectionalLight(0xfff0e0, 0.18);
  front.position.set(26, 18, 30);
  front.target.position.set(R.w / 2, 1.1, R.d / 2);
  scene.add(front);
  scene.add(front.target);

  var windowLight = new T.PointLight(0xffd9a8, 2.2, 9, 2);
  windowLight.position.set((WIN.x1 + WIN.x2) / 2, 2.2, 0.5);
  scene.add(windowLight);

  // ------------------------------------------------------------------- dust
  var DUST = 55;
  var dustPos = new Float32Array(DUST * 3);
  var dustSpeed = new Float32Array(DUST);
  for (var i = 0; i < DUST; i++) {
    dustPos[i * 3] = 0.4 + Math.random() * (R.w - 0.8);
    dustPos[i * 3 + 1] = 0.2 + Math.random() * 3.6;
    dustPos[i * 3 + 2] = 0.4 + Math.random() * (R.d - 0.8);
    dustSpeed[i] = 0.05 + Math.random() * 0.12;
  }
  var dustGeo = new T.BufferGeometry();
  dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
  var dustMat = new T.PointsMaterial({
    color: 0xfff4dc,
    size: 0.042,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: T.AdditiveBlending,
    sizeAttenuation: true,
  });
  var dust = new T.Points(dustGeo, dustMat);
  scene.add(dust);

  var winGlow = new T.Sprite(new T.SpriteMaterial({
    map: PR.tex.glow,
    color: 0xffb877,
    transparent: true,
    opacity: 0.3,
    blending: T.AdditiveBlending,
    depthWrite: false,
  }));
  winGlow.scale.set(3.8, 3.2, 1);
  winGlow.position.set((WIN.x1 + WIN.x2) / 2, 2.1, -0.6);
  scene.add(winGlow);

  // ------------------------------------------------------------ day / night
  var MODES = {
    day: {
      hemiSky: 0xfff4e4,
      hemiGround: 0xc0b6d8,
      hemiI: 0.42,
      keyColor: 0xffe2b0,
      keyI: 1.5,
      fillI: 0.32,
      bg: 0xfff4ec,
      viewTint: 0xffffff,
      windowLight: 2.2,
      dust: 0.38,
      glow: 0.3,
    },
    night: {
      hemiSky: 0x5b4d80,
      hemiGround: 0x120e18,
      hemiI: 0.22,
      keyColor: 0x8fa8ff,
      keyI: 0.5,
      fillI: 0.14,
      bg: 0x5a4666,
      viewTint: 0x7d8cc6,
      windowLight: 1.1,
      dust: 0.24,
      glow: 0.5,
    },
  };

  var nightT = 0; // 0 = day, 1 = night
  var nightTarget = 0;
  var lamps = [];
  var dayColor = new T.Color(MODES.day.keyColor);
  var nightColor = new T.Color(MODES.night.keyColor);
  var dayHemi = new T.Color(MODES.day.hemiSky);
  var nightHemi = new T.Color(MODES.night.hemiSky);
  var dayBg = new T.Color(MODES.day.bg);
  var nightBg = new T.Color(MODES.night.bg);
  var dayTint = new T.Color(MODES.day.viewTint);
  var nightTint = new T.Color(MODES.night.viewTint);

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function updateModes(dt) {
    if (nightT !== nightTarget) {
      var step = dt * 1.6;
      nightT = nightT < nightTarget ? Math.min(nightTarget, nightT + step) : Math.max(nightTarget, nightT - step);
    }
    var t = nightT;
    key.color.copy(dayColor).lerp(nightColor, t);
    key.intensity = lerp(MODES.day.keyI, MODES.night.keyI, t) * weatherLight;
    hemi.color.copy(dayHemi).lerp(nightHemi, t);
    hemi.intensity = lerp(MODES.day.hemiI, MODES.night.hemiI, t) * weatherLight;
    fill.intensity = lerp(MODES.day.fillI, MODES.night.fillI, t) * (0.7 + weatherLight * 0.3);
    viewMat.color.copy(dayTint).lerp(nightTint, t).multiply(weatherTint);
    windowLight.intensity = lerp(MODES.day.windowLight, MODES.night.windowLight, t) * (0.6 + weatherLight * 0.4);
    dustMat.opacity = lerp(MODES.day.dust, MODES.night.dust, t) * weatherLight;
    winGlow.material.opacity = lerp(MODES.day.glow, MODES.night.glow, t);

    for (var i = 0; i < lamps.length; i++) {
      var L = lamps[i];
      L.light.intensity = lerp(1.0, 5.5, t);
      if (L.sprite) L.sprite.material.opacity = lerp(0.16, 0.6, t);
      for (var m = 0; m < L.materials.length; m++) L.materials[m].emissiveIntensity = lerp(0.25, 1.0, t);
    }
  }

  // ---------------------------------------------------------------- resizing
  function updateCamera(aspect) {
    var h = 13.6;
    var wv = h * aspect;
    var needW = 15;
    if (wv < needW) {
      wv = needW;
      h = wv / aspect;
    }
    camera.left = -wv / 2;
    camera.right = wv / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  var bufW = 0;
  var bufH = 0;
  function resize() {
    var rect = stage.getBoundingClientRect();
    var cw = Math.max(320, Math.floor(rect.width));
    var ch = Math.max(260, Math.floor(rect.height));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var bw = Math.round(cw * dpr);
    var bh = Math.round(ch * dpr);
    if (bw === bufW && bh === bufH) return;
    bufW = bw;
    bufH = bh;
    renderer.setSize(bw, bh, false);
    updateCamera(cw / ch);
  }

  function updateDust(dt) {
    for (var i = 0; i < DUST; i++) {
      dustPos[i * 3 + 1] += dustSpeed[i] * dt;
      dustPos[i * 3] += Math.sin(i * 1.7 + performance.now() * 0.0002) * dt * 0.02;
      if (dustPos[i * 3 + 1] > 4.0) {
        dustPos[i * 3 + 1] = 0.2;
        dustPos[i * 3] = 0.4 + Math.random() * (R.w - 0.8);
        dustPos[i * 3 + 2] = 0.4 + Math.random() * (R.d - 0.8);
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  var camBase = camera.position.clone();
  var camTarget = target.clone();
  var par = { x: 0, y: 0, tx: 0, ty: 0 };
  var camRight = new T.Vector3();
  var camUp = new T.Vector3();

  function updateParallax(dt) {
    var k = Math.min(1, dt * 5);
    par.x += (par.tx - par.x) * k;
    par.y += (par.ty - par.y) * k;
    if (Math.abs(par.x) < 0.0005 && Math.abs(par.y) < 0.0005) {
      camera.position.copy(camBase);
      camera.lookAt(camTarget);
      return;
    }
    camRight.setFromMatrixColumn(camera.matrix, 0);
    camUp.setFromMatrixColumn(camera.matrix, 1);
    camera.position
      .copy(camBase)
      .addScaledVector(camRight, par.x * 0.55)
      .addScaledVector(camUp, par.y * 0.42);
    camera.lookAt(camTarget);
  }

  function setParallax(nx, ny) {
    par.tx = Math.max(-1, Math.min(1, nx || 0));
    par.ty = Math.max(-1, Math.min(1, ny || 0));
  }

  function update(dt) {
    updateModes(dt);
    updateDust(dt);
    updateParallax(dt);
  }

  // ------------------------------------------------------------------ weather
  // Weather only modulates light + window tint here; rain/snow particles live in
  // js/weather.js so they can be added/removed without touching the room build.
  var weatherKind = 'clear';
  var weatherLight = 1;
  var weatherTint = new T.Color(0xffffff);
  var weatherFog = 0;

  var WEATHER_PRESET = {
    clear: { light: 1.0, tint: 0xffffff, fog: 0 },
    cloudy: { light: 0.9, tint: 0xf0f2f6, fog: 0 },
    overcast: { light: 0.74, tint: 0xe2e6ee, fog: 0.08 },
    fog: { light: 0.66, tint: 0xe9e7e3, fog: 0.4 },
    rain: { light: 0.62, tint: 0xcfd9e4, fog: 0.22 },
    snow: { light: 0.86, tint: 0xf3f5f9, fog: 0.16 },
    thunder: { light: 0.55, tint: 0xc8d0dc, fog: 0.3 },
  };

  function setWeather(kind) {
    weatherKind = WEATHER_PRESET[kind] ? kind : 'clear';
    var p = WEATHER_PRESET[weatherKind];
    weatherLight = p.light;
    weatherTint.set(p.tint);
    weatherFog = p.fog;
  }

  PR.world = {
    renderer: renderer,
    scene: scene,
    camera: camera,
    wallMeshes: wallMeshes,
    lamps: lamps,
    resize: resize,
    update: update,
    setParallax: setParallax,
    setNight: function (on) {
      nightTarget = on ? 1 : 0;
    },
    getNight: function () {
      return nightT;
    },
    isNight: function () {
      return nightTarget > 0.5;
    },
    setWeather: setWeather,
    getWeather: function () {
      return weatherKind;
    },
  };

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    try { new ResizeObserver(function () { resize(); }).observe(stage); } catch (e) {}
  }
  window.addEventListener('load', function () {
    resize();
    setTimeout(resize, 300);
    setTimeout(resize, 1200);
  });
  // Cheap safety net: DSH may resize its iframe without a window resize event,
  // and the first paint can happen before the shell settles.
  setInterval(resize, 1000);
  resize();
})();











