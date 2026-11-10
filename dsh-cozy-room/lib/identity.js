// Birth identity: date -> zodiac / Chinese zodiac / simplified BaZi.
// Pure functions, no I/O, no LLM.

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

// Approximate solar-term starts (month, day) for the 12 "节".
const TERMS = [
  [1, 6], [2, 4], [3, 6], [4, 5], [5, 6], [6, 6],
  [7, 7], [8, 8], [9, 8], [10, 8], [11, 7], [12, 7],
];
// month branch index (寅=2 ... 丑=1) for each term slot
const TERM_BRANCH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];

const SIGNS = [
  ['摩羯座', 1, 19], ['水瓶座', 2, 18], ['双鱼座', 3, 20], ['白羊座', 4, 19],
  ['金牛座', 5, 20], ['双子座', 6, 21], ['巨蟹座', 7, 22], ['狮子座', 8, 22],
  ['处女座', 9, 22], ['天秤座', 10, 23], ['天蝎座', 11, 22], ['射手座', 12, 21],
  ['摩羯座', 12, 31],
];

export function zodiacSign(month, day) {
  for (const [name, m, d] of SIGNS) {
    if (month < m || (month === m && day <= d)) return name;
  }
  return '摩羯座';
}

function ganzhi(index) {
  return STEMS[index % 10] + BRANCHES[index % 12];
}

function dayIndex(y, m, d) {
  const jdn = Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 2440588;
  return (jdn + 49) % 60;
}

function monthBranchOf(month, day) {
  let slot = 0;
  let found = false;
  for (let i = 0; i < 12; i += 1) {
    const [tm, td] = TERMS[i];
    if (month > tm || (month === tm && day >= td)) { slot = i; found = true; }
  }
  if (!found) slot = 0; // Jan 1-5 still belongs to the previous 丑 month
  return TERM_BRANCH[slot];
}

export function bazi(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();

  const yearGz = ganzhiYear(y);
  const yearStem = STEMS.indexOf(yearGz[0]);

  const mb = monthBranchOf(m, d);
  // 五虎遁: 甲己之年丙作首
  const tigerStem = (yearStem % 5) * 2 + 2;
  const monthStem = (tigerStem + ((mb - 2 + 12) % 12)) % 10;
  const monthGz = STEMS[monthStem] + BRANCHES[mb];

  const dIdx = dayIndex(y, m, d);
  const dayGz = ganzhiIndex(dIdx);
  const dayStem = dIdx % 10;

  const hourBranch = Math.floor((h + 1) / 2) % 12;
  // 五鼠遁: 甲己还加甲
  const ziStem = (dayStem % 5) * 2;
  const hourStem = (ziStem + hourBranch) % 10;
  const hourGz = STEMS[hourStem] + BRANCHES[hourBranch];

  return {
    year: yearGz, month: monthGz, day: dayGz, hour: hourGz,
    text: yearGz + ' ' + monthGz + ' ' + dayGz + ' ' + hourGz,
  };
}

function ganzhiYear(y) {
  return ganzhiIndex((((y - 4) % 60) + 60) % 60);
}

function ganzhiIndex(i) {
  return STEMS[i % 10] + BRANCHES[i % 12];
}

export function animalOf(date) {
  const y = date.getFullYear();
  return ANIMALS[((y - 4) % 12 + 12) % 12];
}

// Offline fallback: a few soft tendencies per sign.
const FALLBACK = {
  白羊座: { traits: ['坐不住', '想到就做', '输赢都写在脸上'], line: '像一团刚点着的火。' },
  金牛座: { traits: ['慢热', '认准了就不换', '喜欢好吃的'], line: '安静地守着自己的东西。' },
  双子座: { traits: ['好奇', '话多但看心情', '三分钟热度'], line: '脑子里总有两个人在说话。' },
  巨蟹座: { traits: ['恋家', '记得小事', '容易心软'], line: '把在意的人放进壳里。' },
  狮子座: { traits: ['要面子', '护短', '喜欢被看见'], line: '再小也想当一次主角。' },
  处女座: { traits: ['爱收拾', '挑剔', '嘴硬心软'], line: '看不惯乱，也看不惯自己乱。' },
  天秤座: { traits: ['怕冲突', '爱美', '选择困难'], line: '总在找一个刚刚好的距离。' },
  天蝎座: { traits: ['安静', '认死理', '外冷内热'], line: '不太说，但记得很久。' },
  射手座: { traits: ['想往外跑', '心大', '嘴快'], line: '关不住的一个人。' },
  摩羯座: { traits: ['能忍', '习惯自己扛', '慢热'], line: '把日子过成一件件要做完的事。' },
  水瓶座: { traits: ['有点怪', '爱想远的', '不按常理'], line: '活在自己的频率里。' },
  双鱼座: { traits: ['爱做梦', '共情强', '容易走神'], line: '一半在这里，一半在别处。' },
};

export function fallbackSeed(sign, animal) {
  const f = FALLBACK[sign] || { traits: ['安静', '慢热'], line: '刚刚来到这里。' };
  return {
    traits: f.traits.slice(),
    likes: ['窗边的光', '安静'],
    dislikes: ['太吵'],
    wants: ['把房间收拾好'],
    line: f.line,
    source: 'fallback',
  };
}

export function computeBirth(date) {
  const sign = zodiacSign(date.getMonth() + 1, date.getDate());
  const animal = animalOf(date);
  return {
    birthday: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    sign,
    animal,
    bazi: bazi(date),
  };
}

export function seedPrompt(birth) {
  return [
    '你是一个「出生记录」生成器。请为一位刚“出生”的小女仆生成最初的底色。',
    `出生时间：${birth.birthday}`,
    `星座：${birth.sign}；生肖：${birth.animal}；八字：${birth.bazi.text}`,
    '只输出 JSON，不要解释：',
    '{"traits":["3到5条初始倾向，每条不超过12字"],"likes":["2到3个喜欢的东西"],"dislikes":["1到2个讨厌的东西"],"wants":["1到2个想要的东西"],"line":"一句自我描述，不超过30字"}',
    '要求：',
    '- 像“出生那天的天气”，是起点不是命运；',
    '- 可以有矛盾（比如安静但坐不住），不要完美人设；',
    '- 喜欢/讨厌/想要要具体一点（具体的东西或时刻，不要抽象词）；',
    '- 不要写身份、职业、外貌。',
  ].join('\n');
}
