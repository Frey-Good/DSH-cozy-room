/* Anime room — the little resident: a cel-shaded anime chibi.
   Face is painted on a canvas texture and mapped onto a spherical face cap. */
(function () {
  'use strict';
  var T = THREE;
  var PR = window.PR;
  var C = PR.C;

  function makeFaceCanvas(mode) {
    mode = mode || 'normal';
    var S = 512;
    var cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, S, S);

    var closedEyes = mode === 'blink' || mode === 'sleep';
    var happyEyes = mode === 'happy';
    var surprised = mode === 'surprised';

    function eye(cx, cy, w, h, outward) {
      var dir = outward || -1;
      ctx.save();
      if (closedEyes) {
        ctx.strokeStyle = '#2b2a33';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.42, cy);
        ctx.quadraticCurveTo(cx, cy + 14, cx + w * 0.42, cy);
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cx + dir * w * 0.42, cy);
        ctx.lineTo(cx + dir * w * 0.56, cy - 13);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (happyEyes) {
        ctx.strokeStyle = '#2b2a33';
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.4, cy + 10);
        ctx.quadraticCurveTo(cx, cy - h * 0.44, cx + w * 0.4, cy + 10);
        ctx.stroke();
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(cx + dir * w * 0.4, cy + 8);
        ctx.lineTo(cx + dir * w * 0.55, cy - 10);
        ctx.stroke();
        ctx.restore();
        return;
      }
      // eye white
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      // iris
      var g = ctx.createLinearGradient(cx, cy - h * 0.5, cx, cy + h * 0.5);
      g.addColorStop(0, '#21456f');
      g.addColorStop(0.45, '#3f78ad');
      g.addColorStop(0.82, '#8fd0ee');
      g.addColorStop(1, '#c8ecfb');
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, w * 0.4, h * 0.44, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // pupil
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, w * 0.17, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#182238';
      ctx.fill();
      // iris lower glow
      ctx.beginPath();
      ctx.ellipse(cx, cy + h * 0.22, w * 0.28, h * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(190,240,255,0.55)';
      ctx.fill();
      // highlights
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.15, cy - h * 0.16, w * 0.15, h * 0.16, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + w * 0.16, cy + h * 0.14, w * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      // upper lash / lid
      ctx.strokeStyle = '#2b2a33';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.52, cy - h * 0.12);
      ctx.quadraticCurveTo(cx, cy - h * 0.62, cx + w * 0.52, cy - h * 0.1);
      ctx.stroke();
      // outer lash
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx + dir * w * 0.52, cy - h * 0.12);
      ctx.lineTo(cx + dir * w * 0.68, cy - h * 0.3);
      ctx.stroke();
      // lower lid
      ctx.strokeStyle = 'rgba(43,42,51,0.55)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.42, cy + h * 0.34);
      ctx.quadraticCurveTo(cx, cy + h * 0.5, cx + w * 0.42, cy + h * 0.3);
      ctx.stroke();
      ctx.restore();
    }

    // brows
    var browLift = surprised ? 12 : 0;
    ctx.strokeStyle = 'rgba(58,74,114,0.85)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(70, 236 - browLift);
    ctx.quadraticCurveTo(115, 214 - browLift, 162, 232 - browLift);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(350, 232 - browLift);
    ctx.quadraticCurveTo(397, 214 - browLift, 442, 236 - browLift);
    ctx.stroke();

    eye(115, 300, 170, surprised ? 178 : 165, -1);
    eye(397, 300, 170, surprised ? 178 : 165, 1);

    // blush
    var blush = ctx.createRadialGradient(0, 0, 2, 0, 0, 60);
    blush.addColorStop(0, 'rgba(246,150,150,' + (happyEyes ? '0.62' : '0.42') + ')');
    blush.addColorStop(1, 'rgba(246,150,150,0)');
    ctx.save();
    ctx.translate(58, 396);
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.ellipse(0, 0, 56, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(454, 396);
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.ellipse(0, 0, 56, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // mouth
    if (mode === 'happy') {
      ctx.fillStyle = '#b0505a';
      ctx.beginPath();
      ctx.moveTo(226, 396);
      ctx.quadraticCurveTo(256, 452, 286, 396);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb3b8';
      ctx.beginPath();
      ctx.ellipse(256, 424, 15, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mode === 'surprised') {
      ctx.fillStyle = '#b0505a';
      ctx.beginPath();
      ctx.ellipse(256, 416, 12, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#c05a5a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(226, 404);
      ctx.quadraticCurveTo(256, 428, 286, 404);
      ctx.stroke();
    }

    // nose
    ctx.fillStyle = 'rgba(200,140,120,0.5)';
    ctx.beginPath();
    ctx.ellipse(256, 372, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    return cv;
  }

  function faceTexture(mode) {
    var t = new T.CanvasTexture(makeFaceCanvas(mode));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  PR.makeCharacter = function () {
    var root = new T.Group();

    var skin = PR.mat(0xffe8d6, { emissive: 0x7a4a36, ei: 0.22 });
    var navy = PR.mat(0x3c4a78);
    var navyLight = PR.mat(0x5f78aa);
    var white = PR.mat(0xfffdf8);
    var blue = PR.mat(0x7fb6e0);
    var hairMat = PR.mat(0x3a4a72);
    var hairLight = PR.mat(0x5a78a8);
    var shoeMat = PR.mat(0x2f3550);
    var pink = PR.mat(0xf2b3b0);

    function mesh(geo, mat, x, y, z) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
      PR.addOutline(m, 1.03);
      return m;
    }

    // ---- legs / shoes
    var legGroupL = new T.Group();
    legGroupL.position.set(-0.075, 0.33, 0);
    var legGroupR = new T.Group();
    legGroupR.position.set(0.075, 0.33, 0);
    root.add(legGroupL);
    root.add(legGroupR);
    [-1, 1].forEach(function (side) {
      var grp = side < 0 ? legGroupL : legGroupR;
      var sock = new T.Mesh(new T.CylinderGeometry(0.045, 0.04, 0.22, 10), white);
      sock.position.y = -0.13;
      sock.castShadow = true;
      grp.add(sock);
      var shoe = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), shoeMat);
      shoe.scale.set(1, 0.7, 1.25);
      shoe.position.set(0, -0.27, 0.02);
      shoe.castShadow = true;
      grp.add(shoe);
    });

    // ---- skirt + frill + apron
    var skirt = mesh(new T.CylinderGeometry(0.13, 0.25, 0.26, 20), navy, 0, 0.44, 0);
    var frillMat = new T.MeshToonMaterial({ color: 0xfffdf8, gradientMap: PR.gradient, side: T.DoubleSide });
    var frill = mesh(new T.CylinderGeometry(0.255, 0.265, 0.05, 20, 1, true), frillMat, 0, 0.315, 0);
    var apron = mesh(new T.BoxGeometry(0.2, 0.2, 0.02), white, 0, 0.45, 0.185);
    apron.rotation.x = -0.12;
    var apronTop = mesh(new T.BoxGeometry(0.12, 0.06, 0.02), white, 0, 0.575, 0.135);
    apronTop.rotation.x = -0.25;

    // ---- bodice
    var bodice = mesh(new T.CylinderGeometry(0.125, 0.135, 0.2, 18), navy, 0, 0.68, 0);
    var collar = mesh(new T.CylinderGeometry(0.075, 0.09, 0.05, 16), white, 0, 0.79, 0);
    var chestBow = mesh(new T.BoxGeometry(0.08, 0.04, 0.03), blue, 0, 0.73, 0.135);
    chestBow.rotation.z = 0.2;

    // ---- arms
    var arms = [];
    [-1, 1].forEach(function (side) {
      var pivot = new T.Group();
      pivot.position.set(side * 0.145, 0.76, 0);
      pivot.rotation.z = side * 0.16;
      root.add(pivot);
      var sleeve = new T.Mesh(new T.SphereGeometry(0.068, 14, 10), white);
      sleeve.castShadow = true;
      pivot.add(sleeve);
      PR.addOutline(sleeve, 1.04);
      var arm = new T.Mesh(new T.CylinderGeometry(0.028, 0.026, 0.2, 8), skin);
      arm.position.y = -0.13;
      arm.castShadow = true;
      pivot.add(arm);
      var hand = new T.Mesh(new T.SphereGeometry(0.036, 10, 8), skin);
      hand.position.y = -0.245;
      hand.castShadow = true;
      pivot.add(hand);
      arms.push(pivot);
    });

    // ---- head
    var head = new T.Group();
    head.position.set(0, 0.97, 0);
    root.add(head);

    var headSkinMat = new T.MeshBasicMaterial({ color: 0xffdcc2, toneMapped: false });
    var headMesh = new T.Mesh(new T.SphereGeometry(0.19, 32, 24), headSkinMat);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    head.add(headMesh);

    // face cap
    var faceGeo = new T.SphereGeometry(0.197, 40, 28, Math.PI / 2 - 0.75, 1.5, 0.78, 1.32);
    var faces = {
      normal: faceTexture('normal'),
      blink: faceTexture('blink'),
      happy: faceTexture('happy'),
      surprised: faceTexture('surprised'),
      sleep: faceTexture('sleep'),
    };
    var faceMat = new T.MeshBasicMaterial({ map: faces.normal, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false });
    var face = new T.Mesh(faceGeo, faceMat);
    face.renderOrder = 2;
    head.add(face);

    // hair: back mass + bangs + side locks + long back
    var backHair = new T.Mesh(new T.SphereGeometry(0.203, 24, 18), hairMat);
    backHair.scale.set(1.02, 1.02, 0.96);
    backHair.position.set(0, 0.015, -0.045);
    backHair.castShadow = true;
    head.add(backHair);
    PR.addOutline(backHair, 1.02);

    var longHair = new T.Mesh(new T.CylinderGeometry(0.17, 0.1, 0.56, 16), hairMat);
    longHair.position.set(0, -0.32, -0.1);
    longHair.castShadow = true;
    head.add(longHair);
    PR.addOutline(longHair, 1.02);

    var longHairTip = new T.Mesh(new T.CylinderGeometry(0.1, 0.055, 0.22, 14), hairLight);
    longHairTip.position.set(0, -0.69, -0.1);
    longHairTip.castShadow = true;
    head.add(longHairTip);

    [-1, 1].forEach(function (side) {
      var lock = new T.Mesh(new T.CylinderGeometry(0.05, 0.03, 0.42, 10), hairMat);
      lock.position.set(side * 0.185, -0.16, 0.01);
      lock.rotation.z = side * 0.06;
      lock.castShadow = true;
      head.add(lock);
      PR.addOutline(lock, 1.03);

      var bang = new T.Mesh(new T.SphereGeometry(0.085, 14, 10), hairMat);
      bang.scale.set(1.25, 0.7, 0.62);
      bang.position.set(side * 0.085, 0.145, 0.115);
      bang.rotation.z = side * 0.18;
      bang.castShadow = true;
      head.add(bang);
      PR.addOutline(bang, 1.03);
    });

    var middleBang = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), hairMat);
    middleBang.scale.set(1.1, 0.75, 0.6);
    middleBang.position.set(0, 0.16, 0.13);
    middleBang.castShadow = true;
    head.add(middleBang);

    // white frilled headdress
    var band = new T.Mesh(new T.TorusGeometry(0.2, 0.022, 8, 28), white);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.12, -0.01);
    head.add(band);
    PR.addOutline(band, 1.05);
    for (var i = 0; i < 13; i++) {
      var a = -Math.PI * 0.95 + (i / 12) * Math.PI * 1.9;
      var frillBall = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), white);
      frillBall.position.set(Math.cos(a) * 0.205, 0.145, Math.sin(a) * 0.205 - 0.01);
      head.add(frillBall);
    }

    // blue bow on the side
    var bowL = new T.Mesh(new T.ConeGeometry(0.055, 0.08, 8), blue);
    bowL.position.set(0.2, 0.14, 0.02);
    bowL.rotation.z = Math.PI / 2;
    head.add(bowL);
    var bowR = new T.Mesh(new T.ConeGeometry(0.055, 0.08, 8), blue);
    bowR.position.set(0.2, 0.14, 0.02);
    bowR.rotation.z = -Math.PI / 2;
    head.add(bowR);

    // little whale tail (homage)
    var tail = new T.Group();
    tail.position.set(0, 0.42, -0.19);
    var tailStem = new T.Mesh(new T.CylinderGeometry(0.03, 0.045, 0.16, 8), navy);
    tailStem.rotation.x = 0.5;
    tail.add(tailStem);
    PR.addOutline(tailStem, 1.05);
    [-1, 1].forEach(function (side) {
      var fin = new T.Mesh(new T.ConeGeometry(0.075, 0.16, 8), navy);
      fin.position.set(side * 0.07, -0.05, -0.06);
      fin.rotation.z = side * 1.0;
      fin.rotation.x = -0.5;
      fin.scale.z = 0.5;
      tail.add(fin);
      PR.addOutline(fin, 1.04);
    });
    root.add(tail);

    // ---- animation / expressions
    var phase = 0;
    var yaw = Math.PI * 0.25;
    var targetYaw = yaw;
    root.rotation.y = yaw;
    root.scale.setScalar(1.55);
    var blinkTimer = 2 + Math.random() * 2;
    var blinking = false;
    var blinkEnd = 0;
    var expression = 'normal';
    var action = null;

    function setExpression(name) {
      if (!faces[name] || expression === name) return;
      expression = name;
      faceMat.map = faces[name];
      faceMat.needsUpdate = true;
    }

    function play(name) {
      var ttl = name === 'sleep' ? Infinity : name === 'yawn' ? 1.4 : name === 'wave' ? 1.1 : name === 'cheer' ? 0.8 : 0.7;
      action = { name: name, t: 0, ttl: ttl };
      if (name === 'sleep') setExpression('sleep');
      else if (name === 'wake' || name === 'surprised') setExpression('surprised');
      else if (name === 'wave' || name === 'cheer' || name === 'yawn') setExpression('happy');
    }

    return {
      root: root,
      head: head,
      baseScale: 1.55,
      setExpression: setExpression,
      play: play,
      face: function (angle) {
        targetYaw = angle;
      },
      update: function (dt, moving) {
        phase += dt * (moving ? 8.5 : 1.5);
        var amt = moving ? 1 : 0.12;
        var s = Math.sin(phase);
        legGroupL.rotation.x = s * 0.5 * amt;
        legGroupR.rotation.x = -s * 0.5 * amt;
        arms[0].rotation.x = -s * 0.45 * amt;
        arms[1].rotation.x = s * 0.45 * amt;
        arms[0].rotation.z = -0.16;
        arms[1].rotation.z = 0.16;
        root.position.y = moving ? Math.abs(Math.sin(phase)) * 0.02 : Math.sin(phase * 0.9) * 0.006;
        head.rotation.z = Math.sin(phase * 0.5) * 0.02;
        head.rotation.x = moving ? Math.sin(phase * 2) * 0.02 : Math.sin(phase * 0.7) * 0.01;

        if (action) {
          action.t += dt;
          var at = action.t;
          if (action.name === 'wave') {
            arms[1].rotation.z = -2.0;
            arms[1].rotation.x = Math.sin(at * 14) * 0.35;
          } else if (action.name === 'cheer') {
            arms[0].rotation.z = -2.2;
            arms[1].rotation.z = 2.2;
            root.position.y = Math.abs(Math.sin((at / action.ttl) * Math.PI)) * 0.1;
          } else if (action.name === 'yawn') {
            arms[0].rotation.z = -2.4;
            arms[1].rotation.z = 2.4;
            head.rotation.x = -0.12;
            root.position.y = Math.sin((at / action.ttl) * Math.PI) * 0.03;
          } else if (action.name === 'sleep') {
            head.rotation.z = 0.14;
            head.rotation.x = 0.06;
            root.position.y = Math.sin(phase * 0.5) * 0.012;
          } else if (action.name === 'wake') {
            root.position.y = Math.abs(Math.sin((at / action.ttl) * Math.PI)) * 0.09;
            arms[0].rotation.z = -0.6;
            arms[1].rotation.z = 0.6;
          }
          if (at >= action.ttl) {
            var sleepingAction = action.name === 'sleep';
            action = null;
            if (!sleepingAction) setExpression('normal');
          }
        }

        if (expression === 'normal') {
          blinkTimer -= dt;
          if (blinkTimer <= 0 && !blinking) {
            blinking = true;
            blinkEnd = 0.12;
            setExpression('blink');
          }
          if (blinking) {
            blinkEnd -= dt;
            if (blinkEnd <= 0) {
              blinking = false;
              blinkTimer = 2.4 + Math.random() * 3.2;
              setExpression('normal');
            }
          }
        }

        var d = targetYaw - yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        yaw += d * Math.min(1, dt * 10);
        root.rotation.y = yaw;
      },
    };
  };

  // ------------------------------------------- 2D illustration skin (桌宠立绘)
  PR.loadPetSkin = function (done) {
    var data = PR.petSpriteData;
    if (!data) {
      done(new Error('pet sprite data missing'));
      return;
    }
    var keys = ['front', 'side', 'back', 'happy'];
    var out = {};
    var pending = keys.length;
    var failed = false;
    keys.forEach(function (key) {
      var img = new Image();
      img.onload = function () {
        var t = new T.Texture(img);
        t.colorSpace = T.SRGBColorSpace;
        t.anisotropy = 4;
        t.needsUpdate = true;
        out[key] = t;
        pending -= 1;
        if (pending === 0 && !failed) done(null, out);
      };
      img.onerror = function () {
        if (failed) return;
        failed = true;
        done(new Error('pet skin image failed: ' + key));
      };
      img.src = data[key];
    });
  };

  PR.makePetSkin = function (tex) {
    var group = new T.Group();
    var H = 1.85;

    var mirrored = tex.side.clone();
    mirrored.wrapS = T.RepeatWrapping;
    mirrored.repeat.x = -1;
    mirrored.offset.x = 1;
    mirrored.needsUpdate = true;

    var views = {
      front: { map: tex.front, aspect: tex.front.image.width / tex.front.image.height },
      side: { map: tex.side, aspect: tex.side.image.width / tex.side.image.height },
      sideRight: { map: mirrored, aspect: tex.side.image.width / tex.side.image.height },
      back: { map: tex.back, aspect: tex.back.image.width / tex.back.image.height },
      happy: { map: tex.happy, aspect: tex.happy.image.width / tex.happy.image.height },
    };

    var mat = new T.MeshBasicMaterial({
      map: views.front.map,
      transparent: true,
      alphaTest: 0.02,
      toneMapped: false,
      side: T.DoubleSide,
    });
    var plane = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
    plane.rotation.y = Math.PI / 4;
    plane.position.y = H / 2;
    plane.scale.set(H * views.front.aspect, H, 1);
    group.add(plane);

    var blob = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), PR.shadowMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    group.add(blob);

    var dirAngle = Math.PI * 0.25;
    var view = 'front';
    var idleTime = 0;
    var phase = 0;
    var action = null;
    var sleeping = false;

    function viewForDir() {
      var dx = Math.sin(dirAngle);
      var dz = Math.cos(dirAngle);
      var toward = (dx + dz) * 0.7071;
      var right = (dx - dz) * 0.7071;
      if (toward > 0.42) return 'front';
      if (toward < -0.42) return 'back';
      return right > 0 ? 'sideRight' : 'side';
    }

    function show(name) {
      if (view === name) return;
      view = name;
      var v = views[name];
      mat.map = v.map;
      mat.needsUpdate = true;
      plane.scale.set(H * v.aspect, H, 1);
    }

    return {
      root: group,
      isSprite: true,
      baseScale: 1,
      setExpression: function () {},
      play: function (name) {
        if (name === 'sleep') {
          sleeping = true;
          action = null;
          show('front');
          return;
        }
        if (name === 'wake') {
          sleeping = false;
          action = { name: 'wake', t: 0, ttl: 0.7 };
          show('front');
          return;
        }
        action = { name: name, t: 0, ttl: name === 'yawn' ? 1.4 : 1.0 };
        show(name === 'yawn' || name === 'wave' || name === 'cheer' ? 'happy' : 'front');
      },
      face: function (angle) {
        dirAngle = angle;
        if (!action && !sleeping) show(viewForDir());
      },
      update: function (dt, moving) {
        phase += dt * (moving ? 9 : 2);
        if (action) {
          action.t += dt;
          var p = Math.min(1, action.t / action.ttl);
          var hop = Math.abs(Math.sin(p * Math.PI)) * (action.name === 'wake' ? 0.12 : 0.07);
          plane.position.y = H / 2 + hop;
          plane.rotation.z = action.name === 'cheer' ? Math.sin(p * Math.PI * 4) * 0.06 : 0;
          if (action.t >= action.ttl) {
            action = null;
            show('front');
          }
          return;
        }
        if (sleeping) {
          plane.position.y = H / 2 + Math.sin(phase * 0.6) * 0.008;
          plane.rotation.z = 0.16;
          return;
        }
        plane.position.y = H / 2 + Math.sin(phase) * 0.006;
        plane.rotation.z = Math.sin(phase * 0.5) * 0.006;
        if (!moving) show('front');
      },
    };
  };
})();















