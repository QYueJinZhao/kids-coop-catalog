#!/usr/bin/env node
/**
 * 数据入库脚本：把已有的调研成果（只读引用）转换成统一分类条目。
 *
 * 用法：
 *   node scripts/ingest.mjs <kids-fantasy/data 目录>
 * 例：
 *   node scripts/ingest.mjs "c:/Work/Code/App/GitHub/Plan/research/kids-fantasy/data"
 *
 * 输入（只读，绝不修改）：
 *   ideas.json       120 条创意池
 *   adventures.json   64 条冒险池
 *   adventures3.json  40 条第三批
 * 原型结论人工录入在 data/prototypes.json（来源为 prototype 目录下各 REPORT.md）。
 *
 * 所有派生字段都标注 basis，规则集中在本文件，便于复核与推翻。
 */
import fs from 'node:fs';
import path from 'node:path';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('缺少参数：kids-fantasy/data 目录');
  process.exit(1);
}
const read = (name) => JSON.parse(fs.readFileSync(path.join(srcDir, name), 'utf8'));
const ideas = read('ideas.json');
const adventures = read('adventures.json');
const adventures3 = read('adventures3.json');

const outDir = path.resolve('data');
fs.mkdirSync(outDir, { recursive: true });
const prototypes = JSON.parse(fs.readFileSync(path.join(outDir, 'prototypes.json'), 'utf8'));

// 只有这 4 条有实测时长；其余按结构推断。
const PROTO_SESSION = {
  A01: { band: '≤1 分钟', seconds: 48, basis: '实测：标准档单角 40.80–48.05s（合成代理）' },
  A25: { band: '1–3 分钟', seconds: 112, basis: '实测：标准档 111.5s（合成代理）' },
  A41: { band: '3–5 分钟', seconds: 201, basis: '实测：三段全程 199.4–201.1s（3 种子）' },
  B17: { band: '3–5 分钟', seconds: 151, basis: '实测：140.7–151.5s（固定策略代理）' },
};
function sessionOf(id, defBand, defBasis) {
  return PROTO_SESSION[id] || { band: defBand, seconds: null, basis: defBasis };
}
function evidenceOf(id) {
  return prototypes[id]
    ? { level: 'E1', label: 'HTML 原型实测', note: 'HTML 原型 + 合成代理；0 真人' }
    : { level: 'E0', label: '纸面推理', note: '0 真人、0 原型实测' };
}

/* ---------- 分类骨架：沿用原池的机制家族，不另造一套 ---------- */

const PLAY = {};
ideas.families.forEach((f) => {
  PLAY[f.key] = { key: f.key, name: f.name, desc: f.desc, pool: '创意池', kidsFit: f.kidsFit };
});
adventures.meta.structures.forEach((s) => {
  PLAY[s.key] = { key: s.key, name: s.name, desc: s.desc, pool: '冒险池', kidsFit: s.kidsFit };
});
adventures3.meta.filters.groups.forEach((g) => {
  PLAY[g.key] = { key: g.key, name: g.name, desc: '按童话母题分组，玩法须由机制承载（见原池硬规则）', pool: '第三批', kidsFit: '—' };
});

const POOL = {
  ideas: { key: 'P1', label: '创意池', doc: 'ideas.json', note: '120 条纸面创意，10 个机制家族 × 12 条' },
  adv: { key: 'P2', label: '冒险池', doc: 'adventures.json', note: '64 条 4P 合作冒险，8 个冒险结构 × 8 条' },
  b: { key: 'P3', label: '第三批', doc: 'adventures3.json', note: '40 条以质代量，5 个童话母题组' },
};

/* ---------- 派生规则（全部为推断，不是实测） ---------- */

// 上手门槛：按机制家族/结构的儿童适配判断映射，来源是原池 kidsFit 字段。
const ONBOARD_BY_PLAY = {
  F01: '低', F02: '低', F03: '中', F04: '低', F05: '中',
  F06: '低', F07: '中', F08: '中', F09: '低', F10: '中',
  S01: '低', S02: '中', S03: '中', S04: '中',
  S05: '低', S06: '中', S07: '中', S08: '低',
  G1: '低', G2: '中', G3: '中', G4: '中', G5: '低',
};
const AGE_BY_ONBOARD = { 低: '5–9', 中: '6–10', 高: '8–12' };

// 情绪基调：关键词规则，按优先级命中第一条。判据是原池文本里的表达词，不是情感测量。
const MOOD_RULES = [
  ['滑稽', /笑点|好笑|滑稽|鬼脸|糗|出丑|翻车|逗|哈哈|歪|搞怪|解压/],
  ['紧张', /紧张|差一点|摔|断|塌|漏|掉落|滚|晃|来不及|危|卡住|追|赶|崩/],
  ['温暖', /照顾|陪伴|安抚|告别|重逢|拥抱|哄|喂|睡|守候|回家|放回去|家/],
  ['惊奇', /魔法|亮晶晶|星光|月亮|云|变大|变小|巨大|会飞|神奇|发光|梦|奇遇/],
];
function moodOf(text) {
  for (const [name, re] of MOOD_RULES) if (re.test(text)) return name;
  return '轻快';
}

const COST_WEIGHT = { 低: 0, 中: 1, 高: 2 };
function priceOf(cost) {
  const score = Object.values(cost).reduce((n, v) => n + (COST_WEIGHT[v] ?? 0), 0);
  if (score <= 1) return { band: '低价买断（≤¥50，推断）', basis: '由五成本桶加权推断，未做商业验证' };
  if (score <= 4) return { band: '中价买断（¥50–100，推断）', basis: '由五成本桶加权推断，未做商业验证' };
  return { band: '高价买断（>¥100，推断）', basis: '由五成本桶加权推断，未做商业验证' };
}

function playersFromModes(modes, note) {
  return { modes, note };
}

function ageFrom(onboard) {
  return { band: AGE_BY_ONBOARD[onboard], basis: '推断：由上手门槛（原池 kidsFit 映射）反推，非逐条实测' };
}

/* ---------- 逐池转换 ---------- */

const entries = [];

ideas.ideas.forEach((e, idx) => {
  const play = PLAY[e.family];
  const onboard = ONBOARD_BY_PLAY[e.family] || '中';
  const modes = [];
  if (e.p1 === '成立') modes.push('1P');
  if (e.p2 === '成立') modes.push('2P');
  if (e.p4 === '成立') modes.push('4P');
  const noteBits = [];
  if (e.p1 === '需验证') noteBits.push('1P 待验证');
  if (e.p2 === '需验证') noteBits.push('2P 待验证');
  if (e.p4 === '需验证') noteBits.push('4P 待验证');
  if (e.p4 === '不成立') noteBits.push('4P 不成立');
  const mood = moodOf(`${e.charm} ${e.loop}`);
  entries.push({
    id: `I${e.id}`,
    title: e.zh,
    titleEn: e.en,
    pool: POOL.ideas.key,
    poolLabel: POOL.ideas.label,
    playKey: e.family,
    play: play.name,
    playDesc: play.desc,
    oneLiner: e.loop,
    coreVerb: e.verb,
    players: playersFromModes(modes, e.partyNote || noteBits.join('；')),
    age: ageFrom(onboard),
    session: sessionOf(e.id, '1–3 分钟', '推断：30 秒核心闭环 × 2–6 次；未实测'),
    onboarding: onboard,
    mood,
    platform: {
      target: '本地同屏（热座，键鼠/手柄）',
      tech: e.feas === '可' ? 'HTML 灰盒可验' : '需引擎/定制原型',
      basis: '按原池 feas 字段映射',
    },
    price: priceOf(e.cost),
    evidence: evidenceOf(e.id),
    fit: e.fit,
    why: `归入「${e.family} ${play.name}」：核心动词「${e.verb}」，循环靠${play.desc.replace(/[。；].*$/, '')}；判据取自原池 ${e.family} 定义。${modes.length ? `可玩人数按原文标注为 ${modes.join('/')}。` : '原文未给出成立人数。'}`,
    risk: e.risk,
    lineage: e.lineage,
    dedup: `${e.dedup.status}${e.dedup.ref ? ` · ${e.dedup.ref}` : ''}`,
    detail: {
      核心循环: e.loop,
      趣味点: e.charm,
      分工与人数: e.partyNote,
      可行性备注: e.feasNote,
      成本桶: e.cost,
      母题: e.motif ? `${e.motif} ${e.motifWhy}` : '',
    },
    source: { file: 'research/kids-fantasy/data/ideas.json', pointer: `#/ideas/${idx}`, meta: ideas.meta.method },
    prototype: prototypes[e.id] || null,
  });
});

adventures.entries.forEach((e, idx) => {
  const play = PLAY[e.structure];
  const onboard = ONBOARD_BY_PLAY[e.structure] || '中';
  const modes = [];
  if (e.p1 === '成立') modes.push('1P');
  if (e.p2 === '成立') modes.push('2P');
  if (e.p4 === '成立') modes.push('4P');
  const mood = moodOf(`${e.charm} ${e.kidRead}`);
  entries.push({
    id: e.id,
    title: e.zh,
    titleEn: e.en,
    pool: POOL.adv.key,
    poolLabel: POOL.adv.label,
    playKey: e.structure,
    play: play.name,
    playDesc: play.desc,
    oneLiner: e.loop,
    coreVerb: e.verb,
    players: playersFromModes(modes, e.partyNote || ''),
    age: ageFrom(onboard),
    session: sessionOf(e.id, '3–5 分钟', '推断：3 段旅程 × 60–70 秒（参考 A41 实测）；未逐条实测'),
    onboarding: onboard,
    mood,
    platform: {
      target: '本地同屏（热座，键鼠/手柄）',
      tech: e.feas === '可' ? 'HTML 灰盒可验' : '需引擎/定制原型',
      basis: '按原池 feas 字段映射',
    },
    price: priceOf(e.cost),
    evidence: evidenceOf(e.id),
    fit: e.fit,
    why: `归入「${e.structure} ${play.name}」：核心动词「${e.verb}」，旅程结构为「${play.desc.replace(/[。；].*$/, '')}」；判据取自原池 ${e.structure} 定义。${modes.length ? `成立人数 ${modes.join('/')}。` : '原文未给出成立人数。'}`,
    risk: e.risk,
    lineage: e.lineage,
    dedup: `${e.dedup.status}${e.dedup.ref ? ` · ${e.dedup.ref}` : ''}`,
    detail: {
      旅程: `${e.journey.start} → ${e.journey.road} → ${e.journey.end}`,
      角色分工: e.roles,
      '6–10 岁读法': e.kidRead,
      非暴力解法: e.nonviolent,
      趣味点: e.charm,
      可行性备注: e.feasNote,
      成本桶: e.cost,
    },
    source: { file: 'research/kids-fantasy/data/adventures.json', pointer: `#/entries/${idx}`, meta: adventures.meta.method },
    prototype: prototypes[e.id] || null,
  });
});

adventures3.entries.forEach((e, idx) => {
  const play = PLAY[e.group];
  const onboard = ONBOARD_BY_PLAY[e.group] || '中';
  const modes = ['3P'];
  if (e.gate.fourth === '4P') modes.push('4P');
  const mood = moodOf(`${e.fantasyScene} ${e.loop}`);
  entries.push({
    id: e.id,
    title: e.zh,
    titleEn: e.en,
    pool: POOL.b.key,
    poolLabel: POOL.b.label,
    playKey: e.group,
    play: play.name,
    playDesc: play.desc,
    oneLiner: e.loop,
    coreVerb: e.verb,
    players: playersFromModes(modes, e.gate.fourth === '4P' ? '原文标注第四位有物理后果' : '原文诚实标注为 3P'),
    age: ageFrom(onboard),
    session: sessionOf(e.id, '3–5 分钟', '推断：单场景多段压力 × 60 秒；未逐条实测'),
    onboarding: onboard,
    mood,
    platform: {
      target: '本地同屏（热座，键鼠/手柄）',
      tech: 'HTML 灰盒可验',
      basis: '原池 gate.html 全部标为可证伪',
    },
    price: { band: '低价买断（≤¥50，推断）', basis: '第三批未写成本桶；按同池同类规模推断' },
    evidence: evidenceOf(e.id),
    fit: e.fit,
    why: `归入「${e.group} ${play.name}」：核心动词「${e.verb}」，童话奇遇感由机制承载；判据取自原池 ${e.group} 母题组定义。人数按 gate.fourth = ${e.gate.fourth}。`,
    risk: e.risk,
    lineage: e.lineage,
    dedup: e.dedup,
    detail: {
      奇遇场景: e.fantasyScene,
      三人分工: e.roles3,
      第四位失败模式: e.fourthFail,
      'HTML 证伪方式': e.htmlTest,
      证伪假设: e.falsify,
      等待结构: e.wait,
      挂机预测: e.idle,
      轮换: e.rotation,
    },
    source: { file: 'research/kids-fantasy/data/adventures3.json', pointer: `#/entries/${idx}`, meta: adventures3.meta.method },
    prototype: prototypes[e.id] || null,
  });
});

/* ---------- 汇总 ---------- */

const countBy = (arr, fn) => arr.reduce((m, x) => ((m[fn(x)] = (m[fn(x)] || 0) + 1), m), {});
const poolCounts = countBy(entries, (e) => e.poolLabel);
const playCounts = countBy(entries, (e) => e.playKey);

const catalog = {
  meta: {
    title: '儿童同屏合作游戏分类库',
    subtitle: '224 条纸面创意 / 冒险 / 第三批条目，按玩法族 + 人数 + 时长 + 门槛 + 情绪 + 载体 + 价格带归类',
    version: '1.0',
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    poolCounts,
    playCounts,
    playDefs: Object.fromEntries(Object.entries(PLAY).map(([k, v]) => [k, { name: v.name, desc: v.desc, pool: v.pool, kidsFit: v.kidsFit }])),
    evidenceNote: '全库 E2（真人试玩）= 0。4 条有 HTML 原型 + 合成代理实测（E1），其余 220 条为 E0 纸面推理。',
    gaps: [
      '年龄段为池级推断（6–10 岁核心），仅按上手门槛分出 5–9 / 6–10 两档，未逐条验证。',
      '单局时长除 A01/A25/A41/B17 为实测外，其余为结构推断。',
      '价格带为成本桶推断，无任何商业验证；第三批无成本字段。',
      '外部商业同类游戏未接入：为避免引用未核实事实，本库不收录市面对照条目。',
      '情绪基调由文本关键词规则推导，不是儿童情感测量。',
    ],
  },
  entries,
};

fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`已写入 data/catalog.json：${entries.length} 条`);
console.log('池：', poolCounts);
console.log('玩法族：', playCounts);
const mood = countBy(entries, (e) => e.mood);
const onboard = countBy(entries, (e) => e.onboarding);
const price = countBy(entries, (e) => e.price.band);
const session = countBy(entries, (e) => e.session.band);
console.log('情绪：', mood);
console.log('门槛：', onboard);
console.log('价格带：', price);
console.log('时长：', session);
