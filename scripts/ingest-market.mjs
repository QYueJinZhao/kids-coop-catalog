#!/usr/bin/env node
/**
 * 市面对照入库：Steam 采样数据（只读）→ data/market.json
 *
 * 用法：
 *   node scripts/ingest-market.mjs <steam-demand-2026-11-04.json 路径>
 *
 * 硬规则：
 * - 只搬运采样文件里已有的字段，缺的写「未获取」，不推断。
 * - 玩法族映射与映射判据写在下方 MAPPING 表里，逐款给理由。
 * - 价格、评测数、在线人数都是采样时点，不是历史值。
 * - 人数只写官方原文；modes 是从原文明确语句解析出的可筛档位，不确定就留空。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = process.argv[2];
if (!srcPath) {
  console.error('缺少参数：steam-demand-2026-11-04.json 路径');
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));

/* ---------- 逐款映射：只写机制族，不写「更好/更差」 ---------- */
const MAPPING = {
  728880: {
    keys: ['F05', 'F01'],
    why: '切菜、煎煮、装盘对应「生米变熟」；食材与盘子靠抓取和交接，故并列抓与搬。',
    modes: ['4P'],
    modesNote: '官方原文：up to four players（只解析出上限）',
    noSummary: false,
  },
  1243830: {
    keys: ['F05', 'F01'],
    why: '同为备餐上菜循环（煮与变），端盘与递菜仍需抓取搬运（抓与搬）。',
    modes: ['1P'],
    modesNote: '官方原文出现 or alone；多人上限未获取',
    noSummary: false,
  },
  1509960: {
    keys: ['F02', 'S08'],
    why: '叠人梯、压开关、搬箱子属于搭与塌；钥匙要逐段送到门口，属于接力传递。',
    modes: ['2P', '3P', '4P'],
    modesNote: '官方原文 2-8 players；本库人数筛选只到 4P',
    noSummary: false,
  },
  2644470: {
    keys: ['F02', 'S08'],
    why: '与初代同一套叠人/压机关与钥匙接力结构，故映射相同两族。',
    modes: ['2P', '3P', '4P'],
    modesNote: '官方原文 two players all the way to eight；本库只到 4P',
    noSummary: false,
  },
  996770: {
    keys: ['F01', 'S01'],
    why: '搬家具的核心是抓取托举与「别让东西掉」（抓与搬）；四人同时抬同一件（共同搬运）。',
    modes: ['4P'],
    modesNote: '官方原文 Up to four players',
    noSummary: false,
  },
  1641700: {
    keys: ['F01', 'S01'],
    why: '续作仍是多人共同搬家具，机制族不变。',
    modes: [],
    modesNote: '官方只写 local/online multiplayer，人数未获取',
    noSummary: false,
  },
  477160: {
    keys: ['F01', 'F02'],
    why: '抓握攀爬与摆动是抓与搬；堆箱子、搭人梯过关是搭与塌。',
    modes: ['4P'],
    modesNote: '官方原文 online multiplayer for up to 8；本库只到 4P，本地人数未获取',
    noSummary: false,
  },
  1016920: {
    keys: ['F02', 'S04', 'S08'],
    why: '持续铺轨属于搭与塌；木材/铁只有一份要分配（旅途资源）；铺轨要一段段交接（接力传递）。',
    modes: ['4P'],
    modesNote: '官方原文 up to four players',
    noSummary: false,
  },
  1599600: {
    keys: ['F05', 'F02'],
    why: '选菜、加工、上菜是煮与变；自由摆放设备与扩建店面是搭与塌。',
    modes: ['4P'],
    modesNote: '官方原文 Up to four players',
    noSummary: false,
  },
  204360: {
    keys: [],
    why: '未归类：核心是横版格斗与竞技场对战，本库 23 个玩法族里没有「战斗/对抗」族，不硬塞。',
    modes: [],
    modesNote: '官方抓取文本只描述 Arena 模式，人数未获取',
    noSummary: false,
  },
  1242980: {
    keys: ['F06', 'S03'],
    why: '分拣、盖章、贴标对应收集与分类（收与分）；两只鸟分工守不同工位（角色互补）。',
    modes: [],
    modesNote: '官方描述未抓到人数，未获取',
    noSummary: true,
  },
  1071870: {
    keys: ['F09', 'F10'],
    why: '两条腿必须同步迈步，接近节奏同步（拍与仿）；解谜靠路线与地形推进（滑与路）。',
    modes: ['1P', '2P'],
    modesNote: '官方原文 solo or two-player co-op',
    noSummary: false,
  },
  690640: {
    keys: ['S03', 'F02'],
    why: '法师/骑士/盗贼能力缺一不可（角色互补）；用箱子、藤蔓、光桥搭出通路（搭与塌）。',
    modes: ['1P', '4P'],
    modesNote: '官方原文 solo、up to 4 players；中间档位未逐条写明',
    noSummary: false,
  },
  252110: {
    keys: ['S03', 'F03'],
    why: '四座炮台/护盾/引擎要轮流值守（角色互补）；开火与弹道是抛与落。',
    modes: ['1P', '2P', '3P', '4P'],
    modesNote: '官方原文 1- to 4-player couch co-op',
    noSummary: false,
  },
  2567870: {
    keys: ['F10'],
    why: '锁链绑定后的攀爬与路线选择，映射到滑与路；没有可对应的搬运/搭建核心。',
    modes: [],
    modesNote: '官方抓取文本是系统需求，人数未获取',
    noSummary: true,
  },
  471810: {
    keys: ['F10', 'S02'],
    why: '机器人走位到色块目标是路线题（滑与路）；靠观察与喊话避免互相害死，接近视野/信息分工，但官方未写分屏。',
    modes: ['1P', '2P', '4P'],
    modesNote: '官方原文 1, 2 or 4 players',
    noSummary: false,
  },
};

const NOISE = /^(System Requirements|Minimum|Requires|OS |Processor|Memory|Graphics|Storage|DirectX|Network|Sound Card|Additional Notes)/i;
const PLAYER_WORD = /\b(player|players|co-op|multiplayer)\b/i;

function cleanText(t) {
  return String(t || '')
    .replace(/(?:id|class)="[^"]*"/g, ' ')
    .replace(/^[^<>]*>\s*/, '')
    .replace(/\bAbout This Game\b/i, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// 官方人数原文：只保留商店页里的人数字句；系统需求、纯标签残留不算
function playerEvidence(texts) {
  const joined = (texts || []).map(cleanText).filter(Boolean).join('. ');
  const seen = new Set();
  const sents = joined.split(/(?<=[.!?])\s+/).map((s) => s.replace(/^\/\s*/, '').replace(/([.!?])\.+/g, '$1').trim())
    .filter((s) => {
      if (!s || NOISE.test(s) || !PLAYER_WORD.test(s)) return false;
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return sents.length ? sents.join(' / ') : '未获取';
}
function pickSummary(texts, noSummary) {
  if (noSummary) return '未获取';
  const sentences = texts.map(cleanText).filter((s) => s && !NOISE.test(s))
    .join(' ').split(/(?<=[.!?])\s+/).filter((s) => s.length >= 30);
  const good = sentences.find((s) => PLAYER_WORD.test(s) && !/^[*•]/.test(s))
    || sentences.find((s) => !/^[*•]/.test(s)) || sentences[0];
  return good ? good.trim() : '未获取';
}

function ownFamilyInfo(keys) {
  const own = catalog.entries.filter((e) => keys.includes(e.playKey));
  if (!own.length) return { count: 0, samples: [], text: '同族自有条目：0 条' };
  const samples = own.slice(0, 4).map((e) => `${e.id} ${e.title}`);
  return {
    count: own.length,
    samples,
    text: `同族自有条目 ${own.length} 条（${samples.join('、')}${own.length > 4 ? ' 等' : ''}）；按玩法族并列，不是直接谱系引用`,
  };
}

const entries = src.results.map((g, i) => {
  const m = MAPPING[g.appid];
  if (!m) throw new Error(`缺少映射：${g.appid} ${g.name}`);
  const keys = m.keys;
  const primary = keys[0] || 'UNMAPPED';
  const def = keys.length ? catalog.meta.playDefs[primary] : null;
  const officialText = playerEvidence(g.playerTextEvidence);
  const fans = ownFamilyInfo(keys);
  const categories = g.categories || [];
  const local = categories.includes('Shared/Split Screen Co-op') || categories.includes('Shared/Split Screen');
  const online = categories.includes('Online Co-op');
  return {
    id: `M${String(i + 1).padStart(2, '0')}`,
    origin: 'market',
    title: g.name,
    titleEn: '',
    pool: 'M',
    poolLabel: '市面对照',
    playKey: primary,
    play: def ? def.name : '未归类',
    playKeys: keys,
    playDesc: def ? def.desc : '本样本内未映射到现有玩法族',
    oneLiner: pickSummary(g.playerTextEvidence || [], m.noSummary),
    coreVerb: '未获取',
    players: {
      modes: m.modes,
      note: m.modesNote,
      officialText,
      maxPlayers: g.maxPlayers == null ? '未获取' : String(g.maxPlayers),
    },
    age: { band: '未获取', basis: 'Steam 商店页没有儿童年龄/适配标注' },
    session: { band: '未获取', basis: '官方未标注单局时长' },
    onboarding: '未获取',
    mood: '未获取',
    platform: {
      target: `Steam（${[local ? '本地同屏' : '', online ? '在线合作' : ''].filter(Boolean).join(' / ') || '平台信息见官方类目'}）`,
      tech: '商业成品',
      basis: 'Steam 类目字段',
    },
    price: {
      band: '未获取',
      currency: 'USD',
      base: g.basePriceUSD == null ? '未获取' : g.basePriceUSD,
      sampled: g.priceAtSampleUSD == null ? '未获取' : g.priceAtSampleUSD,
      discountPct: g.discountPctAtSample == null ? '未获取' : g.discountPctAtSample,
      basis: '采样时点价格，不是历史最低价',
    },
    reviews: {
      total: g.reviewTotal == null ? '未获取' : g.reviewTotal,
      positivePct: g.positivePct == null ? '未获取' : g.positivePct,
      label: g.recentLabel || '未获取',
      basis: 'SteamSpy 全语言合计，口径可能不同于商店页英文子集',
    },
    evidence: {
      level: 'E3',
      label: '外部可核实事实',
      note: 'Steam 商店页 / SteamSpy 采样；不是试玩证据，也不代表儿童适配',
    },
    fit: null,
    why: m.why,
    risk: (g.unavailable || []).join('；') || '未获取',
    lineage: fans.text,
    relatedOwn: catalog.entries.filter((e) => keys.includes(e.playKey)).map((e) => e.id).slice(0, 60),
    dedup: '未获取',
    steamUrl: g.storeUrl,
    releaseYear: g.releaseYear,
    releaseDate: g.releaseDate,
    sampledAt: src.sampledAt,
    detail: {
      'Steam 标签': (g.steamTags || []).join('、') || '未获取',
      'Steam 类目': categories.join('、') || '未获取',
      '官方人数原文': officialText,
      '官方标注上限': g.maxPlayers == null ? '未获取' : String(g.maxPlayers),
      '初始价（USD）': g.basePriceUSD == null ? '未获取' : String(g.basePriceUSD),
      '采样价（USD）': g.priceAtSampleUSD == null ? '未获取' : String(g.priceAtSampleUSD),
      '采样折扣': g.discountPctAtSample == null ? '未获取' : `${g.discountPctAtSample}%`,
      '评测数': g.reviewTotal == null ? '未获取' : String(g.reviewTotal),
      '好评率': g.positivePct == null ? '未获取' : `${g.positivePct}%`,
      '采样时在线': g.ccuAtSample == null ? '未获取' : String(g.ccuAtSample),
      '拥有人数区间': g.ownersRange || '未获取',
      '采样时间': src.sampledAt,
    },
    source: {
      file: 'research/kids-fantasy/data/steam-demand-2026-11-04.json',
      pointer: `#/results/${i}`,
      urls: g.sources || [],
      meta: src.method,
    },
    prototype: null,
  };
});

const nat = entries.filter((e) => !e.playKeys.length).length;
const covered = new Set(entries.flatMap((e) => e.playKeys));
const market = {
  meta: {
    count: entries.length,
    sampledAt: src.sampledAt,
    source: 'research/kids-fantasy/data/steam-demand-2026-11-04.json',
    method: src.method,
    caveats: src.caveats,
    coveredFamilies: covered.size,
    totalFamilies: Object.keys(catalog.meta.playDefs).length,
    uncoveredFamilies: Object.keys(catalog.meta.playDefs).filter((k) => !covered.has(k)),
    unclassified: entries.filter((e) => !e.playKeys.length).map((e) => `${e.id} ${e.title}`),
    boundaries: [
      '价格、评测数、在线人数都是 2026-11-04T07:18Z 前后采样时点值，不是历史峰值或历史最低价。',
      '评测数为 SteamSpy 全语言合计，与商店页英文子集口径可能不同。',
      '人数只认官方原文；原文没写「未获取」，不按标签或类目反推。',
      '玩法族映射是编者判据，不代表厂商或发行商分类。',
      '「本样本内未见同族」只说明首轮 16 款里没有，不等于市场上没人做；扩样本已按空族补齐。',
    ],
  },
  entries,
};

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'market.json'), JSON.stringify(market, null, 2) + '\n');
console.log(`已写入 data/market.json：${entries.length} 款，覆盖 ${covered.size}/${Object.keys(catalog.meta.playDefs).length} 个玩法族，未归类 ${nat} 款`);
console.log('覆盖族：', [...covered].join(','));
console.log('未覆盖：', market.meta.uncoveredFamilies.join(','));
