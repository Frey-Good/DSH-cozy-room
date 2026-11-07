;(() => {
  window.__ModuleLoader__.load({
    id: 'dsh-cozy-room',
    factory: (require) => {
      const inject = [];
      const KEY = 'cozy-room-settings';
      const OUT_KEY = 'cozy-room-out';
      // Weather keys and timings are frozen by docs/weather-contract.md.
      const GEO_KEY = 'cozy-room-geo';
      const WEATHER_CACHE_KEY = 'cozy-room-weather-cache';
      const WEATHER_REFRESH_MS = 20 * 60 * 1000;
      const WEATHER_TIMEOUT_MS = 8000;
      let BASE = 'http://127.0.0.1:8140';
      const BUILD_ID = 'dsh-cozy-room:1.1.0';
      let roomOrigin = '';
      const DEFAULTS = {
        followWork: true,
        nightSleep: true,
        wander: true,
        catRoam: true,
        parallax: true,
        pace: 'normal',
        scale: 1,
        fx: 'stars',
        timeSync: true,
        weatherSync: false,
        city: '沈阳',
      };
      const CLIPS = {
        idle: '待机呼吸休闲.webm',
        wave: '点击回应-元气挥手.webm',
        cheer: '点击回应-开心跃动.webm',
        sleep: '睡觉-循环.webm',
        code: '写代码.webm',
        think: '工作状态-思考冒泡.webm',
        surprised: '点击回应-害羞惊讶.webm',
      };

      function apply() {
        if (document.getElementById('dsh-cozy-room-bg')) return;

        let settings = Object.assign({}, DEFAULTS);
        try {
          Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
        } catch (error) {}

        let out = false;
        try {
          out = localStorage.getItem(OUT_KEY) === '1';
        } catch (error) {}
        let roomSleeping = false;
        let roomClip = '';
        let wakeClicks = 0;
        let wakeNeed = 3 + Math.floor(Math.random() * 3);

        // Weather data-layer state. This layer only fetches, caches and posts;
        // the room owns the HUD, sky, light and particles.
        let weatherCurrent = null;
        let weatherTimer = null;
        let weatherSeq = 0;
        let weatherKey = '';
        let weatherInFlight = false;
        let weatherNextAt = 0;
        let timeSyncBox = null;
        let cityRow = null;
        let cityInput = null;
        let cityDebounce = null;

        const frame = document.createElement('iframe');
        frame.id = 'dsh-cozy-room-bg';
        frame.setAttribute('allowtransparency', 'true');
        Object.assign(frame.style, {
          position: 'fixed',
          inset: '0',
          width: '100vw',
          height: '100vh',
          border: '0',
          zIndex: '-1',
          pointerEvents: 'none',
          background: 'transparent',
          transition: 'opacity .25s ease',
        });
        document.body.appendChild(frame);

        async function discoverBase() {
          const ports = [];
          for (let i = 0; i < 21; i += 1) ports.push(8139 + i);
          const checks = ports.map(async (port) => {
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 700);
              const res = await fetch('http://127.0.0.1:' + port + '/health.json', { signal: ctrl.signal, cache: 'no-store' });
              clearTimeout(timer);
              if (!res.ok) return null;
              const data = await res.json();
              return data && data.app === 'dsh-cozy-room' && data.build === BUILD_ID ? port : null;
            } catch (error) {
              return null;
            }
          });
          const found = (await Promise.all(checks)).filter(function (p) { return p !== null; });
          return found.length ? found[0] : 8140;
        }

        (async function () {
          try {
            const port = await discoverBase();
            BASE = 'http://127.0.0.1:' + port;
            roomOrigin = BASE;
            frame.src = BASE + '/?embed=1';
          } catch (error) {
            roomOrigin = BASE;
            frame.src = BASE + '/?embed=1';
          }
        })();

        window.addEventListener('pointermove', function (event) {
          try {
            frame.contentWindow.postMessage(
              {
                type: 'cozy-room-pointer',
                x: (event.clientX / window.innerWidth) * 2 - 1,
                y: -((event.clientY / window.innerHeight) * 2 - 1),
              },
              '*'
            );
          } catch (error) {}
        }, { passive: true });

        function postSettings() {
          try {
            frame.contentWindow.postMessage({ type: 'cozy-room-settings', settings }, '*');
          } catch (error) {}
        }
        function postPresence(present) {
          try {
            frame.contentWindow.postMessage({ type: 'cozy-room-presence', present }, roomOrigin || '*');
          } catch (error) {}
        }
        frame.addEventListener('load', function () {
          postSettings();
          postPresence(!out);
          // The room may still be building its character when the first presence
          // arrives; re-send briefly so a recall during load cannot leave two of her.
          [400, 1200, 2500].forEach(function (ms) {
            setTimeout(function () { postPresence(!out); }, ms);
          });
          // Push the last known weather as soon as the room can listen. With the
          // feature off this is the single `{ weather: null }` that hides the HUD.
          const city = String(settings.city || '').trim();
          const enabled = !!settings.weatherSync && !!city;
          postWeather(enabled ? (cachedFor(city) || weatherCurrent) : null);
          if (enabled) {
            // Re-post once in case the room was still booting on the first message.
            setTimeout(function () { if (weatherCurrent) postWeather(weatherCurrent); }, 1200);
          }
          try {
            frame.contentWindow.postMessage({ type: 'cozy-room-library-request' }, '*');
          } catch (error) {}
        });

        function save() {
          try {
            localStorage.setItem(KEY, JSON.stringify(settings));
          } catch (error) {}
        }

        // ------------------------------------------------------------- weather data
        // Contract: docs/weather-contract.md. Only the city name (geocoding) and
        // its lat/lon (forecast) ever leave the machine. Every failure is silent.
        function readCache(key) {
          try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          } catch (error) { return null; }
        }
        function writeCache(key, value) {
          try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
        }
        async function fetchJSON(url) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), WEATHER_TIMEOUT_MS);
          try {
            const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            return data && typeof data === 'object' ? data : null;
          } catch (error) {
            return null;
          } finally {
            clearTimeout(timer);
          }
        }

        async function geocode(city) {
          const cache = readCache(GEO_KEY) || {};
          const hit = cache[city];
          if (hit && isFinite(hit.latitude) && isFinite(hit.longitude)) {
            return { latitude: Number(hit.latitude), longitude: Number(hit.longitude), cached: true };
          }
          const data = await fetchJSON(
            'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh'
          );
          const first = data && Array.isArray(data.results) ? data.results[0] : null;
          if (!first || !isFinite(first.latitude) || !isFinite(first.longitude)) return null;
          const geo = { latitude: Number(first.latitude), longitude: Number(first.longitude) };
          cache[city] = { latitude: geo.latitude, longitude: geo.longitude, ts: Date.now() };
          const keys = Object.keys(cache);
          if (keys.length > 24) delete cache[keys[0]];
          writeCache(GEO_KEY, cache);
          return { latitude: geo.latitude, longitude: geo.longitude, cached: false };
        }

        function hhmm(iso) {
          return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)
            ? iso.slice(11, 16)
            : undefined;
        }

        async function fetchWeather(city) {
          const geo = await geocode(city);
          if (!geo) return null;
          const qs = 'latitude=' + encodeURIComponent(geo.latitude)
            + '&longitude=' + encodeURIComponent(geo.longitude)
            + '&current=temperature_2m,weather_code,is_day'
            + '&daily=sunrise,sunset&timezone=auto';
          const data = await fetchJSON('https://api.open-meteo.com/v1/forecast?' + qs);
          const cur = data && data.current;
          if (!cur) return null;
          const code = Number(cur.weather_code);
          const temp = Number(cur.temperature_2m);
          if (!isFinite(code) || !isFinite(temp)) return null;
          const weather = { city: city, code: code, temp: temp, ts: Date.now() };
          const day = Number(cur.is_day);
          if (day === 0 || day === 1) weather.isDay = day;
          const sunrise = hhmm(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
          const sunset = hhmm(data.daily && data.daily.sunset && data.daily.sunset[0]);
          if (sunrise) weather.sunrise = sunrise;
          if (sunset) weather.sunset = sunset;
          return weather;
        }

        function readWeatherCache() {
          const w = readCache(WEATHER_CACHE_KEY);
          if (!w || typeof w !== 'object' || typeof w.city !== 'string'
            || !isFinite(w.code) || !isFinite(w.temp)) return null;
          return w;
        }
        function cachedFor(city) {
          const w = readWeatherCache();
          return w && w.city === city ? w : null;
        }

        function postWeather(weather) {
          try {
            frame.contentWindow.postMessage(
              { type: 'cozy-room-weather', weather: weather || null },
              roomOrigin || '*'
            );
          } catch (error) {}
        }

        function scheduleWeather() {
          if (weatherTimer) { clearTimeout(weatherTimer); weatherTimer = null; }
          weatherNextAt = 0;
          if (!settings.weatherSync || !String(settings.city || '').trim()) return;
          weatherNextAt = Date.now() + WEATHER_REFRESH_MS;
          weatherTimer = setTimeout(function () { refreshWeather('timer'); }, WEATHER_REFRESH_MS);
        }

        async function refreshWeather(reason) {
          const city = String(settings.city || '').trim();
          const enabled = !!settings.weatherSync && !!city;
          weatherSeq += 1;
          const seq = weatherSeq;
          scheduleWeather();
          if (!enabled) {
            weatherInFlight = false;
            weatherCurrent = null;
            postWeather(null);
            return { ok: false, reason: 'off' };
          }
          weatherInFlight = true;
          const fresh = await fetchWeather(city);
          weatherInFlight = false;
          // A newer settings change invalidates this in-flight result.
          if (seq !== weatherSeq) return { ok: false, reason: 'stale' };
          if (fresh) {
            weatherCurrent = fresh;
            writeCache(WEATHER_CACHE_KEY, fresh);
          } else {
            // Offline / timeout / non-200: last result if any, otherwise null.
            weatherCurrent = readWeatherCache();
          }
          postWeather(weatherCurrent);
          return { ok: !!fresh, fromCache: !fresh, reason: reason };
        }

        function weatherSettingsKey() {
          return (settings.weatherSync ? '1' : '0') + '|' + String(settings.city || '').trim();
        }
        function onWeatherSettingsChange() {
          const key = weatherSettingsKey();
          if (key === weatherKey) return;
          weatherKey = key;
          refreshWeather('settings');
        }
        function commitCity(value) {
          const next = String(value || '').trim();
          if (next === String(settings.city || '')) return;
          settings.city = next;
          save();
          postSettings();
          onWeatherSettingsChange();
        }

        // --------------------------------------------------------- action library
        let library = [];
        let libModal = null;
        let libActive = '全部';
        let libVideo = null;
        let libGrid = null;
        let libCats = null;

        window.addEventListener('message', function (event) {
          if (!roomOrigin || event.origin !== roomOrigin) return;
          if (!event.data) return;
          if (event.data.type === 'cozy-room-settings') {
            // The room turns timeSync off when the user presses ☾/☀ manually.
            // Mirror that authoritative value back into the settings panel.
            const incoming = event.data.settings || {};
            if (typeof incoming.timeSync === 'boolean' && incoming.timeSync !== settings.timeSync) {
              settings.timeSync = incoming.timeSync;
              save();
              if (timeSyncBox) timeSyncBox.checked = settings.timeSync;
            }
            return;
          }
          if (event.data.type === 'cozy-room-pet-state') {
            const s = !!event.data.sleeping;
            if (s && !roomSleeping) {
              wakeClicks = 0;
              wakeNeed = 3 + Math.floor(Math.random() * 3);
            }
            roomSleeping = s;
            if (event.data.clip) roomClip = event.data.clip;
            if (!out) {
              recall.textContent = roomSleeping ? '💤' : '🐾';
              recall.title = roomSleeping ? '她在睡觉，多点几下' : '把她召到桌面';
            }
            return;
          }
          if (event.data.type !== 'cozy-room-library') return;
          library = Array.isArray(event.data.items) ? event.data.items : [];
          if (libModal && libModal.style.display !== 'none') renderLibrary();
        });

        // ------------------------------------------------------------- buttons
        const ui = document.createElement('div');
        ui.id = 'dsh-cozy-room-ui';
        Object.assign(ui.style, {
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          zIndex: '2147483000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px',
        });
        document.body.appendChild(ui);

        const panel = document.createElement('div');
        panel.id = 'dsh-cozy-room-panel';
        Object.assign(panel.style, {
          display: 'none',
          width: '252px',
          padding: '12px 14px 10px',
          borderRadius: '16px',
          background: 'rgba(18,22,30,.86)',
          color: '#e9edf5',
          font: '12px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif',
          boxShadow: '0 12px 34px rgba(0,0,0,.38)',
          border: '1px solid rgba(255,255,255,.12)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        });
        ui.appendChild(panel);

        const head = document.createElement('div');
        Object.assign(head.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
        });
        const title = document.createElement('span');
        title.textContent = '小蓝的设置';
        Object.assign(title.style, { fontSize: '13px', fontWeight: '600', letterSpacing: '.02em' });
        const close = document.createElement('span');
        close.textContent = '✕';
        Object.assign(close.style, { cursor: 'pointer', opacity: '.65', padding: '2px 4px' });
        close.addEventListener('click', () => { panel.style.display = 'none'; });
        head.appendChild(title);
        head.appendChild(close);
        panel.appendChild(head);

        function toggleRow(label, key, afterChange) {
          const row = document.createElement('label');
          Object.assign(row.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 0',
            cursor: 'pointer',
            borderTop: '1px solid rgba(255,255,255,.07)',
          });
          const span = document.createElement('span');
          span.textContent = label;
          span.style.opacity = '.92';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = !!settings[key];
          box.style.accentColor = '#7fb6e0';
          box.style.cursor = 'pointer';
          box.addEventListener('change', () => {
            settings[key] = box.checked;
            save();
            postSettings();
            if (afterChange) afterChange(box.checked);
          });
          row.appendChild(span);
          row.appendChild(box);
          panel.appendChild(row);
          return box;
        }

        // --- time / weather settings (docs/weather-contract.md §2) ---
        timeSyncBox = toggleRow('时间同步', 'timeSync');
        const weatherSyncBox = toggleRow('天气同步', 'weatherSync', function (on) {
          if (cityRow) cityRow.style.display = on ? 'flex' : 'none';
          onWeatherSettingsChange();
        });

        cityRow = document.createElement('label');
        Object.assign(cityRow.style, {
          display: settings.weatherSync ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '5px 0',
          borderTop: '1px solid rgba(255,255,255,.07)',
        });
        const cityText = document.createElement('span');
        cityText.textContent = '城市';
        cityText.style.opacity = '.92';
        cityInput = document.createElement('input');
        cityInput.type = 'text';
        cityInput.value = String(settings.city === undefined ? '沈阳' : settings.city);
        cityInput.placeholder = '例如：沈阳';
        cityInput.setAttribute('aria-label', '城市');
        Object.assign(cityInput.style, {
          width: '110px',
          background: 'rgba(255,255,255,.08)',
          color: '#e9edf5',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: '8px',
          padding: '3px 7px',
          fontSize: '12px',
          outline: 'none',
        });
        cityInput.addEventListener('input', function () {
          if (cityDebounce) clearTimeout(cityDebounce);
          cityDebounce = setTimeout(function () { commitCity(cityInput.value); }, 700);
        });
        cityInput.addEventListener('change', function () {
          if (cityDebounce) clearTimeout(cityDebounce);
          commitCity(cityInput.value);
        });
        cityRow.appendChild(cityText);
        cityRow.appendChild(cityInput);
        panel.appendChild(cityRow);

        toggleRow('跟着我工作', 'followWork');
        toggleRow('夜里会睡觉', 'nightSleep');
        toggleRow('在房间里走动', 'wander');
        toggleRow('猫会走动', 'catRoam');
        toggleRow('鼠标带动房间', 'parallax');

        const paceRow = document.createElement('label');
        Object.assign(paceRow.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          borderTop: '1px solid rgba(255,255,255,.07)',
        });
        const paceText = document.createElement('span');
        paceText.textContent = '活动频率';
        paceText.style.opacity = '.92';
        const paceSel = document.createElement('select');
        ['quiet', 'normal', 'lively'].forEach((v) => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v === 'quiet' ? '安静' : v === 'normal' ? '正常' : '活泼';
          if (settings.pace === v) opt.selected = true;
          paceSel.appendChild(opt);
        });
        Object.assign(paceSel.style, {
          background: 'rgba(255,255,255,.08)',
          color: '#e9edf5',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: '8px',
          padding: '3px 6px',
          fontSize: '12px',
          cursor: 'pointer',
        });
        paceSel.addEventListener('change', () => {
          settings.pace = paceSel.value;
          save();
          postSettings();
        });
        paceRow.appendChild(paceText);
        paceRow.appendChild(paceSel);
        panel.appendChild(paceRow);

        const sizeRow = document.createElement('label');
        Object.assign(sizeRow.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '6px 0 2px',
          borderTop: '1px solid rgba(255,255,255,.07)',
        });
        const sizeText = document.createElement('span');
        sizeText.textContent = '大小';
        sizeText.style.opacity = '.92';
        const size = document.createElement('input');
        size.type = 'range';
        size.min = '0.75';
        size.max = '1.35';
        size.step = '0.05';
        size.value = String(settings.scale);
        size.style.flex = '1';
        size.style.accentColor = '#7fb6e0';
        size.addEventListener('input', () => {
          settings.scale = Number(size.value);
          save();
          postSettings();
        });
        sizeRow.appendChild(sizeText);
        sizeRow.appendChild(size);
        panel.appendChild(sizeRow);

        const fxRow = document.createElement('label');
        Object.assign(fxRow.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          borderTop: '1px solid rgba(255,255,255,.07)',
        });
        const fxText = document.createElement('span');
        fxText.textContent = '召唤特效';
        fxText.style.opacity = '.92';
        const fxSel = document.createElement('select');
        [['stars', '星光'], ['hearts', '爱心'], ['bubbles', '泡泡'], ['ring', '光环'], ['none', '无']].forEach((pair) => {
          const opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          if ((settings.fx || 'stars') === pair[0]) opt.selected = true;
          fxSel.appendChild(opt);
        });
        Object.assign(fxSel.style, {
          background: 'rgba(255,255,255,.08)',
          color: '#e9edf5',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: '8px',
          padding: '3px 6px',
          fontSize: '12px',
          cursor: 'pointer',
        });
        fxSel.addEventListener('change', () => {
          settings.fx = fxSel.value;
          save();
        });
        fxRow.appendChild(fxText);
        fxRow.appendChild(fxSel);
        panel.appendChild(fxRow);

        const libBtn = document.createElement('div');
        libBtn.textContent = '🎬 打开动作库';
        Object.assign(libBtn.style, {
          marginTop: '8px',
          padding: '7px 10px',
          borderRadius: '10px',
          textAlign: 'center',
          fontSize: '12px',
          cursor: 'pointer',
          background: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.14)',
        });
        libBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          openLibrary();
        });
        panel.appendChild(libBtn);

        const hint = document.createElement('div');
        hint.textContent = '改动会立刻生效，并记在这台机器上。';
        Object.assign(hint.style, { marginTop: '8px', opacity: '.5', fontSize: '11px' });
        panel.appendChild(hint);

        function roundButton(text, titleText) {
          const b = document.createElement('div');
          b.textContent = text;
          b.title = titleText;
          Object.assign(b.style, {
            width: '42px',
            height: '42px',
            borderRadius: '21px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '19px',
            cursor: 'pointer',
            zIndex: '2147483000',
            background: 'rgba(20,24,32,.55)',
            border: '1px solid rgba(255,255,255,.18)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            userSelect: 'none',
            transition: 'background .2s ease, transform .15s ease',
          });
          return b;
        }

        // ------------------------------------------------------------- pet card
        let petWrap = null;
        let petVideo = null;
        let petState = 'idle';

        const PET_W = 160;
        const PET_H = 180;

        // Every recall anchors the card above the chat input, not at the last
        // dragged spot: right edge aligned to the input's right edge minus 24px,
        // bottom edge 12px above the input's top edge.
        function visibleInputBox(el) {
          const r = el.getBoundingClientRect();
          if (r.width < 120 || r.height < 18 || r.height > 280) return null;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return null;
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        }

        function findChatInput() {
          const groups = [
            { sel: 'textarea', kind: 'textarea' },
            { sel: '[contenteditable="true"]', kind: 'contenteditable' },
          ];
          for (let g = 0; g < groups.length; g += 1) {
            const nodes = document.querySelectorAll(groups[g].sel);
            let best = null;
            for (let i = 0; i < nodes.length; i += 1) {
              const rect = visibleInputBox(nodes[i]);
              if (!rect) continue;
              // chat input sits lowest on screen; prefer the widest on a tie
              if (!best || rect.bottom > best.rect.bottom || (rect.bottom === best.rect.bottom && rect.width > best.rect.width)) {
                best = { rect, kind: groups[g].kind };
              }
            }
            if (best) return best;
          }
          return null;
        }

        function placeCardAtAnchor() {
          if (!petWrap) return null;
          const input = findChatInput();
          let left;
          let top;
          if (input) {
            left = input.rect.right - PET_W - 24;
            top = input.rect.top - PET_H - 12;
          } else {
            left = window.innerWidth - PET_W - 24;
            top = Math.round(window.innerHeight * 0.33) - PET_H;
          }
          left = Math.max(12, Math.min(window.innerWidth - PET_W - 12, left));
          top = Math.max(12, Math.min(window.innerHeight - PET_H - 12, top));
          petWrap.style.left = Math.round(left) + 'px';
          petWrap.style.top = Math.round(top) + 'px';
          return input ? input.kind : 'fallback';
        }

        function isNight() {
          const h = new Date().getHours();
          return h >= 23 || h < 7;
        }
        function clipUrl(name) {
          return BASE + '/assets/webm/' + encodeURIComponent(CLIPS[name]);
        }
        function playPet(name, loop) {
          if (!petVideo || !CLIPS[name]) return;
          petState = name;
          petVideo.loop = !!loop;
          petVideo.src = clipUrl(name);
          const p = petVideo.play();
          if (p && p.catch) p.catch(function () {});
        }
        function petIdle() {
          // While she is out on the desktop she stays awake; if nobody plays with
          // her for a while she walks back into the room (see resetAutoReturn).
          playPet('idle', true);
        }

        // Auto-return: 1–5 minutes without interaction and she goes home.
        const AUTO_RETURN = [60000, 300000];
        let autoReturnTimer = 0;
        function autoReturnRange() {
          const o = window.__COZY_AUTO_RETURN;
          if (Array.isArray(o) && o.length === 2) return o;
          return AUTO_RETURN;
        }
        function clearAutoReturn() {
          if (autoReturnTimer) clearTimeout(autoReturnTimer);
          autoReturnTimer = 0;
        }
        function resetAutoReturn() {
          if (!out) return;
          clearAutoReturn();
          const r = autoReturnRange();
          const ms = r[0] + Math.random() * (r[1] - r[0]);
          autoReturnTimer = setTimeout(function () {
            autoReturnTimer = 0;
            if (out) setOut(false);
          }, ms);
        }

        function buildPet() {
          if (petWrap) return;
          const W = 160;
          const H = 180;
          petWrap = document.createElement('div');
          petWrap.id = 'dsh-cozy-pet';
          Object.assign(petWrap.style, {
            position: 'fixed',
            width: W + 'px',
            height: H + 'px',
            overflow: 'hidden',
            zIndex: '2147482500',
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none',
            display: 'none',
          });

          // Real position comes from placeCardAtAnchor() on every recall; a drag
          // only moves the card for the current appearance.
          petWrap.style.left = '0px';
          petWrap.style.top = '0px';

          const shadow = document.createElement('div');
          Object.assign(shadow.style, {
            position: 'absolute',
            left: '50%',
            bottom: '2px',
            width: '96px',
            height: '22px',
            transform: 'translateX(-50%)',
            background: 'radial-gradient(ellipse, rgba(40,30,45,.38), rgba(40,30,45,0) 70%)',
            pointerEvents: 'none',
            zIndex: '1',
          });
          petWrap.appendChild(shadow);

          petVideo = document.createElement('video');
          petVideo.id = 'dsh-cozy-pet-video';
          petVideo.muted = true;
          petVideo.autoplay = true;
          petVideo.playsInline = true;
          Object.assign(petVideo.style, {
            position: 'absolute',
            left: '-103px',
            top: '-16px',
            width: '366px',
            height: '206px',
            pointerEvents: 'none',
            background: 'transparent',
            zIndex: '2',
          });
          petVideo.addEventListener('ended', function () {
            petIdle();
          });
          petWrap.appendChild(petVideo);

          const bar = document.createElement('div');
          Object.assign(bar.style, {
            position: 'absolute',
            left: '50%',
            top: '-32px',
            transform: 'translateX(-50%)',
            display: 'none',
            gap: '4px',
            zIndex: '3',
          });
          bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          const mk = (text, titleText, fn) => {
            const b = document.createElement('span');
            b.textContent = text;
            b.title = titleText;
            Object.assign(b.style, {
              width: '26px',
              height: '26px',
              borderRadius: '13px',
              display: 'grid',
              placeItems: 'center',
              fontSize: '13px',
              background: 'rgba(20,24,32,.7)',
              border: '1px solid rgba(255,255,255,.16)',
              cursor: 'pointer',
            });
            b.addEventListener('click', function (e) {
              e.stopPropagation();
              resetAutoReturn();
              fn();
            });
            bar.appendChild(b);
          };
          mk('💤', '让她睡觉', function () { playPet('sleep', true); });
          mk('💻', '让她工作', function () { playPet('code', false); });
          mk('↩', '送回房间', function () { setOut(false); });
          petWrap.appendChild(bar);

          petWrap.addEventListener('pointerenter', function () { bar.style.display = 'flex'; });
          petWrap.addEventListener('pointerleave', function () { bar.style.display = 'none'; });

          let dragging = false;
          let moved = 0;
          let startX = 0;
          let startY = 0;
          let baseX = 0;
          let baseY = 0;

          petWrap.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            resetAutoReturn();
            clearPetTimers();
            dragging = true;
            moved = 0;
            startX = e.clientX;
            startY = e.clientY;
            const r = petWrap.getBoundingClientRect();
            baseX = r.left;
            baseY = r.top;
            try { petWrap.setPointerCapture(e.pointerId); } catch (error) {}
            petWrap.style.cursor = 'grabbing';
          });

          petWrap.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
            const nx = Math.max(6, Math.min(window.innerWidth - W - 6, baseX + dx));
            const ny = Math.max(6, Math.min(window.innerHeight - H - 6, baseY + dy));
            petWrap.style.left = Math.round(nx) + 'px';
            petWrap.style.top = Math.round(ny) + 'px';
          });

          petWrap.addEventListener('pointerup', function (e) {
            if (!dragging) return;
            dragging = false;
            petWrap.style.cursor = 'grab';
            if (moved < 6) {
              clearPetTimers();
              playPet('wave', false);
            }
            // Dragging is intentionally not persisted: the next recall re-anchors.
          });

          document.body.appendChild(petWrap);
        }

        function spawnFx(kind) {
          if (!petWrap || !kind || kind === 'none') return;
          const r = petWrap.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const colors = {
            stars: ['#f0a33a', '#e8607f', '#3fa9e0'],
            hearts: ['#e8607f', '#d94f6e', '#ff7f95'],
            bubbles: ['#3fa9e0', '#7fd3ff', '#9fe3ff'],
            ring: ['#3fa9e0'],
          };
          const palette = colors[kind] || colors.stars;

          // soft glow behind her
          const glow = document.createElement('div');
          Object.assign(glow.style, {
            position: 'fixed',
            left: cx + 'px',
            top: cy + 'px',
            width: '180px',
            height: '180px',
            marginLeft: '-90px',
            marginTop: '-90px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,.9), rgba(255,226,170,.35) 45%, rgba(255,220,160,0) 70%)',
            pointerEvents: 'none',
            zIndex: '2147482550',
          });
          document.body.appendChild(glow);
          const glowAnim = glow.animate(
            [
              { transform: 'scale(.35)', opacity: 0 },
              { transform: 'scale(1)', opacity: 1, offset: 0.3 },
              { transform: 'scale(1.9)', opacity: 0 },
            ],
            { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' }
          );
          glowAnim.onfinish = () => glow.remove();

          // expanding flash ring (all effects)
          const flash = document.createElement('div');
          Object.assign(flash.style, {
            position: 'fixed',
            left: cx + 'px',
            top: cy + 'px',
            width: '70px',
            height: '70px',
            marginLeft: '-35px',
            marginTop: '-35px',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,.95)',
            boxShadow: '0 0 26px rgba(255,222,150,.95)',
            pointerEvents: 'none',
            zIndex: '2147482600',
          });
          document.body.appendChild(flash);
          const flashAnim = flash.animate(
            [
              { transform: 'scale(.25)', opacity: 0 },
              { transform: 'scale(.9)', opacity: 1, offset: 0.18 },
              { transform: 'scale(2.6)', opacity: 0 },
            ],
            { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)' }
          );
          flashAnim.onfinish = () => flash.remove();

          if (kind === 'ring') {
            const ring = document.createElement('div');
            Object.assign(ring.style, {
              position: 'fixed',
              left: cx + 'px',
              top: cy + 'px',
              width: '56px',
              height: '56px',
              marginLeft: '-28px',
              marginTop: '-28px',
              borderRadius: '50%',
              border: '3px solid ' + palette[0],
              boxShadow: '0 0 22px ' + palette[0],
              pointerEvents: 'none',
              zIndex: '2147482600',
            });
            document.body.appendChild(ring);
            const anim = ring.animate(
              [
                { transform: 'scale(.25)', opacity: 0 },
                { transform: 'scale(.7)', opacity: 0.95, offset: 0.25 },
                { transform: 'scale(3.6)', opacity: 0 },
              ],
              { duration: 820, easing: 'cubic-bezier(.2,.7,.3,1)' }
            );
            anim.onfinish = () => ring.remove();
            return;
          }

          const count = kind === 'bubbles' ? 14 : 20;
          for (let i = 0; i < count; i++) {
            const p = document.createElement('span');
            p.textContent = kind === 'hearts' ? '♥' : kind === 'bubbles' ? '○' : '✦';
            Object.assign(p.style, {
              position: 'fixed',
              left: cx + 'px',
              top: cy + 'px',
              fontSize: (kind === 'bubbles' ? 14 + Math.random() * 14 : 17 + Math.random() * 16) + 'px',
              fontWeight: '600',
              color: palette[i % palette.length],
              pointerEvents: 'none',
              zIndex: '2147482600',
              willChange: 'transform, opacity',
              textShadow: '0 0 2px rgba(255,255,255,.95), 0 1px 6px rgba(120,60,20,.45)',
            });
            document.body.appendChild(p);
            const a = Math.random() * Math.PI * 2;
            const d = kind === 'bubbles' ? 24 + Math.random() * 40 : 40 + Math.random() * 86;
            const dx = kind === 'bubbles' ? (Math.random() - 0.5) * 34 : Math.cos(a) * d;
            const dy = kind === 'bubbles' ? -(52 + Math.random() * 90) : Math.sin(a) * d * 1.25;
            const anim = p.animate(
              [
                { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
                { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.12 },
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.4 },
                { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.15)', opacity: 0 },
              ],
              {
                duration: (kind === 'bubbles' ? 1100 : 780) + Math.random() * 520,
                easing: 'cubic-bezier(.2,.7,.3,1)',
              }
            );
            anim.onfinish = () => p.remove();
          }
        }

        let petTimerA = 0;
        let petTimerB = 0;
        function clearPetTimers() {
          if (petTimerA) { clearTimeout(petTimerA); petTimerA = 0; }
          if (petTimerB) { clearTimeout(petTimerB); petTimerB = 0; }
        }
        function greet() {
          clearPetTimers();
          playPet('surprised', false);
          petTimerA = setTimeout(function () {
            petTimerA = 0;
            if (!out) return;
            playPet('wave', false);
          }, 2600);
          petTimerB = setTimeout(function () {
            petTimerB = 0;
            if (!out) return;
            petIdle();
          }, 7600);
        }

        function setOut(on) {
          out = !!on;
          try { localStorage.setItem(OUT_KEY, out ? '1' : '0'); } catch (error) {}
          recall.textContent = out ? '↩' : (roomSleeping ? '💤' : '🐾');
          recall.title = out ? '把她送回壁纸' : (roomSleeping ? '她在睡觉，多点几下' : '把她召到桌面');
          if (out) {
            buildPet();
            placeCardAtAnchor(); // every recall starts from the chat-input anchor
            petWrap.style.display = 'block';
            petWrap.animate(
              [
                { transform: 'scale(.55)', opacity: 0 },
                { transform: 'scale(1.06)', opacity: 1, offset: 0.62 },
                { transform: 'scale(1)', opacity: 1 },
              ],
              { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }
            );
            requestAnimationFrame(function () {
              spawnFx(settings.fx);
              greet();
            });
            resetAutoReturn();
          } else if (petWrap) {
            clearAutoReturn();
            clearPetTimers();
            spawnFx(settings.fx);
            const leave = petWrap.animate(
              [
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(.72)', opacity: 0 },
              ],
              { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)' }
            );
            leave.onfinish = function () {
              if (out) return;
              petWrap.style.display = 'none';
              if (petVideo) petVideo.pause();
            };
          }
          postPresence(!out);
        }

        // Keep the card fully visible and above the input when the window resizes.
        window.addEventListener('resize', function () {
          if (out && petWrap) placeCardAtAnchor();
        });

        function openLibrary() {
          panel.style.display = 'none';
          buildLibModal();
          libModal.style.display = 'flex';
          try {
            frame.contentWindow.postMessage({ type: 'cozy-room-library-request' }, '*');
          } catch (error) {}
          renderLibrary();
        }

        function buildLibModal() {
          if (libModal) return;
          libModal = document.createElement('div');
          libModal.id = 'dsh-cozy-room-library';
          Object.assign(libModal.style, {
            position: 'fixed',
            right: '74px',
            bottom: '18px',
            width: '344px',
            maxHeight: '76vh',
            display: 'none',
            flexDirection: 'column',
            padding: '12px 14px 10px',
            borderRadius: '16px',
            background: 'rgba(18,22,30,.92)',
            color: '#e9edf5',
            font: '12px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif',
            boxShadow: '0 14px 38px rgba(0,0,0,.42)',
            border: '1px solid rgba(255,255,255,.12)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            zIndex: '2147482990',
          });
          document.body.appendChild(libModal);

          const head = document.createElement('div');
          Object.assign(head.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          });
          const t = document.createElement('span');
          t.id = 'cozy-lib-title';
          t.textContent = '动作库';
          Object.assign(t.style, { fontSize: '13px', fontWeight: '600' });
          const x = document.createElement('span');
          x.textContent = '✕';
          Object.assign(x.style, { cursor: 'pointer', opacity: '.65', padding: '2px 4px' });
          x.addEventListener('click', function () { libModal.style.display = 'none'; });
          head.appendChild(t);
          head.appendChild(x);
          libModal.appendChild(head);

          libVideo = document.createElement('video');
          libVideo.id = 'cozy-lib-preview';
          libVideo.muted = true;
          libVideo.loop = true;
          libVideo.playsInline = true;
          Object.assign(libVideo.style, {
            width: '100%',
            height: '132px',
            objectFit: 'contain',
            background: '#0d1016',
            borderRadius: '10px',
            marginBottom: '8px',
          });
          libModal.appendChild(libVideo);

          libCats = document.createElement('div');
          Object.assign(libCats.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginBottom: '8px',
          });
          libModal.appendChild(libCats);

          libGrid = document.createElement('div');
          Object.assign(libGrid.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            overflowY: 'auto',
            maxHeight: '44vh',
            paddingRight: '2px',
          });
          libModal.appendChild(libGrid);

          const hint = document.createElement('div');
          hint.textContent = '点名字：她在房间里做这个动作；上方是预览。';
          Object.assign(hint.style, { marginTop: '8px', opacity: '.5', fontSize: '11px' });
          libModal.appendChild(hint);
        }

        function renderLibrary() {
          if (!libModal) return;
          const title = libModal.querySelector('#cozy-lib-title');
          if (title) title.textContent = '动作库 · ' + library.length + ' 段';
          if (!libCats || !libGrid) return;
          libCats.innerHTML = '';
          const cats = ['全部'].concat(Array.from(new Set(library.map(function (i) { return i.cat; }))));
          cats.forEach(function (cat) {
            const b = document.createElement('span');
            b.textContent = cat;
            const active = cat === libActive;
            Object.assign(b.style, {
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '11px',
              cursor: 'pointer',
              background: active ? 'rgba(127,182,224,.35)' : 'rgba(255,255,255,.07)',
              border: '1px solid ' + (active ? 'rgba(127,182,224,.7)' : 'rgba(255,255,255,.12)'),
            });
            b.addEventListener('click', function () {
              libActive = cat;
              renderLibrary();
            });
            libCats.appendChild(b);
          });

          libGrid.innerHTML = '';
          const items = libActive === '全部' ? library : library.filter(function (i) { return i.cat === libActive; });
          if (items.length && libVideo && !libVideo.src) {
            libVideo.src = BASE + '/assets/webm/' + encodeURIComponent(items[0].file);
            const pp = libVideo.play();
            if (pp && pp.catch) pp.catch(function () {});
          }
          items.forEach(function (item) {
            const b = document.createElement('span');
            b.textContent = item.name;
            Object.assign(b.style, {
              padding: '3px 7px',
              borderRadius: '8px',
              fontSize: '11px',
              cursor: 'pointer',
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.1)',
              whiteSpace: 'nowrap',
            });
            b.addEventListener('click', function () {
              if (libVideo) {
                libVideo.src = BASE + '/assets/webm/' + encodeURIComponent(item.file);
                const p = libVideo.play();
                if (p && p.catch) p.catch(function () {});
              }
              try {
                frame.contentWindow.postMessage({ type: 'cozy-room-action', id: item.id }, '*');
              } catch (error) {}
              b.style.background = 'rgba(127,182,224,.45)';
              setTimeout(function () { b.style.background = 'rgba(255,255,255,.08)'; }, 700);
            });
            libGrid.appendChild(b);
          });
        }

        const gear = roundButton('⚙️', '小蓝的设置');
        gear.addEventListener('click', (event) => {
          event.stopPropagation();
          const opening = panel.style.display === 'none';
          panel.style.display = opening ? 'block' : 'none';
          if (opening && libModal) libModal.style.display = 'none';
        });

        const recall = roundButton('🐾', '把她召到桌面');
        recall.addEventListener('click', (event) => {
          event.stopPropagation();
          if (out) {
            setOut(false);
            return;
          }
          if (roomSleeping) {
            wakeClicks += 1;
            if (wakeClicks < wakeNeed) {
              return;
            }
            wakeClicks = 0;
          }
          setOut(true);
        });

        const home = roundButton('🏠', '进房间玩（Esc 退出）');
        let interactive = false;

        function setInteractive(on) {
          interactive = on;
          frame.style.zIndex = on ? '2147482000' : '-1';
          frame.style.pointerEvents = on ? 'auto' : 'none';
          home.style.background = on ? 'rgba(64,120,200,.85)' : 'rgba(20,24,32,.55)';
          home.textContent = on ? '✕' : '🏠';
          try {
            frame.contentWindow.postMessage({ type: 'cozy-room-mode', interactive: on }, '*');
          } catch (error) {}
          if (on) {
            try {
              frame.contentWindow.focus();
            } catch (error) {}
          }
        }

        home.addEventListener('click', (event) => {
          event.stopPropagation();
          setInteractive(!interactive);
        });

        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape' && interactive) setInteractive(false);
        });

        ui.appendChild(gear);
        ui.appendChild(recall);
        ui.appendChild(home);

        window.__cozyRoom = {
          get sleeping() { return roomSleeping; },
          get clip() { return roomClip; },
          get out() { return out; },
          // Read-only weather data-layer view, used by the 005 acceptance check.
          get weather() { return weatherCurrent; },
          get weatherState() {
            const city = String(settings.city || '').trim();
            return {
              timeSync: !!settings.timeSync,
              weatherSync: !!settings.weatherSync,
              city: settings.city,
              enabled: !!settings.weatherSync && !!city,
              inFlight: weatherInFlight,
              nextRefreshAt: weatherNextAt,
              refreshInMs: Math.max(0, weatherNextAt - Date.now()),
              geo: readCache(GEO_KEY),
              cache: readWeatherCache(),
            };
          },
          refreshWeather: function (reason) { return refreshWeather(reason || 'manual'); },
          // Read-only view used by the recall-anchor acceptance check.
          get anchor() {
            if (!petWrap) return null;
            const input = findChatInput();
            const c = petWrap.getBoundingClientRect();
            return {
              selector: input ? input.kind : 'fallback',
              input: input ? input.rect : null,
              card: { left: c.left, top: c.top, right: c.right, bottom: c.bottom, width: c.width, height: c.height },
            };
          },
        };

        // If weather was already enabled in a previous session, fetch once now.
        // With the default (off) this starts no network request at all.
        weatherKey = weatherSettingsKey();
        if (settings.weatherSync && String(settings.city || '').trim()) {
          refreshWeather('startup');
        }

        // restore the "out" state on reload
        if (out) setOut(true);
      }

      return { inject, apply };
    },
  });
})();



