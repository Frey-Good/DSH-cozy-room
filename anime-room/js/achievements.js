/* Purple room - achievements (data + rules, classic script).
   Mounts window.PR.achievements. UI lives in the client phone. */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});

  var DEFS = [
    { id: 'firstTouch', name: '初次见面', desc: '第一次摸她' },
    { id: 'slip', name: '被自己的房间绊倒', desc: '踩到脏地滑了一跤' },
    { id: 'firstSleep', name: '睡颜', desc: '看她睡着一次' },
    { id: 'firstReply', name: '悄悄话', desc: '她第一次回你消息' },
    { id: 'work10', name: '工作伙伴', desc: '她陪你工作 10 次' },
    { id: 'weather3', name: '天气收藏', desc: '见过 3 种不同的天气' },
    { id: 'phone10', name: '手机控', desc: '打开手机 10 次' },
    { id: 'nightOwl', name: '夜猫子', desc: '凌晨还在工作，她还醒着' },
    { id: 'days3', name: '三日之约', desc: '连续 3 天打开房间' },
  ];

  function state() {
    return PR.store && PR.store.state ? PR.store.state : null;
  }

  function has(id) {
    var s = state();
    if (!s) return false;
    for (var i = 0; i < s.achievements.length; i++) {
      if (s.achievements[i].id === id) return true;
    }
    return false;
  }

  function post() {
    var items = DEFS.map(function (d) {
      var unlocked = has(d.id);
      return { id: d.id, name: d.name, desc: d.desc, unlocked: unlocked };
    });
    try {
      parent.postMessage({ type: 'cozy-room-achievements', items: items }, '*');
    } catch (err) { /* ignore */ }
  }

  function unlock(id) {
    if (!PR.store || has(id)) return false;
    var s = state();
    s.achievements.push({ id: id, ts: Date.now() });
    PR.store.save();
    var d = null;
    for (var i = 0; i < DEFS.length; i++) if (DEFS[i].id === id) { d = DEFS[i]; break; }
    if (d && PR.say) PR.say('解锁成就「' + d.name + '」', 3200);
    post();
    return true;
  }

  function bump(key, n) {
    if (!PR.store) return 0;
    var s = state();
    s.counters[key] = (s.counters[key] || 0) + (n || 1);
    PR.store.save();
    return s.counters[key];
  }

  function event(name, payload) {
    if (!PR.store) return;
    var s = state();
    if (name === 'touch') {
      bump('touch', 1);
      unlock('firstTouch');
    } else if (name === 'sleep') {
      bump('sleep', 1);
      unlock('firstSleep');
    } else if (name === 'work') {
      var n = bump('work', 1);
      if (n >= 10) unlock('work10');
      var h = new Date().getHours();
      if (h >= 0 && h < 5) unlock('nightOwl');
    } else if (name === 'phoneOpen') {
      var p = bump('phoneOpen', 1);
      if (p >= 10) unlock('phone10');
    } else if (name === 'slip') {
      unlock('slip');
    } else if (name === 'reply') {
      unlock('firstReply');
    } else if (name === 'weather') {
      var kinds = s.flags.weatherKinds || {};
      kinds[payload && payload.kind || 'clear'] = true;
      s.flags.weatherKinds = kinds;
      PR.store.save();
      if (Object.keys(kinds).length >= 3) unlock('weather3');
    } else if (name === 'day') {
      var today = new Date().toDateString();
      if (s.flags.lastDay === today) return;
      var y = new Date(Date.now() - 86400000).toDateString();
      var streak = s.flags.lastDay === y ? (s.flags.dayStreak || 1) + 1 : 1;
      s.flags.lastDay = today;
      s.flags.dayStreak = streak;
      PR.store.save();
      if (streak >= 3) unlock('days3');
    }
  }

  function start() {
    event('day');
    post();
  }

  PR.achievements = {
    defs: DEFS,
    event: event,
    start: start,
    post: post,
    has: has,
  };
})();
