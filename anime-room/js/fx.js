/* Purple room — tiny particle / VFX layer (sparkles, rings, hearts, Zzz). */
(function () {
  'use strict';
  var T = THREE;
  var PR = window.PR;
  var scene = PR.world.scene;
  var effects = [];

  function tex(w, h, draw) {
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  var starTex = tex(64, 64, function (ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      var r = i % 2 === 0 ? 28 : 10;
      var x = 32 + Math.cos(a) * r;
      var y = 32 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

  var heartTex = tex(64, 64, function (ctx) {
    ctx.fillStyle = '#ff9fb2';
    ctx.beginPath();
    ctx.moveTo(32, 56);
    ctx.bezierCurveTo(2, 34, 8, 8, 32, 20);
    ctx.bezierCurveTo(56, 8, 62, 34, 32, 56);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(22, 24, 5, 3.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  var zTex = tex(64, 64, function (ctx) {
    ctx.fillStyle = '#cfd8ff';
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 32, 34);
  });

  var glowTex = (function () {
    var cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(210,240,255,0.95)');
    g.addColorStop(0.4, 'rgba(160,215,255,0.45)');
    g.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();

  function burst(x, z, color) {
    var n = 18;
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var vel = [];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 0.05 + Math.random() * 0.2;
      pos[i * 3] = x + Math.cos(a) * r;
      pos[i * 3 + 1] = 0.55 + Math.random() * 0.55;
      pos[i * 3 + 2] = z + Math.sin(a) * r;
      vel.push({
        x: Math.cos(a) * (0.6 + Math.random() * 0.8),
        y: 0.6 + Math.random() * 1.1,
        z: Math.sin(a) * (0.6 + Math.random() * 0.8),
      });
    }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      size: 0.1,
      map: starTex,
      color: color || 0xbfe9ff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: T.AdditiveBlending,
      sizeAttenuation: true,
    });
    var points = new T.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    effects.push({ kind: 'burst', obj: points, mat: mat, geo: geo, vel: vel, life: 0, ttl: 0.75 });
  }

  function ring(x, z, color) {
    var mat = new T.MeshBasicMaterial({
      color: color || 0xbfe9ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    });
    var mesh = new T.Mesh(new T.RingGeometry(0.28, 0.34, 36), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    scene.add(mesh);
    effects.push({ kind: 'ring', obj: mesh, mat: mat, life: 0, ttl: 0.5 });
  }

  function flash(x, z) {
    var mat = new T.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    var sprite = new T.Sprite(mat);
    sprite.position.set(x, 0.7, z);
    sprite.scale.set(0.9, 0.9, 1);
    scene.add(sprite);
    effects.push({ kind: 'flash', obj: sprite, mat: mat, life: 0, ttl: 0.45 });
  }

  function floaters(kind, x, z, count) {
    for (var i = 0; i < count; i++) {
      var mat = new T.SpriteMaterial({
        map: kind === 'heart' ? heartTex : zTex,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      var sprite = new T.Sprite(mat);
      sprite.position.set(x + 0.3 + Math.random() * 0.18, 1.95 + i * 0.2, z + 0.05);
      var s = kind === 'heart' ? 0.24 : 0.2;
      sprite.scale.set(s, s, 1);
      scene.add(sprite);
      effects.push({
        kind: 'floater',
        obj: sprite,
        mat: mat,
        life: -i * 0.18,
        ttl: 1.5,
        vy: kind === 'heart' ? 0.55 : 0.3,
        sway: Math.random() * 6.28,
      });
    }
  }

  function update(dt) {
    for (var i = effects.length - 1; i >= 0; i--) {
      var fx = effects[i];
      fx.life += dt;
      if (fx.life < 0) continue;
      var t = fx.life / fx.ttl;
      if (t >= 1) {
        scene.remove(fx.obj);
        if (fx.geo) fx.geo.dispose();
        if (fx.mat) fx.mat.dispose();
        effects.splice(i, 1);
        continue;
      }
      if (fx.kind === 'burst') {
        var arr = fx.geo.attributes.position.array;
        for (var p = 0; p < fx.vel.length; p++) {
          var v = fx.vel[p];
          arr[p * 3] += v.x * dt;
          arr[p * 3 + 1] += v.y * dt;
          arr[p * 3 + 2] += v.z * dt;
          v.y -= 1.6 * dt;
          v.x *= 1 - 1.5 * dt;
          v.z *= 1 - 1.5 * dt;
        }
        fx.geo.attributes.position.needsUpdate = true;
        fx.mat.opacity = 1 - t;
        fx.mat.size = 0.1 * (1 - t * 0.5);
      } else if (fx.kind === 'ring') {
        var s = 0.6 + t * 2.6;
        fx.obj.scale.set(s, s, 1);
        fx.mat.opacity = 0.85 * (1 - t);
      } else if (fx.kind === 'flash') {
        var fs = 0.9 + t * 1.6;
        fx.obj.scale.set(fs, fs, 1);
        fx.mat.opacity = 0.9 * (1 - t);
      } else if (fx.kind === 'floater') {
        fx.obj.position.y += fx.vy * dt;
        fx.obj.position.x += Math.sin(fx.sway + fx.life * 2.2) * 0.12 * dt;
        fx.mat.opacity = Math.min(1, 1 - t) * 0.95;
      }
    }
  }

  PR.fx = {
    burst: burst,
    ring: ring,
    flash: flash,
    hearts: function (x, z) { floaters('heart', x, z, 3); },
    zzz: function (x, z) { floaters('z', x, z, 2); },
    update: update,
  };
})();



