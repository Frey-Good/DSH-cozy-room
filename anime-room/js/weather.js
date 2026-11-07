/* Purple room — weather layer: rain / snow particles + window haze + thunder flash.
   Driven by js/app.js from the `cozy-room-weather` message; purely visual. */
window.PR = window.PR || {};

PR.weather = (function () {
  var T = window.THREE;
  var scene = null;
  var kind = 'clear';
  var rain = null;
  var snow = null;
  var haze = null;
  var flashLight = null;
  var flies = null;
  var flyClock = 0;
  var flash = 0;
  var clock = 0;
  var nextBolt = 4 + Math.random() * 6;

  var WIN = { x1: 4.2, x2: 6.5, y1: 1.15, y2: 3.15 };

  function makeStreak() {
    var cv = document.createElement('canvas');
    cv.width = 12;
    cv.height = 48;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(230,244,255,0)');
    g.addColorStop(0.35, 'rgba(230,244,255,.95)');
    g.addColorStop(0.75, 'rgba(230,244,255,.95)');
    g.addColorStop(1, 'rgba(210,232,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(3.5, 0, 5, 48);
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  function makeDot() {
    var cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(8, 8, 8, 0, Math.PI * 2);
    ctx.fill();
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  function makePoints(count, size, texture) {
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      pos[i * 3] = WIN.x1 + 0.15 + Math.random() * (WIN.x2 - WIN.x1 - 0.3);
      pos[i * 3 + 1] = WIN.y1 + Math.random() * (WIN.y2 - WIN.y1);
      pos[i * 3 + 2] = -0.38 + Math.random() * 0.22;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      map: texture,
      size: size,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      sizeAttenuation: false,
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    scene.add(pts);
    return pts;
  }

  function ensure() {
    if (scene) return;
    if (!PR.world || !PR.world.scene) return;
    scene = PR.world.scene;
    if (PR.WIN) WIN = PR.WIN;
    rain = makePoints(110, 15, makeStreak());
    snow = makePoints(120, 7, makeDot());

    var w = WIN.x2 - WIN.x1;
    var h = WIN.y2 - WIN.y1;
    haze = new T.Mesh(
      new T.PlaneGeometry(w + 0.1, h + 0.1),
      new T.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0, depthWrite: false })
    );
    haze.position.set((WIN.x1 + WIN.x2) / 2, (WIN.y1 + WIN.y2) / 2, -0.36);
    scene.add(haze);

    var fpos = new Float32Array(26 * 3);
    for (var i = 0; i < 26; i++) {
      fpos[i * 3] = 1.0 + Math.random() * (7.0 - 1.0);
      fpos[i * 3 + 1] = 0.45 + Math.random() * 1.7;
      fpos[i * 3 + 2] = 1.0 + Math.random() * (7.0 - 1.0);
    }
    var fgeo = new T.BufferGeometry();
    fgeo.setAttribute('position', new T.BufferAttribute(fpos, 3));
    var fmat = new T.PointsMaterial({
      map: makeDot(),
      color: 0xffe08a,
      size: 9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: T.AdditiveBlending,
      sizeAttenuation: false,
    });
    flies = new T.Points(fgeo, fmat);
    flies.frustumCulled = false;
    flies.visible = false;
    scene.add(flies);

    flashLight = new T.PointLight(0xdfe8ff, 0, 6, 2);
    flashLight.position.set((WIN.x1 + WIN.x2) / 2, 2.2, -0.1);
    scene.add(flashLight);
  }

  function set(next) {
    ensure();
    kind = next || 'clear';
    if (PR.world && PR.world.setWeather) PR.world.setWeather(kind);
    if (!scene) return;
    rain.visible = kind === 'rain' || kind === 'thunder';
    snow.visible = kind === 'snow';
    var hazeOpacity = { overcast: 0.1, fog: 0.32, rain: 0.16, snow: 0.1, thunder: 0.2 }[kind] || 0;
    haze.material.opacity = hazeOpacity;
    haze.visible = hazeOpacity > 0;
    if (kind !== 'thunder') flash = 0;
  }

  function setFireflies(on) {
    ensure();
    if (!flies) return;
    flies.visible = !!on;
    if (!on) flies.material.opacity = 0;
  }

  function update(dt) {
    if (!scene) return;
    if (rain.visible) {
      var rp = rain.geometry.attributes.position;
      for (var i = 0; i < rp.count; i++) {
        var y = rp.getY(i) - dt * (3.2 + (i % 5) * 0.25);
        if (y < WIN.y1 - 0.05) {
          y = WIN.y2 + 0.05;
          rp.setX(i, WIN.x1 + 0.15 + Math.random() * (WIN.x2 - WIN.x1 - 0.3));
        }
        rp.setY(i, y);
      }
      rp.needsUpdate = true;
    }
    if (snow.visible) {
      clock += dt;
      var sp = snow.geometry.attributes.position;
      for (var j = 0; j < sp.count; j++) {
        var sy = sp.getY(j) - dt * (0.28 + (j % 4) * 0.05);
        var sx = sp.getX(j) + Math.sin(clock * 0.8 + j) * dt * 0.06;
        if (sy < WIN.y1 - 0.05) {
          sy = WIN.y2 + 0.05;
          sx = WIN.x1 + 0.15 + Math.random() * (WIN.x2 - WIN.x1 - 0.3);
        }
        sp.setX(j, Math.max(WIN.x1 + 0.1, Math.min(WIN.x2 - 0.1, sx)));
        sp.setY(j, sy);
      }
      sp.needsUpdate = true;
    }
    if (kind === 'thunder') {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        flash = 1;
        nextBolt = 4 + Math.random() * 7;
      }
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 3.2);
      flashLight.intensity = flash * 9;
      if (haze) haze.material.opacity = Math.max(haze.material.opacity, flash * 0.25);
    } else if (flashLight) {
      flashLight.intensity = 0;
    }
    if (flies && flies.visible) {
      flyClock += dt;
      flies.material.opacity = 0.42 + Math.sin(flyClock * 1.4) * 0.18;
      var fp = flies.geometry.attributes.position;
      for (var k = 0; k < fp.count; k++) {
        var fx = fp.getX(k) + Math.sin(flyClock * 0.6 + k * 1.7) * dt * 0.18;
        var fy = fp.getY(k) + Math.cos(flyClock * 0.5 + k * 2.1) * dt * 0.1;
        if (fx < 0.8) fx = 7.2;
        if (fx > 7.2) fx = 0.8;
        if (fy < 0.35) fy = 2.2;
        if (fy > 2.2) fy = 0.35;
        fp.setX(k, fx);
        fp.setY(k, fy);
      }
      fp.needsUpdate = true;
    }
  }

  return {
    set: set,
    setFireflies: setFireflies,
    update: update,
    get kind() { return kind; },
  };
})();
