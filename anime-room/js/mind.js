/* Purple room - commands & rebellion.
   Parses simple orders ("去睡觉", "打扫一下"), can refuse based on rebellion/closeness.
   Mounts window.PR.mind. */
window.PR = window.PR || {};

PR.mind = (function () {
  'use strict';
  var rebellion = 12;   // 0-100, hidden
  var closeness = 50;   // 0-100, hidden
  var lastCommand = 0;
  var handlers = {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hour() { return new Date().getHours(); }
  function night() { var h = hour(); return h >= 23 || h < 8; }

  function setHandlers(h) { handlers = h || {}; }

  var COMMANDS = [
    { kind: 'sleep', re: /(去睡|睡觉|睡吧|休息吧|该睡了)/, line: '好，我去睡了。', refuse: ['还不想睡…', '再等一下嘛。', '我现在不困。'] },
    { kind: 'clean', re: /(打扫|收拾|清理|擦一下|扫地)/, line: '好，我收拾一下。', refuse: ['等会儿再弄…', '现在不想动。', '我刚坐下。'] },
    { kind: 'read', re: /(看书|读书|阅读|看会儿书)/, line: '好，我看会儿书。', refuse: ['等我看完这页。', '现在不想看。'] },
    { kind: 'water', re: /(浇花|浇水|花渴了)/, line: '好，我去浇水。', refuse: ['等下再浇。', '它还没蔫呢。'] },
    { kind: 'feed', re: /(喂猫|猫饿了|给猫吃)/, line: '好，我去喂猫。', refuse: ['猫刚吃过。', '等会儿喂。'] },
    { kind: 'tidy', re: /(铺床|整理床|床单)/, line: '好，我铺一下床。', refuse: ['床还没乱。', '晚点再说。'] },
  ];

  function parse(text) {
    var t = String(text || '');
    for (var i = 0; i < COMMANDS.length; i++) {
      if (COMMANDS[i].re.test(t)) return COMMANDS[i];
    }
    return null;
  }

  function refuseChance(kind) {
    var p = 0.06 + rebellion / 220 - closeness / 600;
    if (night() && kind === 'sleep') p += 0.12;
    if (kind === 'clean' && night()) p += 0.1;
    return clamp(p, 0.02, 0.85);
  }

  function handle(text) {
    var raw = String(text || '');
    // rename: “你以后叫大肥鱼吧” / “你就叫阿蓝”
    var rn = /你(?:以后|就)?叫(?:做)?([\u4e00-\u9fa5A-Za-z0-9]{1,8})(?:吧|好不好|行吗)?$/.exec(raw.trim());
    if (rn && !/什么|啥|谁/.test(raw)) {
      try {
        fetch('/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: rn[1] }),
        }).catch(function () {});
      } catch (e) {}
      if (PR.memory) PR.memory.add('chat', 'ta 给我起名叫「' + rn[1] + '」，我答应了', 8, ['名字']);
      closeness = clamp(closeness + 3, 0, 100);
      return { kind: 'rename', refused: false, line: '好，以后我就叫' + rn[1] + '。' };
    }
    var cmd = parse(text);
    if (!cmd) return null;
    var now = Date.now();
    // repeated orders in a short window annoy her
    if (now - lastCommand < 60000) rebellion = clamp(rebellion + 8, 0, 100);
    lastCommand = now;

    var refuse = Math.random() < refuseChance(cmd.kind);
    if (refuse) {
      rebellion = clamp(rebellion + 10, 0, 100);
      closeness = clamp(closeness - 1, 0, 100);
      var line = cmd.refuse[Math.floor(Math.random() * cmd.refuse.length)];
      if (PR.memory) PR.memory.add('chat', 'ta 让我' + cmd.kind + '，我拒绝了', 6, ['命令', '拒绝']);
      return { kind: cmd.kind, refused: true, line: line };
    }

    // nothing to do? say so instead of pretending
    try {
      var room = PR.store && PR.store.state && PR.store.state.room;
      if (cmd.kind === 'clean') {
        var dirty = (PR.roomlife && PR.roomlife.dirtyList) ? PR.roomlife.dirtyList().filter(function (x) { return x.kind === 'floor' || x.kind === 'item'; }) : [];
        if (!dirty.length) return { kind: 'clean', refused: false, line: '现在挺干净的，不用扫。' };
      }
      if (cmd.kind === 'water') {
        var plants = (room && room.plants) || [];
        if (plants.length && plants.every(function (p) { return p.water >= 2; })) return { kind: 'water', refused: false, line: '花还精神着呢。' };
      }
      if (cmd.kind === 'feed') {
        var fed = room && room.cat && room.cat.fedAt ? (Date.now() - room.cat.fedAt) : 1e12;
        if (fed < 6 * 3600 * 1000) return { kind: 'feed', refused: false, line: '猫刚吃过。' };
      }
      if (cmd.kind === 'tidy') {
        var tidy = room && room.bed && room.bed.tidyAt ? (Date.now() - room.bed.tidyAt) : 1e12;
        if (tidy < 4 * 86400000) return { kind: 'tidy', refused: false, line: '床还没乱。' };
      }
    } catch (e) {}

    rebellion = clamp(rebellion + 6, 0, 100);
    closeness = clamp(closeness + 2, 0, 100);
    if (handlers[cmd.kind]) {
      try { handlers[cmd.kind](); } catch (e) {}
    }
    if (PR.memory) PR.memory.add('chat', 'ta 让我' + cmd.kind + '，我照做了', 5, ['命令']);
    return { kind: cmd.kind, refused: false, line: cmd.line };
  }

  function tick() {
    var now = Date.now();
    if (now - lastCommand > 600000) rebellion = clamp(rebellion - 1, 0, 100);
    if (now - lastCommand > 1800000) rebellion = clamp(rebellion - 2, 0, 100);
  }
  setInterval(tick, 60000);

  return {
    handle: handle,
    setHandlers: setHandlers,
    state: function () { return { rebellion: rebellion, closeness: closeness }; },
    _set: function (r, c) { rebellion = clamp(r, 0, 100); closeness = clamp(c == null ? closeness : c, 0, 100); },
  };
})();
