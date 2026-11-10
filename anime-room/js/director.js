/* Purple room - rule-based director: turns room events into short lines.
   Classic script, no dependencies. Mounts window.PR.director.
   Later this can be swapped for a model-backed director without touching callers. */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});

  var started = false;
  var lastAt = Object.create(null);

  var LINES = {
    'work:start': {
      cool: 10 * 60 * 1000,
      lines: ['我陪你。', '开始忙啦？', '我在旁边，不吵你。', '加油。'],
    },
    'work:end': {
      cool: 10 * 60 * 1000,
      lines: ['辛苦啦。', '忙完啦？', '要不要歇一会儿。', '喝口水吧。'],
    },
    'pet:sleep': {
      cool: 30 * 60 * 1000,
      lines: ['困了，先睡啦。', '晚安。', '我先睡一会儿…'],
    },
    'pet:wake': {
      cool: 30 * 60 * 1000,
      lines: ['唔…醒了。', '睡饱啦。', '早…'],
    },
    'time:night': {
      cool: 12 * 60 * 60 * 1000,
      lines: ['天黑了。', '晚上好。', '该开灯了。'],
    },
    'time:day': {
      cool: 12 * 60 * 60 * 1000,
      lines: ['天亮啦。', '早上好。'],
    },
    'weather:rain': {
      cool: 60 * 60 * 1000,
      lines: ['外面下雨了。', '记得带伞。', '雨声还挺好听的。'],
    },
    'weather:snow': {
      cool: 60 * 60 * 1000,
      lines: ['下雪了！', '外面好白。'],
    },
    'weather:thunder': {
      cool: 30 * 60 * 1000,
      lines: ['打雷了…', '有点吓人。'],
    },
    'weather:clear': {
      cool: 2 * 60 * 60 * 1000,
      lines: ['天晴了。', '出太阳啦。'],
    },
  };

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function canFire(key, cool) {
    var now = Date.now();
    if (lastAt[key] && now - lastAt[key] < cool) return false;
    lastAt[key] = now;
    return true;
  }

  function speak(key, text) {
    if (PR.store && PR.store.message) {
      PR.store.message(text, { from: 'her' });
    }
    if (!PR.say) return;
    if (PR.quip) {
      var h = new Date().getHours();
      PR.quip.get(key + '（现在是' + h + '点，' + (isNight() ? '夜里' : '白天') + '）', text)
        .then(function (t) { PR.say(t, 3200); });
      return;
    }
    PR.say(text, 3200);
  }

  function isNight() {
    var h = new Date().getHours();
    return h >= 19 || h < 6;
  }

  function fire(key) {
    var cfg = LINES[key];
    if (!cfg) return false;
    if (!canFire(key, cfg.cool)) return false;
    var text = pick(cfg.lines);
    // clear weather at night must not talk about the sun
    if (key === 'weather:clear' && isNight()) {
      text = pick(['今晚星星很亮。', '云散了，能看到月亮。', '夜里天晴，风有点凉。']);
    }
    speak(key, text);
    return true;
  }

  function start() {
    if (started) return;
    started = true;
    if (!PR.bus) return;

    PR.bus.on('pet:work:start', function () { fire('work:start'); });
    PR.bus.on('pet:work:end', function () { fire('work:end'); });
    PR.bus.on('pet:sleep', function () { fire('pet:sleep'); });
    PR.bus.on('pet:wake', function () { fire('pet:wake'); });

    PR.bus.on('time:phase', function (p) {
      fire(p && p.night ? 'time:night' : 'time:day');
    });

    PR.bus.on('weather:change', function (p) {
      var kind = p && p.kind;
      if (kind === 'rain' || kind === 'overcast') fire('weather:rain');
      else if (kind === 'snow') fire('weather:snow');
      else if (kind === 'thunder') fire('weather:thunder');
      else if (kind === 'clear') fire('weather:clear');
    });
  }

  // For tests / manual kicks.
  function force(key) {
    var cfg = LINES[key];
    if (!cfg) return false;
    speak(key, pick(cfg.lines));
    return true;
  }

  PR.director = { start: start, force: force, lines: LINES };
})();
