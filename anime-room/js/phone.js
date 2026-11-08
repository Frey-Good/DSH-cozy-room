/* Purple room — WeChat-style phone: home screen + chat app.
   Data comes from PR.store (js/game-state.js); a small fallback store keeps the
   UI usable until that file exists. */
window.PR = window.PR || {};

PR.phone = (function () {
  var KEY = 'cozy-room-game';
  var open = false;
  var built = false;
  var view = 'home'; // 'home' | 'chat'
  var btn, card, homeEl, chatEl, listEl, inputEl, badgeEl, appBadge, backBtn, titleEl, clockEl, clockTimer;

  var REPLIES = [
    '嗯嗯，我在。',
    '好呀～',
    '我记下啦。',
    '你先忙，我陪着你。',
    '这个我等下想想。',
  ];

  function fmtTime(ts) {
    var d = new Date(ts);
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    return hh + ':' + mm;
  }

  // -------------------------------------------------------------- store
  function ensureStore() {
    if (PR.store && PR.store.state) return PR.store;
    var st = null;
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
    if (!st || typeof st !== 'object') st = {};
    if (!Array.isArray(st.messages)) st.messages = [];
    if (typeof st.unread !== 'number') st.unread = 0;
    if (typeof st.lastSeen !== 'number') st.lastSeen = 0;
    if (!st.v) st.v = 1;
    var subs = [];
    PR.store = {
      state: st,
      load: function () { return st; },
      save: function () {
        try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
      },
      patch: function (fn) {
        fn(st);
        PR.store.save();
        subs.forEach(function (f) { f(st); });
      },
      subscribe: function (f) { subs.push(f); },
      message: function (text, opts) {
        var o = opts || {};
        var msg = {
          id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          from: o.from || 'her',
          text: String(text == null ? '' : text),
          ts: Date.now(),
          kind: o.kind || 'text',
          read: false,
        };
        st.messages.push(msg);
        if (st.messages.length > 200) st.messages.splice(0, st.messages.length - 200);
        if (msg.from === 'her' && !open) st.unread += 1;
        PR.store.save();
        subs.forEach(function (f) { f(st); });
        return msg;
      },
      markRead: function () {
        st.unread = 0;
        for (var i = 0; i < st.messages.length; i++) st.messages[i].read = true;
        PR.store.save();
        subs.forEach(function (f) { f(st); });
      },
    };
    return PR.store;
  }

  function store() { return ensureStore(); }

  // -------------------------------------------------------------- UI
  function build() {
    if (built) return;
    built = true;

    btn = document.createElement('button');
    btn.id = 'phone-btn';
    btn.className = 'phone-btn';
    btn.title = '她的手机';
    btn.innerHTML = '📱<span class="phone-badge" id="phone-badge"></span>';
    btn.addEventListener('click', function () { toggle(); });
    document.body.appendChild(btn);
    badgeEl = btn.querySelector('.phone-badge');

    card = document.createElement('div');
    card.id = 'phone-card';
    card.className = 'phone-card hidden';
    card.innerHTML =
      '<div class="phone-head">' +
      '<button class="phone-back hidden" aria-label="返回">‹</button>' +
      '<span class="phone-title" id="phone-title">她</span>' +
      '<button class="phone-close" aria-label="关闭">×</button>' +
      '</div>' +
      '<div class="phone-home" id="phone-home">' +
      '<div class="phone-home-clock" id="phone-home-clock">--:--</div>' +
      '<div class="phone-apps">' +
      '<button class="phone-app" data-app="chat">' +
      '<span class="app-icon">💬</span><span class="app-name">聊天</span>' +
      '<b class="app-badge" id="phone-app-badge"></b></button>' +
      '<button class="phone-app disabled"><span class="app-icon">🖼</span><span class="app-name">相册</span></button>' +
      '<button class="phone-app disabled"><span class="app-icon">🌱</span><span class="app-name">菜地</span></button>' +
      '<button class="phone-app disabled"><span class="app-icon">✈️</span><span class="app-name">旅行</span></button>' +
      '</div>' +
      '<div class="phone-home-hint">更多 App 还在路上</div>' +
      '</div>' +
      '<div class="phone-chat hidden" id="phone-chat">' +
      '<div class="phone-list" id="phone-list"></div>' +
      '<div class="phone-foot">' +
      '<input id="phone-input" type="text" placeholder="发消息…" maxlength="120">' +
      '<button id="phone-send" class="phone-send">发送</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(card);

    homeEl = card.querySelector('#phone-home');
    chatEl = card.querySelector('#phone-chat');
    listEl = card.querySelector('#phone-list');
    inputEl = card.querySelector('#phone-input');
    titleEl = card.querySelector('#phone-title');
    backBtn = card.querySelector('.phone-back');
    clockEl = card.querySelector('#phone-home-clock');
    appBadge = card.querySelector('#phone-app-badge');

    card.querySelector('.phone-close').addEventListener('click', function () { close(); });
    backBtn.addEventListener('click', function () { showHome(); });
    card.querySelector('[data-app="chat"]').addEventListener('click', function () { showChat(); });
    card.querySelector('#phone-send').addEventListener('click', function () { send(); });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });

    clockTimer = setInterval(updateClock, 30 * 1000);
    updateClock();
    store().subscribe(function () { render(); });
    render();
  }

  function updateClock() {
    if (!clockEl) return;
    var d = new Date();
    clockEl.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function render() {
    if (!listEl) return;
    var st = store().state;
    var msgs = (st.messages || []).slice(-60);
    listEl.innerHTML = '';
    if (!msgs.length) {
      var empty = document.createElement('div');
      empty.className = 'phone-empty';
      empty.textContent = '还没有消息。她大概在房间里发呆。';
      listEl.appendChild(empty);
    }
    var lastTs = 0;
    msgs.forEach(function (m) {
      if (!lastTs || m.ts - lastTs > 5 * 60 * 1000) {
        var t = document.createElement('div');
        t.className = 'phone-time';
        t.textContent = fmtTime(m.ts);
        listEl.appendChild(t);
      }
      lastTs = m.ts;
      var row = document.createElement('div');
      row.className = 'phone-row ' + (m.from === 'me' ? 'me' : 'her');
      if (m.from !== 'me') {
        var av = document.createElement('div');
        av.className = 'phone-avatar';
        av.textContent = '蓝';
        row.appendChild(av);
      }
      var bubble = document.createElement('div');
      bubble.className = 'phone-bubble';
      if (m.kind === 'photo' && m.text) {
        var img = document.createElement('img');
        img.src = m.text;
        img.alt = '';
        bubble.appendChild(img);
      } else {
        bubble.textContent = m.text;
      }
      row.appendChild(bubble);
      listEl.appendChild(row);
    });
    listEl.scrollTop = listEl.scrollHeight;
    var n = st.unread || 0;
    var label = n ? (n > 99 ? '99+' : String(n)) : '';
    [badgeEl, appBadge].forEach(function (el) {
      if (!el) return;
      el.textContent = label;
      el.classList.toggle('on', n > 0);
    });
  }

  function showHome() {
    view = 'home';
    homeEl.classList.remove('hidden');
    chatEl.classList.add('hidden');
    backBtn.classList.add('hidden');
    titleEl.textContent = '她';
    updateClock();
  }

  function showChat() {
    view = 'chat';
    homeEl.classList.add('hidden');
    chatEl.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    titleEl.textContent = '她';
    store().markRead();
    render();
    setTimeout(function () { if (inputEl) inputEl.focus(); }, 120);
  }

  function toggle() { if (open) close(); else openPhone(); }

  function openPhone() {
    build();
    open = true;
    card.classList.remove('hidden');
    btn.classList.add('open');
    showHome();
    render();
    if (PR.bus) PR.bus.emit('phone:open', {});
  }

  function close() {
    if (!open) return;
    open = false;
    card.classList.add('hidden');
    btn.classList.remove('open');
    if (PR.bus) PR.bus.emit('phone:close', {});
  }

  function send() {
    var text = (inputEl.value || '').trim();
    if (!text) return;
    inputEl.value = '';
    store().message(text, { from: 'me' });
    setTimeout(function () {
      store().message(REPLIES[Math.floor(Math.random() * REPLIES.length)], { from: 'her' });
    }, 900 + Math.random() * 900);
  }

  function message(text, opts) {
    build();
    var m = store().message(text, opts || { from: 'her' });
    render();
    return m;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  return {
    open: openPhone,
    close: close,
    toggle: toggle,
    message: message,
    showHome: showHome,
    showChat: showChat,
    get isOpen() { return open; },
    get view() { return view; },
  };
})();
