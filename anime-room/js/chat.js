/* Purple room - rule-based chat replies (classic script).
   Mounts window.PR.chat. Later this can delegate to a model: PR.chat.setModel(fn). */
(function () {
  'use strict';
  var PR = (window.PR = window.PR || {});

  var lastReply = '';

  function pick(list) {
    if (!list || !list.length) return '';
    var pool = list.slice();
    if (pool.length > 1) {
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      if (pool[0] === lastReply) pool.push(pool.shift());
    }
    lastReply = pool[0];
    return pool[0];
  }

  function hour() { return new Date().getHours(); }
  function weather() { return (PR.weather && PR.weather.kind) || 'clear'; }

  function timeGreeting() {
    var h = hour();
    if (h < 5) return pick(['这么晚还没睡？', '夜里好安静。', '你还醒着呀。']);
    if (h < 11) return pick(['早呀。', '早上好。', '今天也要加油。']);
    if (h < 14) return pick(['中午好。', '吃饭了吗？']);
    if (h < 18) return pick(['下午好。', '今天过得怎么样？']);
    if (h < 23) return pick(['晚上好。', '忙完啦？']);
    return pick(['这么晚啦。', '该准备睡了。']);
  }

  var RULES = [
    { id: 'greet', re: /(你好|哈喽|嗨|hi|hello|在吗|在么|在不在)/i,
      replies: ['在呀。', '嗯，我在。', '你回来啦。', '我一直都在。'] },
    { id: 'morning', re: /(早上好|早安|早呀)/,
      replies: ['早～', '早上好。', '今天起得真早。'] },
    { id: 'night', re: /(晚安|睡了|睡觉|好困|困了|我睡了)/,
      replies: ['晚安。', '去睡吧，我把灯关了。', '那我也不吵你了。', '做个好梦。'] },
    { id: 'food', re: /(吃饭|吃了|饿了|好饿|夜宵|早餐|午餐|晚餐|外卖)/,
      replies: ['你吃了吗？', '我也有点饿了…', '记得好好吃饭。', '要一起吃点东西吗？'] },
    { id: 'tired', re: /(好累|累死|加班|好忙|忙死|辛苦|撑不住)/,
      replies: ['辛苦啦。', '要不要歇一会儿。', '我给你倒杯水？', '别硬撑。'] },
    { id: 'work', re: /(工作|写代码|bug|开会|项目|需求|上线)/,
      replies: ['加油，我陪你。', '别熬太晚。', '写完记得伸个懒腰。', '我在这边看着你。'] },
    { id: 'miss', re: /(想你|喜欢你|爱你|抱抱|亲亲)/,
      replies: ['唔…我也是。', '突然说这个…', '（脸有点红）', '那你要多陪陪我。'] },
    { id: 'who', re: /(你是谁|你叫什么|你的名字|你是什么)/,
      replies: ['我是小蓝呀。', '住在这个房间里的小女仆。', '你猜？'] },
    { id: 'doing', re: /(在干嘛|在做什么|干什么呢|忙什么)/,
      replies: ['在发呆。', '在等你说话。', '刚收拾完房间。', '看窗外。'] },
    { id: 'praise', re: /(好看|可爱|漂亮|厉害|棒)/,
      replies: ['真的吗？', '嘿嘿。', '你嘴真甜。', '那你要多看看我。'] },
    { id: 'weather', re: /(下雨|下雪|冷|热|天气|晴天|阴天)/,
      replies: null }, // filled below with weather context
    { id: 'back', re: /(回来了|到家|下班)/,
      replies: ['欢迎回来。', '累不累？', '我给你留着灯呢。'] },
    { id: 'bye', re: /(再见|拜拜|走了|下线|出门)/,
      replies: ['拜拜，早点回来。', '我等你。', '路上小心。'] },
    { id: 'thanks', re: /(谢谢|谢啦|感谢)/,
      replies: ['不客气。', '嗯！', '小事。'] },
    { id: 'question', re: /(吗？|吗\?|？|\?)$/,
      replies: ['唔…我想想。', '你觉得呢？', '这个嘛…', '让我想想怎么回答你。'] },
  ];

  function weatherReply(text) {
    var w = weather();
    var t = String(text || '');
    if (w === 'rain') return pick(['外面在下雨，你带伞了吗？', '雨声还挺好听的。', '别淋湿了。']);
    if (w === 'snow') return pick(['外面下雪了，好白。', '冷的话多穿点。', '我想去窗边看。']);
    if (w === 'thunder') return pick(['打雷了…', '有点吓人。', '你那边也打雷吗？']);
    if (w === 'fog') return pick(['外面起雾了。', '看不太清外面。']);
    if (/热/.test(t)) return pick(['是有点热。', '要不要开窗？']);
    if (/冷/.test(t)) return pick(['冷就多穿点。', '我帮你把毯子拿来？']);
    return pick(['今天天气还不错。', '窗边能看到天。', '你喜欢什么天气？']);
  }

  function contextual() {
    var h = hour();
    if (h >= 23 || h < 5) return pick(['这么晚啦。', '还不睡吗？', '我有点困了…']);
    if (h >= 6 && h < 10) return pick(['早呀。', '今天也要加油。']);
    if (weather() === 'rain') return pick(['外面在下雨。', '雨声挺好听的。']);
    if (weather() === 'snow') return pick(['外面下雪了。', '好想出去玩。']);
    return pick(['怎么啦？', '然后呢？', '嗯嗯，我在听。', '你继续说。']);
  }

  var modelFn = null;

  function reply(text) {
    var t = String(text || '').trim();
    if (modelFn) {
      try {
        var m = modelFn(t);
        if (m) return m;
      } catch (err) { /* fall through */ }
    }
    if (!t) return contextual();
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (!r.re.test(t)) continue;
      if (r.id === 'weather') return weatherReply(t);
      return pick(r.replies);
    }
    // time-of-day small talk when the message is a bare greeting-ish fragment
    if (t.length <= 4) return timeGreeting();
    return contextual();
  }

  PR.chat = {
    reply: reply,
    rules: RULES,
    setModel: function (fn) { modelFn = typeof fn === 'function' ? fn : null; },
  };
})();
