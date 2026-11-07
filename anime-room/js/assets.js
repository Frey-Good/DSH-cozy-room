/* Purple Room — shared art assets: palette, procedural textures, materials,
   primitive helpers and low-poly furniture builders.
   Plain classic script; expects window.THREE and creates window.PR. */
(function () {
  'use strict';
  var T = THREE;
  var PR = (window.PR = window.PR || {});

  PR.ROOM = { w: 8, d: 8, wallH: 4.0, wallT: 0.26, floorT: 0.34 };
  PR.WIN = { x1: 4.2, x2: 6.5, y1: 1.15, y2: 3.15 };

  var C = {
    wall: 0xfbe9d6,
    wallOut: 0xe8cdb4,
    trim: 0xfffaf2,
    trimDark: 0xe7d3bd,
    floor: 0xd8a878,
    floorDark: 0xb8875c,
    slab: 0xc59a72,
    slabTop: 0xd8b088,
    cream: 0xfff7ea,
    creamDark: 0xead7c0,
    wood: 0xc08a5e,
    woodDark: 0x8a5a3c,
    woodLight: 0xe3b587,
    plum: 0x5b5f86,
    plumLight: 0x8d93b8,
    sage: 0x8fbf9a,
    sageLight: 0xbfe0c4,
    rust: 0xe08a7a,
    rustLight: 0xf2b3a2,
    blue: 0x6e9fd4,
    blueLight: 0xa8c8e8,
    gold: 0xf2c879,
    goldLight: 0xffe3ad,
    skin: 0xfbe0cc,
    hair: 0x3a4a72,
    dark: 0x2f3550,
    white: 0xfffdf8,
    window: 0xd8efff,
    terracotta: 0xd98f6f,
  };
  PR.C = C;

  function rng(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
  PR.rng = rng;

  // ---------------------------------------------------------------- textures
  function canvasTex(w, h, draw, repeat) {
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext('2d');
    draw(ctx, w, h);
    var tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
    tex.magFilter = T.LinearFilter;
    tex.minFilter = T.LinearMipmapLinearFilter;
    if (repeat) tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = 4;
    return tex;
  }

  var tex = {};
  tex.floor = canvasTex(256, 256, function (ctx, s) {
    ctx.fillStyle = '#e2b184';
    ctx.fillRect(0, 0, s, s);
    var rows = 8;
    var rh = s / rows;
    for (var r = 0; r < rows; r++) {
      var y = r * rh;
      ctx.fillStyle = r % 2 ? '#e8bb8f' : '#d9a878';
      ctx.fillRect(0, y, s, rh);
      for (var i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(150,105,75,' + (0.05 + Math.random() * 0.07).toFixed(3) + ')';
        ctx.fillRect(0, y + Math.random() * rh, s, 1);
      }
      ctx.fillStyle = 'rgba(160,120,85,0.42)';
      ctx.fillRect(0, y, s, 2);
      var off = (r % 2) * (s / 2);
      for (var x = off; x < s; x += s / 2) {
        ctx.fillRect(x, y, 2, rh);
      }
    }
  }, [3, 2.7]);

  tex.rug = canvasTex(256, 256, function (ctx, s) {
    ctx.fillStyle = '#e59a92';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f7d8d2';
    ctx.fillRect(10, 10, s - 20, s - 20);
    ctx.fillStyle = '#fff8ee';
    ctx.fillRect(22, 22, s - 44, s - 44);
    ctx.fillStyle = '#e8a49c';
    ctx.fillRect(34, 34, s - 68, s - 68);
    ctx.fillStyle = '#fff8ee';
    ctx.fillRect(46, 46, s - 92, s - 92);
    ctx.fillStyle = '#fbe8e2';
    ctx.fillRect(58, 58, s - 116, s - 116);
    ctx.fillStyle = '#fff8ee';
    for (var i = 0; i < 3; i++) {
      var cx = 72 + i * 56;
      var cy = 128;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 20, cy);
      ctx.lineTo(cx, cy + 20);
      ctx.lineTo(cx - 20, cy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#e8a49c';
    for (var i2 = 0; i2 < 3; i2++) {
      var bx = 72 + i2 * 56;
      ctx.beginPath();
      ctx.moveTo(bx, 118);
      ctx.lineTo(bx + 10, 128);
      ctx.lineTo(bx, 138);
      ctx.lineTo(bx - 10, 128);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(190,140,130,0.16)';
    for (var k = 0; k < s; k += 3) {
      ctx.fillRect(0, k, s, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var k2 = 0; k2 < s; k2 += 3) {
      ctx.fillRect(0, k2 + 1, s, 1);
    }
  }, [1, 1]);

  tex.wall = canvasTex(128, 128, function (ctx, s) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (var i = 0; i < 2600; i++) {
      var a = 0.03 + Math.random() * 0.05;
      ctx.fillStyle = 'rgba(185,150,125,' + a.toFixed(3) + ')';
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
    ctx.fillStyle = 'rgba(255,250,240,0.05)';
    for (var x = 0; x < s; x += 16) ctx.fillRect(x, 0, 8, s);
  }, [5, 2.4]);

  tex.art = [];
  for (var ai = 0; ai < 4; ai++) {
    (function (seed) {
      tex.art.push(canvasTex(96, 120, function (ctx, w, h) {
        var r = rng(seed * 977 + 13);
        var g = ctx.createLinearGradient(0, 0, 0, h);
        var cols = [
          ['#8fb8e8', '#ffd9c8'],
          ['#a8d8c0', '#ffe6b8'],
          ['#e0a8c0', '#ffe8d8'],
          ['#9aa8e0', '#ece0f8'],
        ][seed % 4];
        g.addColorStop(0, cols[0]);
        g.addColorStop(1, cols[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // moon / sun
        ctx.fillStyle = seed % 2 ? '#ffe9b8' : '#f4e6d6';
        ctx.beginPath();
        ctx.arc(w * (0.3 + r() * 0.4), h * 0.28, 10 + r() * 6, 0, Math.PI * 2);
        ctx.fill();
        // hills
        ctx.fillStyle = 'rgba(120,105,150,0.55)';
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * 0.68);
        ctx.lineTo(w * 0.3, h * 0.5);
        ctx.lineTo(w * 0.55, h * 0.66);
        ctx.lineTo(w * 0.8, h * 0.46);
        ctx.lineTo(w, h * 0.6);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,220,180,0.25)';
        ctx.fillRect(0, h * 0.86, w, 2);
      }, [1, 1]));
    })(ai);
  }

  tex.shadow = (function () {
    var cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(70,45,60,0.34)');
    g.addColorStop(0.55, 'rgba(70,45,60,0.18)');
    g.addColorStop(1, 'rgba(70,45,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  PR.shadowMat = new T.MeshBasicMaterial({ map: tex.shadow, transparent: true, opacity: 0.9, depthWrite: false });
  tex.pcScreen = canvasTex(160, 100, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#cfe9ff');
    g.addColorStop(0.6, '#ffe6ef');
    g.addColorStop(1, '#ffd4e2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(47,53,80,0.75)';
    ctx.fillRect(0, 0, w, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(10, 18, 74, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(92, 22, 58, 38);
    ctx.fillStyle = '#9fcbe8';
    ctx.fillRect(10, 18, 74, 6);
    ctx.fillRect(92, 22, 58, 6);
    ctx.fillStyle = 'rgba(120,150,190,0.5)';
    for (var i = 0; i < 4; i++) ctx.fillRect(16, 30 + i * 7, 52 - i * 6, 3);
    for (var j = 0; j < 3; j++) ctx.fillRect(98, 34 + j * 8, 44 - j * 5, 3);
    ctx.fillStyle = '#f28fa1';
    ctx.beginPath();
    ctx.arc(120, 84, 7, Math.PI, 0);
    ctx.arc(134, 84, 7, Math.PI, 0);
    ctx.lineTo(127, 96);
    ctx.closePath();
    ctx.fill();
  }, [1, 1]);

  tex.tvScreen = canvasTex(192, 108, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4f5f9a');
    g.addColorStop(0.55, '#b07aa0');
    g.addColorStop(1, '#ffb877');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,236,170,0.95)';
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.58, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(20, 22, 40, 6);
    ctx.fillRect(28, 16, 24, 6);
    ctx.fillStyle = '#5b4a72';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.72);
    ctx.lineTo(w * 0.3, h * 0.55);
    ctx.lineTo(w * 0.6, h * 0.74);
    ctx.lineTo(w, h * 0.6);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3f3559';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.88);
    ctx.lineTo(w * 0.4, h * 0.8);
    ctx.lineTo(w * 0.75, h * 0.9);
    ctx.lineTo(w, h * 0.84);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(w * 0.46, h * 0.78, 5, 4);
  }, [1, 1]);

  tex.glow = (function () {
    var cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,226,180,1)');
    g.addColorStop(0.35, 'rgba(255,200,140,0.55)');
    g.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();

  PR.tex = tex;

  // --------------------------------------------------------------- materials
  // toon ramp: flat cel-shading steps
  var ramp = new Uint8Array([70, 150, 225, 255]);
  var gradient = new T.DataTexture(ramp, ramp.length, 1, T.RedFormat);
  gradient.minFilter = T.NearestFilter;
  gradient.magFilter = T.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  PR.gradient = gradient;

  var matCache = {};
  PR.mat = function (color, opts) {
    opts = opts || {};
    var emissive = opts.emissive == null ? 0 : opts.emissive;
    var ei = opts.ei == null ? 0 : opts.ei;
    var key = [color, emissive, ei].join('|');
    if (matCache[key]) return matCache[key];
    var m = new T.MeshToonMaterial({ color: color, gradientMap: gradient });
    if (emissive) {
      m.emissive = new T.Color(emissive);
      m.emissiveIntensity = ei;
    }
    matCache[key] = m;
    return m;
  };

  PR.outlineMat = new T.MeshBasicMaterial({ color: 0x2f3550, side: T.BackSide });
  PR.addOutline = function (mesh, scale) {
    var o = new T.Mesh(mesh.geometry, PR.outlineMat);
    o.scale.setScalar(scale || 1.035);
    o.castShadow = false;
    o.receiveShadow = false;
    o.userData.isOutline = true;
    mesh.add(o);
    return o;
  };

  PR.floorMat = new T.MeshToonMaterial({ map: tex.floor, gradientMap: gradient });
  PR.rugMat = new T.MeshToonMaterial({ map: tex.rug, gradientMap: gradient });
  PR.wallMat = new T.MeshToonMaterial({ map: tex.wall, color: C.wall, gradientMap: gradient });
  PR.wallOutMat = new T.MeshToonMaterial({ color: C.wallOut, gradientMap: gradient });
  PR.artMats = tex.art.map(function (t) {
    return new T.MeshToonMaterial({ map: t, gradientMap: gradient });
  });

  // --------------------------------------------------------------- primitives
  function prep(mesh, opts) {
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    return mesh;
  }

  PR.box = function (w, h, d, color, opts) {
    opts = opts || {};
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), opts.material || PR.mat(color, opts));
    return prep(m, opts);
  };

  PR.cyl = function (rt, rb, h, seg, color, opts) {
    opts = opts || {};
    var m = new T.Mesh(
      new T.CylinderGeometry(rt, rb, h, seg || 12, 1),
      opts.material || PR.mat(color, opts)
    );
    return prep(m, opts);
  };

  PR.sphere = function (r, color, opts) {
    opts = opts || {};
    var seg = opts.seg || 14;
    var m = new T.Mesh(
      new T.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))),
      opts.material || PR.mat(color, opts)
    );
    return prep(m, opts);
  };

  PR.cone = function (r, h, seg, color, opts) {
    opts = opts || {};
    var m = new T.Mesh(
      new T.ConeGeometry(r, h, seg || 8, 1),
      opts.material || PR.mat(color, opts)
    );
    return prep(m, opts);
  };

  PR.put = function (parent, mesh, x, y, z, ry) {
    mesh.position.set(x || 0, y || 0, z || 0);
    if (ry) mesh.rotation.y = ry;
    parent.add(mesh);
    return mesh;
  };

  function set(parent, mesh, x, y, z, rx, ry, rz) {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    parent.add(mesh);
    return mesh;
  }
  PR.set = set;

  // ------------------------------------------------------------------ builders
  var B = {};

  B.bed = function () {
    var g = new T.Group();
    [[-0.95, -0.75], [0.95, -0.75], [-0.95, 0.72], [0.95, 0.72]].forEach(function (p) {
      PR.put(g, PR.box(0.13, 0.3, 0.13, C.woodDark), p[0], 0.15, p[1]);
    });
    PR.put(g, PR.box(2.16, 0.2, 1.78, C.wood), 0, 0.42, 0);
    PR.put(g, PR.box(2.3, 0.85, 0.12, C.woodDark), 0, 0.86, -0.86);
    for (var i = -2; i <= 2; i++) {
      PR.put(g, PR.box(0.08, 0.5, 0.05, C.woodLight), i * 0.36, 0.92, -0.93);
    }
    PR.put(g, PR.box(2.02, 0.22, 1.62, C.cream), 0, 0.6, 0.03);
    PR.put(g, PR.box(2.06, 0.13, 1.12, C.plumLight), 0, 0.73, 0.3);
    PR.put(g, PR.box(2.08, 0.1, 0.2, C.blue), 0, 0.79, -0.19);
    [-0.52, 0.52].forEach(function (x) {
      var p = PR.box(0.78, 0.16, 0.44, C.white, { rough: 1 });
      p.rotation.x = -0.14;
      PR.put(g, p, x, 0.78, -0.54);
    });
    var throwB = PR.box(1.9, 0.09, 0.42, C.rustLight);
    throwB.rotation.x = -0.05;
    PR.put(g, throwB, 0, 0.84, 0.66);
    return g;
  };

  B.wardrobe = function () {
    var g = new T.Group();
    PR.put(g, PR.box(1.46, 0.14, 0.68, C.woodDark), 0, 0.07, 0);
    PR.put(g, PR.box(1.4, 2.16, 0.62, C.plum), 0, 1.2, 0);
    PR.put(g, PR.box(1.52, 0.12, 0.72, C.woodDark), 0, 2.36, 0);
    [-0.35, 0.35].forEach(function (x) {
      PR.put(g, PR.box(0.62, 1.94, 0.05, C.plumLight), x, 1.22, 0.33);
      PR.put(g, PR.box(0.5, 1.7, 0.02, C.plum), x, 1.24, 0.36);
      PR.put(g, PR.sphere(0.035, C.goldLight, { seg: 8, rough: 0.35, metal: 0.7 }), x < 0 ? -0.06 : 0.06, 1.24, 0.38);
    });
    return g;
  };

  B.desk = function () {
    var g = new T.Group();
    PR.put(g, PR.box(1.66, 0.09, 0.72, C.woodLight), 0, 0.77, 0);
    [[-0.72, -0.28], [0.72, -0.28], [-0.72, 0.28], [0.72, 0.28]].forEach(function (p) {
      PR.put(g, PR.box(0.09, 0.74, 0.09, C.woodDark), p[0], 0.37, p[1]);
    });
    PR.put(g, PR.box(0.6, 0.18, 0.48, C.wood), 0.42, 0.63, 0.06);
    PR.put(g, PR.sphere(0.035, 0.35, { seg: 8, rough: 0.4, metal: 0.6 }), 0.2, 0.63, 0.31);
    PR.put(g, PR.box(0.26, 0.05, 0.34, C.rust), -0.5, 0.84, 0.05);
    PR.put(g, PR.box(0.24, 0.05, 0.3, C.blue), -0.48, 0.89, 0.02);
    PR.put(g, PR.cyl(0.06, 0.06, 0.11, 10, C.white), 0.02, 0.87, 0.16);
    PR.put(g, PR.box(0.34, 0.012, 0.26, C.cream), 0.1, 0.83, -0.14);
    return g;
  };

  B.chair = function () {
    var g = new T.Group();
    PR.put(g, PR.box(0.52, 0.07, 0.5, C.woodLight), 0, 0.47, 0);
    [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]].forEach(function (p) {
      PR.put(g, PR.box(0.06, 0.47, 0.06, C.woodDark), p[0], 0.235, p[1]);
    });
    PR.put(g, PR.box(0.52, 0.55, 0.06, C.wood), 0, 0.79, -0.22);
    PR.put(g, PR.box(0.46, 0.06, 0.44, C.plumLight), 0, 0.52, 0.01);
    return g;
  };

  B.shelf = function () {
    var g = new T.Group();
    var rand = rng(77);
    PR.put(g, PR.box(0.08, 2.24, 0.44, C.wood), -0.72, 1.12, 0);
    PR.put(g, PR.box(0.08, 2.24, 0.44, C.wood), 0.72, 1.12, 0);
    PR.put(g, PR.box(1.38, 2.2, 0.04, C.woodDark), 0, 1.12, -0.2);
    var ys = [0.1, 0.66, 1.22, 1.78, 2.2];
    ys.forEach(function (y) {
      PR.put(g, PR.box(1.52, 0.06, 0.44, C.woodLight), 0, y + 0.03, 0);
    });
    for (var s = 0; s < 4; s++) {
      var yb = ys[s] + 0.06;
      var x = -0.66;
      while (x < 0.62) {
        var bw = 0.05 + rand() * 0.05;
        var bh = 0.22 + rand() * 0.14;
        var col = [C.rust, C.blue, C.sage, C.gold, C.plumLight, C.cream][Math.floor(rand() * 6)];
        PR.put(g, PR.box(bw, bh, 0.16, col), x + bw / 2, yb + bh / 2, 0.02);
        x += bw + 0.014;
      }
    }
    PR.put(g, PR.cyl(0.09, 0.07, 0.16, 8, C.terracotta), 0.42, 2.31, 0);
    PR.put(g, PR.sphere(0.14, C.sage, { seg: 8, flat: true }), 0.42, 2.48, 0);
    return g;
  };

  B.sofa = function () {
    var g = new T.Group();
    var body = 0x9fd0b0;
    var light = 0xc4e6cc;
    PR.put(g, PR.box(2.0, 0.42, 0.9, body), 0, 0.39, 0);
    PR.put(g, PR.box(2.0, 0.64, 0.2, body), 0, 0.78, -0.35);
    PR.put(g, PR.box(0.2, 0.52, 0.9, light), -0.98, 0.6, 0);
    PR.put(g, PR.box(0.2, 0.52, 0.9, light), 0.98, 0.6, 0);
    [-0.5, 0.5].forEach(function (x) {
      PR.put(g, PR.box(0.84, 0.16, 0.7, light), x, 0.65, 0.04);
      PR.put(g, PR.box(0.78, 0.42, 0.16, light), x, 0.9, -0.2);
    });
    [[-0.85, -0.32], [0.85, -0.32], [-0.85, 0.32], [0.85, 0.32]].forEach(function (p) {
      PR.put(g, PR.box(0.09, 0.18, 0.09, C.woodDark), p[0], 0.09, p[1]);
    });
    var throwB = PR.box(0.44, 0.07, 0.62, C.rustLight);
    set(g, throwB, -0.72, 0.72, 0.02, 0, 0.2, 0);
    PR.put(g, PR.box(0.34, 0.12, 0.34, C.gold), 0.42, 0.8, 0.06);
    var drape = PR.box(1.5, 0.06, 0.44, C.rustLight);
    drape.position.set(0.1, 1.04, -0.26);
    drape.rotation.x = 0.04;
    g.add(drape);
    var hang = PR.box(0.72, 0.36, 0.055, C.rustLight);
    hang.position.set(0.18, 0.84, -0.47);
    g.add(hang);
    return g;
  };

  B.table = function () {
    var g = new T.Group();
    PR.put(g, PR.box(1.4, 0.07, 0.8, C.woodLight), 0, 0.44, 0);
    [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]].forEach(function (p) {
      PR.put(g, PR.box(0.07, 0.44, 0.07, C.woodDark), p[0], 0.22, p[1]);
    });
    PR.put(g, PR.box(1.2, 0.05, 0.62, C.wood), 0, 0.16, 0);
    PR.put(g, PR.box(0.2, 0.04, 0.28, C.blue), -0.28, 0.5, 0.06);
    PR.put(g, PR.box(0.18, 0.04, 0.24, C.rust), -0.26, 0.54, 0.03);
    PR.put(g, PR.cyl(0.09, 0.06, 0.18, 10, C.terracotta), 0.34, 0.57, -0.02);
    PR.put(g, PR.sphere(0.15, C.sage, { seg: 8, flat: true }), 0.34, 0.74, -0.02);
    PR.put(g, PR.cyl(0.055, 0.055, 0.1, 10, C.white), 0.05, 0.53, 0.1);
    return g;
  };

  B.side = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.3, 0.3, 0.06, 16, C.woodLight), 0, 0.5, 0);
    PR.put(g, PR.cyl(0.04, 0.04, 0.48, 8, C.woodDark), 0, 0.26, 0);
    PR.put(g, PR.cyl(0.26, 0.26, 0.04, 16, C.woodDark), 0, 0.05, 0);
    PR.put(g, PR.cyl(0.05, 0.05, 0.09, 10, C.white), 0.08, 0.57, 0.04);
    return g;
  };

  B.record = function () {
    var g = new T.Group();
    PR.put(g, PR.box(1.2, 0.52, 0.5, C.wood), 0, 0.36, 0);
    PR.put(g, PR.box(1.24, 0.05, 0.54, C.woodLight), 0, 0.65, 0);
    [[-0.52, -0.18], [0.52, -0.18], [-0.52, 0.18], [0.52, 0.18]].forEach(function (p) {
      PR.put(g, PR.box(0.07, 0.1, 0.07, C.woodDark), p[0], 0.05, p[1]);
    });
    PR.put(g, PR.cyl(0.2, 0.2, 0.05, 24, 0x3a3f5e), -0.22, 0.7, 0);
    PR.put(g, PR.cyl(0.06, 0.06, 0.052, 16, C.gold), -0.22, 0.71, 0);
    PR.put(g, PR.box(0.02, 0.02, 0.3, C.cream), -0.02, 0.74, 0.1);
    PR.put(g, PR.box(0.3, 0.26, 0.03, C.creamDark), 0.36, 0.55, 0.26);
    PR.put(g, PR.sphere(0.03, C.gold, { seg: 8 }), 0.18, 0.72, 0.02);
    return g;
  };

  B.beanbag = function () {
    var g = new T.Group();
    var s = PR.sphere(0.5, C.plumLight, { seg: 14, flat: true });
    s.scale.set(1, 0.62, 1);
    PR.put(g, s, 0, 0.32, 0);
    var p = PR.box(0.32, 0.1, 0.32, C.rustLight);
    set(g, p, 0.1, 0.48, 0.08, 0.1, 0.3, 0);
    return g;
  };

  B.boxes = function () {
    var g = new T.Group();
    PR.put(g, PR.box(0.72, 0.44, 0.55, 0xe0bb92), 0, 0.22, 0);
    PR.put(g, PR.box(0.54, 0.34, 0.4, 0xcfa87c), 0.06, 0.62, 0.02);
    PR.put(g, PR.box(0.16, 0.02, 0.56, 0xffe3bd), 0, 0.45, 0);
    PR.put(g, PR.box(0.1, 0.02, 0.42, 0xffe3bd), 0.06, 0.8, 0.02);
    return g;
  };

  B.rug = function () {
    var g = new T.Group();
    var m = new T.Mesh(
      new T.BoxGeometry(3.2, 0.035, 2.4),
      [PR.mat(C.rust), PR.mat(C.rust), PR.rugMat, PR.mat(C.rust), PR.mat(C.rust), PR.mat(C.rust)]
    );
    m.position.y = 0.018;
    m.receiveShadow = true;
    m.castShadow = false;
    g.add(m);
    return g;
  };

  B.roundRug = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.95, 0.95, 0.035, 28, 0xe59a92, { receive: true }), 0, 0.018, 0);
    PR.put(g, PR.cyl(0.8, 0.8, 0.04, 28, 0xfff8ee, { receive: true }), 0, 0.02, 0);
    PR.put(g, PR.cyl(0.58, 0.58, 0.045, 28, 0xf2b8b0, { receive: true }), 0, 0.022, 0);
    return g;
  };

  B.lamp = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.2, 0.24, 0.06, 14, C.woodDark), 0, 0.03, 0);
    PR.put(g, PR.cyl(0.028, 0.028, 1.6, 8, C.woodDark), 0, 0.86, 0);
    var shadeMat = PR.mat(0xfff1d8, { emissive: 0xffcf8f, ei: 0.3 });
    var shade = PR.cyl(0.17, 0.3, 0.34, 14, 0, { material: shadeMat });
    shade.userData.glow = true;
    PR.put(g, shade, 0, 1.78, 0);
    PR.put(g, PR.sphere(0.09, 0xfff6e0, { emissive: 0xffe0a8, ei: 0.7, seg: 10 }), 0, 1.7, 0).userData.glow = true;
    return g;
  };

  B.plant = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.22, 0.16, 0.3, 10, C.terracotta), 0, 0.15, 0);
    PR.put(g, PR.cyl(0.19, 0.19, 0.02, 10, 0x3a2a24), 0, 0.31, 0);
    var rand = rng(31);
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2;
      var st = PR.cyl(0.012, 0.012, 0.36, 5, C.sage);
      set(g, st, Math.cos(a) * 0.07, 0.48, Math.sin(a) * 0.07, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      var leaf = PR.sphere(0.09, i % 2 ? C.sage : C.sageLight, { seg: 8, flat: true });
      leaf.scale.set(1.4, 0.55, 0.9);
      PR.put(g, leaf, Math.cos(a) * 0.18, 0.62 + rand() * 0.08, Math.sin(a) * 0.18);
    }
    return g;
  };

  B.palm = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.34, 0.25, 0.46, 12, C.terracotta), 0, 0.23, 0);
    PR.put(g, PR.cyl(0.3, 0.3, 0.02, 12, 0x3a2a24), 0, 0.47, 0);
    PR.put(g, PR.cyl(0.05, 0.08, 0.95, 8, 0x6b4a33), 0, 0.94, 0);
    var rand = rng(9);
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2 + 0.3;
      var leaf = PR.cone(0.2, 1.05, 5, i % 2 ? C.sage : C.sageLight, { flat: true });
      leaf.scale.z = 0.35;
      set(g, leaf, Math.cos(a) * 0.28, 1.35, Math.sin(a) * 0.28, 0.95, -a + Math.PI / 2, 0);
      leaf.rotation.z = 0.25;
    }
    return g;
  };

  B.catbed = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.4, 0.32, 0.26, 14, 0xe8c79a), 0, 0.13, 0);
    PR.put(g, PR.cyl(0.36, 0.36, 0.06, 14, 0xfff4e4), 0, 0.26, 0);
    PR.put(g, PR.cyl(0.41, 0.41, 0.05, 14, 0xf0d3a8), 0, 0.29, 0);
    return g;
  };

  // 会走动的猫：一个小低模，带可动的头和尾巴
  PR.makeCat = function () {
    var g = new T.Group();
    var body = PR.sphere(0.17, 0xf2e0cf, { seg: 12, flat: true });
    body.scale.set(1, 0.82, 1.35);
    PR.put(g, body, 0, 0.2, 0);
    var head = new T.Group();
    head.position.set(0, 0.3, 0.24);
    g.add(head);
    PR.put(head, PR.sphere(0.12, 0xf8ebdd, { seg: 12, flat: true }), 0, 0.02, 0);
    PR.put(head, PR.cone(0.042, 0.08, 4, 0xe8b8b0), -0.07, 0.12, -0.01);
    PR.put(head, PR.cone(0.042, 0.08, 4, 0xe8b8b0), 0.07, 0.12, -0.01);
    PR.put(head, PR.sphere(0.022, 0x3a2b33, { seg: 6 }), -0.045, 0.03, 0.1);
    PR.put(head, PR.sphere(0.022, 0x3a2b33, { seg: 6 }), 0.045, 0.03, 0.1);
    PR.put(head, PR.sphere(0.02, 0xd98f8f, { seg: 6 }), 0, 0.0, 0.12);
    var tail = PR.cyl(0.035, 0.045, 0.26, 8, 0xf2e0cf);
    PR.put(g, tail, 0.1, 0.26, -0.24).rotation.set(Math.PI / 2.4, 0.4, 0);
    [[-0.1, 0.12], [0.1, 0.12], [-0.1, -0.12], [0.1, -0.12]].forEach(function (p) {
      PR.put(g, PR.cyl(0.035, 0.035, 0.14, 8, 0xefd8c4), p[0], 0.07, p[1]);
    });
    g.userData.cat = { head: head, tail: tail };
    return g;
  };

  B.wallShelf = function () {
    var g = new T.Group();
    PR.put(g, PR.box(1.45, 0.05, 0.24, C.woodLight), 0, 0.1, 0.12);
    PR.put(g, PR.box(0.05, 0.13, 0.2, C.woodDark), -0.55, 0.035, 0.1);
    PR.put(g, PR.box(0.05, 0.13, 0.2, C.woodDark), 0.55, 0.035, 0.1);
    var cols = [C.rust, C.blue, C.sage, C.gold, C.plumLight];
    for (var i = 0; i < 8; i++) {
      PR.put(g, PR.box(0.045, 0.24, 0.16, cols[i % 5]), -0.62 + i * 0.062, 0.25, 0.12);
    }
    PR.put(g, PR.cyl(0.06, 0.05, 0.1, 8, C.terracotta), 0.52, 0.19, 0.12);
    PR.put(g, PR.sphere(0.09, C.sage, { seg: 8, flat: true }), 0.52, 0.29, 0.12);
    return g;
  };

  B.cushion = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.33, 0.3, 0.15, 18, 0x8a5364, { flat: true }), 0, 0.075, 0);
    PR.put(g, PR.cyl(0.29, 0.29, 0.02, 18, 0xa8646f), 0, 0.165, 0);
    PR.put(g, PR.sphere(0.028, C.gold, { seg: 6 }), 0, 0.18, 0);
    return g;
  };

  B.books = function () {
    var g = new T.Group();
    PR.put(g, PR.box(0.46, 0.07, 0.34, C.rust), 0, 0.035, 0);
    PR.put(g, PR.box(0.42, 0.06, 0.3, C.blue), 0.02, 0.1, 0.01);
    PR.put(g, PR.box(0.4, 0.06, 0.32, C.cream), -0.01, 0.16, -0.01);
    PR.put(g, PR.box(0.3, 0.05, 0.26, C.sage), 0.01, 0.215, 0);
    return g;
  };

  B.computer = function () {
    var g = new T.Group();
    PR.put(g, PR.box(1.7, 0.08, 0.8, C.cream), 0, 0.78, 0);
    [[-0.76, -0.34], [0.76, -0.34], [-0.76, 0.34], [0.76, 0.34]].forEach(function (p) {
      PR.put(g, PR.box(0.08, 0.78, 0.08, C.woodDark), p[0], 0.39, p[1]);
    });
    PR.put(g, PR.box(0.5, 0.16, 0.56, C.woodLight), -0.55, 0.62, 0);
    PR.put(g, PR.box(0.66, 0.4, 0.05, 0x2f3550), 0, 1.08, -0.2);
    var scr = new T.Mesh(
      new T.PlaneGeometry(0.58, 0.33),
      new T.MeshBasicMaterial({ map: PR.tex.pcScreen, toneMapped: false })
    );
    scr.position.set(0, 1.08, -0.168);
    g.add(scr);
    PR.put(g, PR.box(0.05, 0.16, 0.05, 0x2f3550), 0, 0.9, -0.2);
    PR.put(g, PR.box(0.26, 0.02, 0.18, 0x2f3550), 0, 0.83, -0.2);
    PR.put(g, PR.box(0.5, 0.025, 0.16, C.white), 0, 0.83, 0.12);
    PR.put(g, PR.sphere(0.045, 0xf2b3b0, { seg: 8 }), 0.38, 0.83, 0.13);
    PR.put(g, PR.box(0.2, 0.42, 0.4, 0x3c4a78), 0.62, 0.21, -0.05);
    PR.put(g, PR.box(0.02, 0.22, 0.02, 0x9fd0f2, { emissive: 0x9fd0f2, ei: 0.7 }), 0.52, 0.24, -0.05);
    PR.put(g, PR.cyl(0.045, 0.045, 0.08, 10, C.white), -0.35, 0.86, 0.12);
    PR.put(g, PR.cyl(0.05, 0.04, 0.07, 8, C.terracotta), 0.42, 0.855, -0.28);
    PR.put(g, PR.sphere(0.07, C.sage, { seg: 8, flat: true }), 0.42, 0.93, -0.28);
    return g;
  };

  B.consoleSet = function () {
    var g = new T.Group();
    PR.put(g, PR.box(0.9, 0.1, 0.45, C.woodDark), 0, 0.05, 0);
    PR.put(g, PR.box(0.56, 0.06, 0.26, 0x3c4a78), 0, 0.13, -0.05);
    PR.put(g, PR.box(0.4, 0.012, 0.012, 0x9fd0f2, { emissive: 0x9fd0f2, ei: 0.8 }), 0, 0.13, 0.085);
    [-0.22, 0.03].forEach(function (x) {
      PR.put(g, PR.box(0.14, 0.04, 0.08, C.white), x, 0.12, 0.15);
      PR.put(g, PR.sphere(0.018, 0x9fd0f2, { seg: 6 }), x + 0.04, 0.14, 0.17);
    });
    PR.put(g, PR.box(0.13, 0.18, 0.02, C.rust), 0.3, 0.15, -0.05);
    PR.put(g, PR.box(0.13, 0.18, 0.02, C.blue), 0.3, 0.15, -0.02);
    return g;
  };

  B.tv = function () {
    var g = new T.Group();
    PR.put(g, PR.box(0.74, 0.05, 0.44, C.woodDark), 0, 0.025, 0);
    PR.put(g, PR.box(0.09, 0.52, 0.13, C.creamDark), 0, 0.31, -0.03);
    PR.put(g, PR.box(1.58, 0.9, 0.07, 0x2f3550), 0, 1.08, 0);
    var scr = new T.Mesh(
      new T.PlaneGeometry(1.48, 0.8),
      new T.MeshBasicMaterial({ map: PR.tex.tvScreen, toneMapped: false })
    );
    scr.position.set(0, 1.08, 0.04);
    g.add(scr);
    PR.put(g, PR.box(1.0, 0.06, 0.08, 0x3c4a78), 0, 0.58, 0.02);
    PR.put(g, PR.cyl(0.05, 0.04, 0.08, 8, C.terracotta), 0.55, 0.09, 0.05);
    PR.put(g, PR.sphere(0.07, C.sage, { seg: 8, flat: true }), 0.55, 0.17, 0.05);
    return g;
  };

  B.robot = function () {
    var g = new T.Group();
    PR.put(g, PR.cyl(0.18, 0.2, 0.05, 16, C.creamDark), 0, 0.025, 0);
    var body = PR.sphere(0.15, C.white, { seg: 16 });
    body.scale.set(1, 1.05, 1);
    PR.put(g, body, 0, 0.24, 0);
    var head = new T.Group();
    head.position.set(0, 0.42, 0);
    g.add(head);
    var dome = PR.sphere(0.11, C.white, { seg: 14 });
    dome.scale.set(1, 0.85, 1);
    head.add(dome);
    var eyeMat = PR.mat(0x9fe3ff, { emissive: 0x7fd8ff, ei: 0.8 });
    var eye = PR.box(0.12, 0.05, 0.02, 0, { material: eyeMat });
    eye.position.set(0, 0.01, 0.1);
    head.add(eye);
    PR.put(g, PR.cyl(0.008, 0.008, 0.12, 6, C.creamDark), 0, 0.56, 0);
    PR.put(g, PR.sphere(0.025, 0x9fe3ff, { emissive: 0x7fd8ff, ei: 0.8, seg: 8 }), 0, 0.63, 0);
    [-1, 1].forEach(function (side) {
      var arm = PR.cyl(0.03, 0.025, 0.13, 8, C.creamDark);
      arm.position.set(side * 0.17, 0.25, 0);
      arm.rotation.z = side * 0.3;
      g.add(arm);
    });
    PR.put(g, PR.sphere(0.02, 0x9fe3ff, { emissive: 0x7fd8ff, ei: 0.6, seg: 8 }), 0, 0.27, 0.14);
    g.userData.robot = { head: head, body: body, eyeMat: eyeMat, baseY: 0.24 };
    return g;
  };

  B.telescope = function () {
    var g = new T.Group();
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2 + 0.4;
      var leg = PR.cyl(0.015, 0.02, 0.62, 6, C.woodDark);
      leg.position.set(Math.cos(a) * 0.13, 0.31, Math.sin(a) * 0.13);
      leg.rotation.z = Math.cos(a) * 0.28;
      leg.rotation.x = -Math.sin(a) * 0.28;
      g.add(leg);
    }
    PR.put(g, PR.sphere(0.05, C.gold, { seg: 10 }), 0, 0.66, 0);
    var tube = PR.cyl(0.055, 0.075, 0.52, 14, 0x9fb6e0);
    tube.rotation.x = -0.9;
    tube.position.set(0, 0.82, -0.02);
    g.add(tube);
    var ring = PR.cyl(0.078, 0.078, 0.04, 14, C.gold);
    ring.rotation.x = -0.9;
    ring.position.set(0, 0.63, 0.17);
    g.add(ring);
    PR.put(g, PR.cyl(0.03, 0.03, 0.08, 10, C.creamDark), 0, 0.6, 0.24);
    return g;
  };

  // ---- wall pieces (built facing +z, back at z = 0)

  B.art = function (variant) {
    var g = new T.Group();
    var v = variant == null ? 0 : variant;
    PR.put(g, PR.box(0.06, 1.15, 0.07, C.woodDark), -0.42, 0.575, 0.035);
    PR.put(g, PR.box(0.06, 1.15, 0.07, C.woodDark), 0.42, 0.575, 0.035);
    PR.put(g, PR.box(0.9, 0.06, 0.07, C.woodDark), 0, 1.12, 0.035);
    PR.put(g, PR.box(0.9, 0.06, 0.07, C.woodDark), 0, 0.03, 0.035);
    var m = new T.Mesh(new T.BoxGeometry(0.8, 1.03, 0.03), PR.artMats[v % PR.artMats.length]);
    m.position.set(0, 0.575, 0.02);
    m.castShadow = false;
    m.receiveShadow = true;
    g.add(m);
    return g;
  };

  B.clock = function () {
    var g = new T.Group();
    var body = PR.cyl(0.2, 0.2, 0.07, 20, C.woodDark);
    body.rotation.x = Math.PI / 2;
    PR.put(g, body, 0, 0.2, 0.035);
    var face = PR.cyl(0.17, 0.17, 0.02, 20, C.cream);
    face.rotation.x = Math.PI / 2;
    PR.put(g, face, 0, 0.2, 0.075);
    PR.put(g, PR.box(0.02, 0.1, 0.01, C.dark), 0, 0.23, 0.09);
    PR.put(g, PR.box(0.08, 0.02, 0.01, C.dark), 0.03, 0.2, 0.09);
    return g;
  };

  B.lights = function () {
    var g = new T.Group();
    var pts = [];
    for (var i = 0; i <= 10; i++) {
      var x = -1.15 + (i / 10) * 2.3;
      var y = 0.55 - Math.sin((i / 10) * Math.PI) * 0.32;
      pts.push(new T.Vector3(x, y, 0.05));
    }
    var curve = new T.CatmullRomCurve3(pts);
    var tube = new T.Mesh(
      new T.TubeGeometry(curve, 40, 0.022, 5, false),
      PR.mat(0x2f2531)
    );
    tube.castShadow = false;
    g.add(tube);
    for (var k = 0; k < 10; k++) {
      var p = curve.getPoint((k + 0.5) / 10);
      var bulbMat = PR.mat(0xffe0a8, { emissive: 0xffc070, ei: 0.7, rough: 0.6 });
      var b = PR.sphere(0.055, 0, { material: bulbMat, seg: 8, cast: false });
      b.userData.glow = true;
      b.position.set(p.x, p.y - 0.035, p.z);
      g.add(b);
    }
    return g;
  };

  PR.builders = B;

  // --------------------------------------------------------------- item list
  PR.ITEMS = [
    { id: 'bed', name: '双人床', cat: 'furniture', w: 2.3, d: 1.9, h: 1.3, build: function () { return B.bed(); } },
    { id: 'wardrobe', name: '衣柜', cat: 'furniture', w: 1.5, d: 0.7, h: 2.5, build: function () { return B.wardrobe(); } },
    { id: 'desk', name: '书桌', cat: 'furniture', w: 1.66, d: 0.75, h: 0.95, build: function () { return B.desk(); } },
    { id: 'computer', name: '电脑桌', cat: 'furniture', w: 1.75, d: 0.85, h: 1.3, build: function () { return B.computer(); } },
    { id: 'chair', name: '木椅', cat: 'furniture', w: 0.62, d: 0.55, h: 1.05, build: function () { return B.chair(); } },
    { id: 'shelf', name: '书架', cat: 'furniture', w: 1.52, d: 0.44, h: 2.4, build: function () { return B.shelf(); } },
    { id: 'sofa', name: '沙发', cat: 'furniture', w: 2.16, d: 0.95, h: 1.2, build: function () { return B.sofa(); } },
    { id: 'tv', name: '电视', cat: 'furniture', w: 1.65, d: 0.55, h: 1.6, build: function () { return B.tv(); } },
    { id: 'table', name: '茶几', cat: 'furniture', w: 1.4, d: 0.8, h: 0.85, build: function () { return B.table(); } },
    { id: 'side', name: '边几', cat: 'furniture', w: 0.6, d: 0.6, h: 0.65, build: function () { return B.side(); } },
    { id: 'record', name: '唱片柜', cat: 'furniture', w: 1.24, d: 0.54, h: 0.8, build: function () { return B.record(); } },
    { id: 'console', name: '游戏机', cat: 'furniture', w: 1.0, d: 0.6, h: 0.4, build: function () { return B.consoleSet(); } },
    { id: 'beanbag', name: '懒人沙发', cat: 'furniture', w: 1.0, d: 1.0, h: 0.75, build: function () { return B.beanbag(); } },
    { id: 'boxes', name: '收纳箱', cat: 'furniture', w: 0.8, d: 0.6, h: 0.9, build: function () { return B.boxes(); } },
    { id: 'rug', name: '大地毯', cat: 'decor', w: 3.2, d: 2.4, h: 0.05, flat: true, build: function () { return B.rug(); } },
    { id: 'roundRug', name: '圆地毯', cat: 'decor', w: 2.0, d: 2.0, h: 0.06, flat: true, build: function () { return B.roundRug(); } },
    { id: 'lamp', name: '落地灯', cat: 'decor', w: 0.55, d: 0.55, h: 2.0, light: { y: 1.72, color: 0xffb066, power: 7 }, build: function () { return B.lamp(); } },
    { id: 'plant', name: '绿植', cat: 'decor', w: 0.55, d: 0.55, h: 0.8, build: function () { return B.plant(); } },
    { id: 'palm', name: '大绿植', cat: 'decor', w: 0.9, d: 0.9, h: 2.0, build: function () { return B.palm(); } },
    { id: 'catbed', name: '猫窝', cat: 'decor', w: 0.85, d: 0.85, h: 0.6, build: function () { return B.catbed(); } },
    { id: 'robot', name: '小机器人', cat: 'decor', w: 0.5, d: 0.5, h: 0.68, build: function () { return B.robot(); } },
    { id: 'telescope', name: '望远镜', cat: 'decor', w: 0.6, d: 0.6, h: 0.95, build: function () { return B.telescope(); } },
    { id: 'cushion', name: '坐垫', cat: 'decor', w: 0.7, d: 0.7, h: 0.2, build: function () { return B.cushion(); } },
    { id: 'books', name: '旧书堆', cat: 'decor', w: 0.5, d: 0.4, h: 0.25, build: function () { return B.books(); } },
    { id: 'wallShelf', name: '壁架', cat: 'wall', zone: 'wall', w: 1.45, h: 0.4, build: function () { return B.wallShelf(); } },
    { id: 'art', name: '挂画', cat: 'wall', zone: 'wall', w: 0.95, h: 1.15, variant: 0, build: function (v) { return B.art(v == null ? 0 : v); } },
    { id: 'clock', name: '挂钟', cat: 'wall', zone: 'wall', w: 0.4, h: 0.4, build: function () { return B.clock(); } },
    { id: 'lights', name: '彩灯串', cat: 'wall', zone: 'wall', w: 2.4, h: 0.7, build: function () { return B.lights(); } },
  ];

  PR.itemById = function (id) {
    for (var i = 0; i < PR.ITEMS.length; i++) if (PR.ITEMS[i].id === id) return PR.ITEMS[i];
    return null;
  };
})();















