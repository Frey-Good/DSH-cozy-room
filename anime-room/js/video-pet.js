/* Purple room — the resident, played straight from dsh-pet's transparent webm clips.
   Home spots are random; work happens at the desk and sleep on the bed. While the
   agent is working (DSH status), she works too. */
(function () {
  'use strict';
  var T = THREE;
  var PR = window.PR;

  var SRC_W = 640;
  var SRC_H = 360;
  var CROP = { x: 180, y: 28, w: 280, h: 312 };
  var FEET_Y = 330;
  var PLANE_H = 2.1;
  var PLANE_W = PLANE_H * CROP.w / CROP.h;
  var FOOT_OFFSET = ((CROP.y + CROP.h - FEET_Y) / CROP.h) * PLANE_H;

  PR.makeVideoPet = function (opts) {
    opts = opts || {};
    var data = PR.petVideos || {};
    var home = opts.home || { x: 3.9, z: 4.0, y: 0 };
    var bed = opts.bed || { x: 1.9, z: 1.05, y: 0.86 };
    var desk = opts.desk || { x: 6.8, z: 1.47, y: 0 };
    var nextHome = typeof opts.nextHome === 'function' ? opts.nextHome : null;

    var group = new T.Group();

    var blob = new T.Mesh(new T.PlaneGeometry(0.8, 0.8), PR.shadowMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    group.add(blob);

    var plane = new T.Mesh(
      new T.PlaneGeometry(PLANE_W, PLANE_H),
      new T.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        alphaTest: 0.01,
      })
    );
    group.add(plane);

    var clips = {};
    var current = null;
    var pos = 'home';
    var fade = 1;
    var fadeDir = 0;
    var pending = null;
    var ambientWait = 8 + Math.random() * 8;
    var actionsAtSpot = 0;
    var moveAfter = 1 + Math.floor(Math.random() * 8);
    var moveAfterClip = false;
    var ambientClock = 0;
    var sleeping = false;
    var sleepAt = 0;
    var reading = false;
    var readUntil = 0;
    var sleepClock = 0;
    function isNightHour() {
      var h = typeof window.__forceHour === 'number' ? window.__forceHour : new Date().getHours();
      return h >= 23 || h < 8;
    }
    var manualUntil = 0;
    var energy = 0.7;
    var paceScale = 1;
    var phase = 'day';
    var lastPhase = '';

    function phaseOf(h) {
      if (h >= 23 || h < 7) return 'night';
      if (h < 9) return 'morning';
      if (h < 12) return 'work';
      if (h < 14) return 'lunch';
      if (h < 18) return 'work';
      if (h < 22) return 'evening';
      return 'night';
    }

    function ambientPool() {
      if (phase === 'night') return ['yawn', 'look', 'stretch'];
      if (phase === 'morning') return ['stretch', 'look', 'yawn', 'icecream', 'mirror'];
      if (phase === 'lunch') return ['eat', 'icecream', 'bubbles', 'look'];
      if (phase === 'evening') return ['cat', 'bubbles', 'mirror', 'scared', 'balloon', 'stretch'];
      return ['code', 'busy', 'look', 'cat', 'mirror', 'stretch'];
    }
    var working = false;
    var workState = 'idle';
    var WORK_CLIPS = {
      thinking: 'think',
      working: 'code',
      result: 'busy',
      waiting: 'think',
      success: 'cheer',
      error: 'scared',
    };

    function workClip() {
      return WORK_CLIPS[workState] || 'think';
    }

    // Work is a slow cycle of poses; it ends with cheer on success.
    var WORK_LOOP = ['code', 'busy', 'think', 'busy'];
    var workTimer = null;
    var workLoopIdx = 0;

    function stopWorkCycle() {
      if (workTimer) {
        clearInterval(workTimer);
        workTimer = null;
      }
    }

    function startWorkCycle() {
      stopWorkCycle();
      workLoopIdx = 0;
      goto(WORK_LOOP[0]);
      workTimer = setInterval(function () {
        if (!working || sleeping) return;
        if (Date.now() < manualUntil) return;
        if (pending || fadeDir !== 0) return;
        if (!isWork(current)) return;
        workLoopIdx = (workLoopIdx + 1) % WORK_LOOP.length;
        goto(WORK_LOOP[workLoopIdx]);
      }, 9000);
    }
    var queue = [];
    var lastAmbient = null;
    var windTimer = null;
    var extAmbient = [];

    function makeVideo(src) {
      var v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = src;
      v.style.position = 'fixed';
      v.style.left = '-9999px';
      v.style.width = '2px';
      v.style.height = '2px';
      v.style.opacity = '0';
      v.style.pointerEvents = 'none';
      document.body.appendChild(v);
      return v;
    }

    function makeTexture(v) {
      var tex = new T.VideoTexture(v);
      tex.colorSpace = T.SRGBColorSpace;
      tex.minFilter = T.LinearFilter;
      tex.magFilter = T.LinearFilter;
      tex.generateMipmaps = false;
      tex.repeat.set(CROP.w / SRC_W, CROP.h / SRC_H);
      tex.offset.set(CROP.x / SRC_W, 1 - (CROP.y + CROP.h) / SRC_H);
      return tex;
    }

    function registerClip(key, v, cfg) {
      v.loop = !!cfg.loop;
      var clip = {
        video: v,
        texture: makeTexture(v),
        loop: !!cfg.loop,
        next: cfg.next || null,
        where: cfg.where || 'home',
        lying: !!cfg.lying,
      };
      clips[key] = clip;
      v.addEventListener('ended', function () {
        if (current !== key) return;
        if (key === 'think') {
          if (workState !== 'idle') playClip(workClip());
          else finishAction();
          return;
        }
        if (key === 'cheer' || key === 'scared') {
          if (workState !== 'idle') goto(workClip());
          else finishAction();
          return;
        }
        if (isWork(key)) {
          if (workState !== 'idle') goto(workClip());
          else finishAction();
          return;
        }
        if (key === 'look') {
          finishAction();
          return;
        }
        if (clip.next === 'here') {
          playClip('idle');
          return;
        }
        if (clip.next === 'home') {
          sleeping = false;
          finishAction();
          return;
        }
        if (clip.next) goto(clip.next);
      });
    }

    function addClip(key, cfg) {
      var src = data[key];
      if (!src) return;
      registerClip(key, makeVideo(src), cfg);
    }

    function addUrlClip(key, file, cfg) {
      if (clips[key]) return;
      registerClip(key, makeVideo('assets/webm/' + encodeURIComponent(file)), cfg);
    }

    addClip('idle', { loop: true, where: 'home' });
    addClip('wave', { next: 'here', where: 'here' });
    addClip('cheer', { next: 'here', where: 'here' });
    addClip('sleepStart', { where: 'bed', next: 'sleepLoop' });
    addClip('sleepLoop', { loop: true, where: 'bed' });
    addClip('wake', { where: 'bed', next: 'home' });
    addClip('code', { where: 'desk', next: 'home' });
    addClip('think', { where: 'desk', next: 'home' });
    addClip('busy', { where: 'desk', next: 'home' });
    addClip('cat', { where: 'home', next: 'home' });
    addClip('eat', { where: 'home', next: 'home' });
    addClip('stretch', { where: 'home', next: 'home' });
    addClip('bubbles', { where: 'home', next: 'home' });
    addClip('look', { where: 'home', next: 'home' });
    addClip('yawn', { where: 'home', next: 'home' });
    addClip('icecream', { where: 'home', next: 'home' });
    addClip('mirror', { where: 'home', next: 'home' });
    addClip('scared', { where: 'here', next: 'home' });
    addClip('balloon', { where: 'home', next: 'home' });

    function isWork(key) {
      return key === 'code' || key === 'think' || key === 'busy';
    }

    function anchorFor(where) {
      if (where === 'bed') return bed;
      if (where === 'desk') return desk;
      return home;
    }

    function applyPose(where, isLying) {
      pos = where;
      var a = anchorFor(where);
      group.position.set(a.x, a.y || 0, a.z);
      if (isLying) {
        plane.rotation.set(-Math.PI / 2, 0, 0);
        plane.position.set(0, 0, 0);
        plane.scale.set(0.86, 0.86, 1);
        blob.position.set(0, 0.012, 0);
        blob.scale.set(1.15, 0.8, 1);
      } else {
        plane.rotation.set(0, Math.PI / 4, 0);
        plane.position.set(0, PLANE_H / 2 - FOOT_OFFSET, 0);
        plane.scale.set(1, 1, 1);
        blob.position.set(0, 0.02, 0);
        blob.scale.set(0.9, 0.9, 1);
      }
    }

    function playClip(key) {
      var c = clips[key];
      if (!c) return;
      if (key === 'think' || key === 'code' || key === 'busy') energy = Math.max(0, energy - 0.035);
      if (key === 'eat') energy = Math.min(1, energy + 0.2);
      if (key === 'icecream') energy = Math.min(1, energy + 0.12);
      if (key === 'sleepStart' || key === 'sleepLoop') energy = Math.min(1, energy + 0.15);
      current = key;
      var v = c.video;
      // A freshly-switched video draws a black frame until its first data arrives.
      // Keep the old frame (or hide the card) instead of flashing black.
      if (v.readyState < 2) {
        plane.visible = false;
        var applyFrame = function () {
          v.removeEventListener('loadeddata', applyFrame);
          if (current !== key) return;
          plane.material.map = c.texture;
          plane.material.needsUpdate = true;
          plane.visible = true;
        };
        v.addEventListener('loadeddata', applyFrame);
      } else {
        plane.material.map = c.texture;
        plane.material.needsUpdate = true;
        plane.visible = true;
      }
      v.onerror = function () {
        if (current === key) goto('idle');
      };
      v.loop = c.loop;
      try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }

    function goto(key) {
      var c = clips[key];
      if (!c) return;
      ambientClock = 0;
      if (c.where === 'here') {
        if (pos === 'bed' && !sleeping) applyPose('home', false);
        playClip(key);
        return;
      }
      if (c.where === pos) {
        playClip(key);
        return;
      }
      pending = key;
      fadeDir = -1;
    }

    function shuffle(list) {
      for (var i = list.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
      return list;
    }

    function nextAmbientKey() {
      if (!queue.length) {
        queue = shuffle(ambientPool().slice());
        if (queue[0] === lastAmbient && queue.length > 1) {
          var t = queue[0];
          queue[0] = queue[1];
          queue[1] = t;
        }
      }
      lastAmbient = queue.shift();
      return lastAmbient;
    }

    function nextWorkKey() {
      var work = ['code', 'think', 'busy'];
      return work[Math.floor(Math.random() * work.length)];
    }

    // one clip from the whole action library, loaded on demand
    function playLibraryAmbient() {
      if (!extAmbient.length) return null;
      var e = extAmbient[Math.floor(Math.random() * extAmbient.length)];
      if (!e || !e.id || !e.file) return null;
      if (!clips[e.id]) addUrlClip(e.id, e.file, { where: 'here', next: 'home' });
      goto(e.id);
      return e.id;
    }

    function startAmbient() {
      if (extAmbient.length && Math.random() < 0.6) {
        var picked = playLibraryAmbient();
        if (picked) { actionsAtSpot += 1; return; }
      }
      var key = energy < 0.35 && Math.random() < 0.55 ? 'yawn' : nextAmbientKey();
      if (!isWork(key)) {
        actionsAtSpot += 1;
        if (actionsAtSpot >= moveAfter || key === 'look') moveAfterClip = true;
      }
      goto(key);
    }

    function finishAction() {
      if (workState !== 'idle') {
        goto(workClip());
        return;
      }
      if (moveAfterClip) {
        moveAfterClip = false;
        actionsAtSpot = 0;
        moveAfter = 1 + Math.floor(Math.random() * 8);
        moveToNewHome();
        return;
      }
      goto('idle');
    }

    function moveToNewHome() {
      if (nextHome) home = nextHome();
      pending = 'idle';
      fadeDir = -1;
    }

    if (nextHome) home = nextHome();
    applyPose('home', false);
    if (clips.idle) playClip('idle');

    return {
      root: group,
      baseScale: 1,
      isVideo: true,
      play: function (name) {
        if (name === 'sleep') {
          if (PR.roomlife && !PR.roomlife.canSleep()) {
            try { PR.roomlife.tidyBed(); } catch (e) {}
          }
          stopWorkCycle();
          sleeping = true;
          sleepAt = Date.now();
          sleepClock = 0;
          // If the bed clips exist: scroll the phone for a bit, then doze off.
          if (clips.liePhone && clips.lieSleep) {
            goto('liePhone');
            clearTimeout(windTimer);
            windTimer = setTimeout(function () {
              if (sleeping && current === 'liePhone') goto('lieSleep');
            }, 18000);
          } else {
            goto('sleepStart');
          }
          return;
        }
        if (name === 'wake') {
          if (!sleeping) return;
          sleeping = false;
          sleepClock = 0;
          clearTimeout(windTimer);
          goto('wake');
          return;
        }
        if (name === 'work') {
          goto(nextWorkKey());
          return;
        }
        if (clips[name]) goto(name);
      },
      setWorkState: function (st) {
        if (Date.now() < manualUntil) return;
        if (reading) return;
        // A relaxed cycle of work poses instead of one frozen loop.
        if (st === 'success' || st === 'error') stopWorkCycle();
        if (!st || st === 'idle') stopWorkCycle();
        // Night window (23:00-08:00): asleep is sacred, work waits.
        // Daytime: work wakes her up and she goes to the desk.
        if (sleeping) {
          var h = isNightHour();
          if (h) return;
          workState = st || 'idle';
          working = workState !== 'idle';
          sleeping = false;
          sleepClock = 0;
          goto('wake');
          return;
        }
        st = st || 'idle';
        workState = st;
        working = st !== 'idle';
        if (!working) {
          stopWorkCycle();
          if (isWork(current) || current === 'cheer' || current === 'scared') finishAction();
          return;
        }
        if (st === 'success' || st === 'error') {
          stopWorkCycle();
          goto(workClip());
          return;
        }
        if (!workTimer) startWorkCycle();
      },
      setWorking: function (on) {
        this.setWorkState(on ? 'working' : 'idle');
      },
      // Layout changed (furniture placed / moved / removed): re-seat anchors.
      // If she is at the desk, move her to the new anchor immediately so that
      // "working" never keeps her standing on the old spot.
      setAnchors: function (opts) {
        opts = opts || {};
        if (opts.home) home = { x: opts.home.x, z: opts.home.z, y: opts.home.y || 0 };
        if (opts.bed) bed = { x: opts.bed.x, z: opts.bed.z, y: opts.bed.y || 0 };
        if (opts.desk) desk = { x: opts.desk.x, z: opts.desk.z, y: opts.desk.y || 0 };
        if (pos === 'desk') {
          pending = null;
          fadeDir = 0;
          fade = 1;
          plane.material.opacity = 1;
          applyPose('desk', false);
          if (workState !== 'idle') playClip(workClip());
          else goto('idle');
        } else if (pos === 'bed') {
          applyPose('bed', !!sleeping);
          if (sleeping && clips.sleepLoop) playClip('sleepLoop');
        }
        return true;
      },
      registerClip: function (key, file, opts) {
        addUrlClip(key, file, opts || {});
        return true;
      },
      startRead: function () {
        if (reading) return false;
        sleeping = false;
        reading = true;
        readUntil = Date.now() + 30 * 60 * 1000;  // never read forever
        stopWorkCycle();
        goto('readStart');
        return true;
      },
      stopRead: function () {
        if (!reading) return false;
        reading = false;
        readUntil = 0;
        goto('readEnd');
        return true;
      },
      isReading: function () { return !!reading; },
      setAmbientPool: function (list) {
        extAmbient = Array.isArray(list) ? list.slice() : [];
        return extAmbient.length;
      },
      playRandomLibrary: function () { return playLibraryAmbient(); },
      getClip: function () { return current; },
      isSleeping: function () { return !!sleeping; },
      getPos: function () { return pos; },
      playExtra: function (id) {
        var lib = PR.actionLibrary || [];
        var item = null;
        for (var i = 0; i < lib.length; i++) {
          if (lib[i].id === id) {
            item = lib[i];
            break;
          }
        }
        if (!item) return false;
        manualUntil = Date.now() + 30000;
        sleeping = false;
        workState = 'idle';
        working = false;
        stopWorkCycle();
        // A standing clip must never play on the bed: move back to a floor spot first,
        // except for the lying clips that are meant to run on the bed.
        if (pos === 'bed' && id !== '自制:躺刷手机' && id !== '自制:躺睡觉') applyPose('home', false);
        clearTimeout(windTimer);
        if (!clips[id]) addUrlClip(id, item.file, { where: 'here', next: 'home' });
        goto(id);
        return true;
      },
      nudge: function () {
        if (!sleeping) return false;
        if (!clips['点击回应-傲娇生气']) {
          addUrlClip('点击回应-傲娇生气', '点击回应-傲娇生气.webm', { where: 'bed', next: 'sleepLoop' });
        }
        goto('点击回应-傲娇生气');
        return true;
      },
      restartLife: function () {
        var prev = current;
        manualUntil = 0;
        pending = null;
        fadeDir = 0;
        sleeping = false;
        workState = 'idle';
        working = false;
        moveAfterClip = false;
        actionsAtSpot = 0;
        moveAfter = 1 + Math.floor(Math.random() * 8);
        if (nextHome) home = nextHome();
        applyPose('home', false);
        if (clips.idle) playClip('idle');
        ambientClock = 0;
        startAmbient();
        var guard = 0;
        while (current === prev && guard < 4) {
          var alt = nextAmbientKey();
          goto(alt);
          guard += 1;
        }
      },
      setPace: function (p) {
        paceScale = p === 'quiet' ? 1.7 : p === 'lively' ? 0.55 : 1;
        ambientWait = (12 + Math.random() * 10) * paceScale;
      },
      getEnergy: function () { return energy; },
      getPhase: function () { return phase; },
      command: function (name, x, z) {
        manualUntil = Date.now() + 30000;
        if (name === 'go' && typeof x === 'number') {
          home = { x: x, z: z, y: 0 };
          sleeping = false;
          working = false;
          goto('idle');
          return true;
        }
        if (name === 'stop') {
          sleeping = false;
          working = false;
          goto('idle');
          return true;
        }
        if (name === 'sleep') {
          stopWorkCycle();
          sleeping = true;
          sleepClock = 0;
          goto('sleepStart');
          return true;
        }
        if (name === 'wake') {
          sleeping = false;
          goto('wake');
          return true;
        }
        if (clips[name]) {
          sleeping = false;
          goto(name);
          return true;
        }
        return false;
      },
      face: function () {},
      update: function (dt) {
        var ph = phaseOf(new Date().getHours());
        if (ph !== phase) {
          phase = ph;
          if (ph !== lastPhase) {
            lastPhase = ph;
            queue = [];
          }
        }
        if (fadeDir !== 0) {
          fade += fadeDir * (dt / 0.22);
          if (fade <= 0) {
            fade = 0;
            if (pending) {
              var c = clips[pending];
              applyPose(c.where, c.lying);
              playClip(pending);
              pending = null;
            }
            fadeDir = 1;
          } else if (fade >= 1) {
            fade = 1;
            fadeDir = 0;
          }
          plane.material.opacity = fade;
          blob.material.opacity = fade * 0.9;
        }

        // She sleeps until someone wakes her (click / recall / summon).
        // No auto-wake, and DSH work does not wake her either.

        // A night's sleep is over in the morning; never stay asleep all day.
        if (sleeping && sleepAt && Date.now() - sleepAt > 9 * 60 * 60 * 1000) {
          sleeping = false;
          sleepAt = 0;
          goto('wake');
        }

        if (reading && readUntil && Date.now() > readUntil) {
          reading = false;
          readUntil = 0;
          if (clips.readEnd) goto('readEnd');
        }

        if (!pending && fadeDir === 0 && current === 'idle' && !sleeping && !reading && !working && Date.now() > manualUntil) {
          ambientClock += dt;
          if (ambientClock > ambientWait) {
            ambientClock = 0;
            ambientWait = (8 + Math.random() * 8) * paceScale;
            startAmbient();
          }
        }
      },
    };
  };
})();








