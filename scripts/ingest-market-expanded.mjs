#!/usr/bin/env node
/**
 * 扩样本入库：在首轮 16 款（M01–M16）之上追加定向补齐 22 款（M17–M38）
 *
 * 用法：node scripts/ingest-market-expanded.mjs
 * 输入：data/market.json（含首轮 16 款，可含上次扩样本结果）、data/catalog.json、data/steam-expanded-2026-11-04.json
 * 输出：data/market.json（38 款，M01–M16 原样保留；本脚本幂等）
 *
 * 硬规则：
 * - 新条目只搬运快照里可核实的事实，缺的写「未获取」。
 * - 人数只写官方原文；原文没写人数就 modes 留空 / maxPlayers 未获取，不反推。
 * - 玩法族映射逐款写判据；落不进 23 族的单列未归类，不新增族。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const market = JSON.parse(fs.readFileSync(path.join(root, 'data', 'market.json'), 'utf8'));
const rawPath = path.join(root, 'data', 'steam-expanded-2026-11-04.json');
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

/* ---------- 逐款映射：只写机制族，不写「更好/更差」 ---------- */
const MAPPING = {
  303590: {
    keys: ['F04'],
    why: '在相同 NPC 人群中伪装、完成目标并找机会淘汰他人；核心是「看不看得见」，映射追与藏。',
    modes: ['2P', '3P', '4P'],
    modesNote: '官方原文：local multiplayer (2-8 players)；本库人数档只到 4P',
    maxPlayers: 8,
  },
  1741160: {
    keys: ['F04'],
    why: '4 人线上捉迷藏：一人跑、其他人追，核心是追逐与被看见，映射追与藏（对抗性较强）。',
    modes: ['4P'],
    modesNote: '官方原文：competitive online platformer for 4 players',
    maxPlayers: 4,
  },
  442070: {
    keys: ['F07'],
    why: '用画和描述让别人猜原词，猜与演是同一轮的核心，映射演与猜。',
    modes: ['3P', '4P'],
    modesNote: '官方原文：For 3-8 players；本库人数档只到 4P',
    maxPlayers: 8,
  },
  675500: {
    keys: ['F07'],
    why: '用描述、表演、画画或唱歌让队友猜，直接对应演与猜。',
    modes: ['4P'],
    modesNote: '官方原文：Up to 8 players；本库人数档只到 4P',
    maxPlayers: 8,
  },
  840010: {
    keys: ['F08'],
    why: '驯养动物、经营农场、照顾小镇与动物成长，核心是照料与共生，映射养与共生。',
    modes: ['4P'],
    modesNote: '官方原文：invite up to three friends（含房主上限 4 人）',
    maxPlayers: '未获取',
  },
  1424330: {
    keys: ['F08'],
    why: '喂养、繁育、观察宠物长大与变异，核心是照料与成长，映射养与共生。',
    modes: ['1P'],
    modesNote: 'Steam 类目 Single-player；官方人数原文未写',
    maxPlayers: '未获取',
  },
  1982340: {
    keys: ['S05', 'G5'],
    why: '幼狼与幼鹿在暴风雪中迷路，沿家人脚印互相扶持找回家；对应迷路与重逢，也对应走失与带回。',
    modes: ['2P'],
    modesNote: '官方原文：Two players take control of either the wolf cub or the fawn',
    maxPlayers: 2,
  },
  1328840: {
    keys: ['S05'],
    why: '一对兄妹在想象世界里走失，靠解谜找路回家；核心是迷路与重逢，映射 S05。',
    modes: ['1P'],
    modesNote: 'Steam 类目 Single-player；官方人数原文未写',
    maxPlayers: '未获取',
  },
  246900: {
    keys: ['S06'],
    why: '清理受灾设施、把现场恢复原状，多人分工打扫，对应把世界修好。',
    modes: [],
    modesNote: '官方只写可邀请朋友一起打扫与分屏合作，人数未获取',
    maxPlayers: '未获取',
  },
  1290000: {
    keys: ['S06'],
    why: '冲洗脏污、恢复建筑原貌，合作分工清理，对应把世界修好。',
    modes: ['2P', '4P'],
    modesNote: '官方原文：Career 可 2 人互助；Free Play 最多 6 人（本库只到 4P）',
    maxPlayers: 6,
  },
  224480: {
    keys: ['S07'],
    why: '2-4 人各自控制章鱼爸爸的一条肢体，共同扮成一个「正常人类」，谁乱动谁露馅，直接对应共同伪装。',
    modes: ['2P', '3P', '4P'],
    modesNote: '官方原文：co-op mode with 2 to 4 players',
    maxPlayers: 4,
  },
  962130: {
    keys: ['G1'],
    why: '被缩小到后院尺度，日常物品变成巨大地形与资源，对应尺度突变 / 巨大日常。',
    modes: ['4P'],
    modesNote: '官方原文：online with up to three friends（含本人上限 4）',
    maxPlayers: '未获取',
  },
  768200: {
    keys: ['G1'],
    why: '以微小体型在放大的自然环境中生存建造，日常尺度被放大，对应尺度突变 / 巨大日常。',
    modes: ['4P'],
    modesNote: '官方原文：up to 10 players；本库人数档只到 4P',
    maxPlayers: 10,
  },
  1211020: {
    keys: ['G2'],
    why: '古怪小镇、夸张物理与荒诞零工构成规则感，角色是可笑的善意怪人，对应善意怪人 / 古怪规则。',
    modes: ['1P', '2P', '3P', '4P'],
    modesNote: '官方原文：1-4 players Online and Local split-screen co-op',
    maxPlayers: 4,
  },
  572890: {
    keys: ['G2'],
    why: '古怪角色提出不合常理的请求，玩家在荒诞规则里帮忙，对应善意怪人 / 古怪规则。',
    modes: [],
    modesNote: '官方只写 local multiplayer，人数未获取',
    maxPlayers: '未获取',
  },
  972660: {
    keys: ['G3'],
    why: '照料灵魂乘客并逐一道别，留下记忆与船上的痕迹，对应告别 / 被看见 / 留下记号。',
    modes: ['2P'],
    modesNote: '官方原文：two-player cooperative play（Daffodil 猫）',
    maxPlayers: 2,
  },
  1123450: {
    keys: ['G4'],
    why: '用一支看似无用的画笔把失去颜色的世界一点点补回来，对应无用却重要 / 修补守候。',
    modes: [],
    modesNote: '官方只写 local co-op，人数未获取',
    maxPlayers: '未获取',
  },
  1202900: {
    keys: ['G4'],
    why: '修理旧物、听物品主人的故事，修补本身就是陪伴与守候，对应无用却重要 / 修补守候。',
    modes: ['1P'],
    modesNote: 'Steam 类目 Single-player；官方人数原文未写',
    maxPlayers: '未获取',
  },
  1177980: {
    keys: ['G5'],
    why: '小猫走失在城市里，一路交朋友、找路回家，对应走失 / 重逢 / 带回。',
    modes: ['1P'],
    modesNote: 'Steam 类目 Single-player；官方人数原文未写',
    maxPlayers: '未获取',
  },
  285900: {
    keys: [],
    why: '未归类：核心是多人近身格斗与淘汰，本库 23 族里没有「战斗 / 对抗」族，不硬塞。',
    modes: [],
    modesNote: '官方描述未写人数；Steam 类目含 PvP / Online PvP',
    maxPlayers: '未获取',
  },
  312530: {
    keys: [],
    why: '未归类：核心是 2-8 人武器乱斗与淘汰，属战斗 / 对抗，不硬塞。',
    modes: ['2P', '3P', '4P'],
    modesNote: '官方原文：2 to 8 players；本库人数档只到 4P',
    maxPlayers: 8,
  },
  674940: {
    keys: [],
    why: '未归类：核心是 2-4 人物理格斗，属战斗 / 对抗，不硬塞。',
    modes: ['2P', '3P', '4P'],
    modesNote: '官方原文：2 to 4 players',
    maxPlayers: 4,
  },
};

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
function shortOneLiner(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (!s) return '未获取';
  const cut = s.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return cut.length > 220 ? cut.slice(0, 220) + '…' : cut;
}

const baseEntries = market.entries.filter((e) => Number(String(e.id).replace(/^M/, '')) <= 16);
const newEntries = raw.results.map((g, i) => {
  const m = MAPPING[g.appid];
  if (!m) throw new Error(`缺少映射：${g.appid} ${g.name}`);
  const keys = m.keys;
  const primary = keys[0] || 'UNMAPPED';
  const def = keys.length ? catalog.meta.playDefs[primary] : null;
  const officialText = g.playerTextEvidence && g.playerTextEvidence.length ? g.playerTextEvidence.join(' / ') : '未获取';
  const fans = ownFamilyInfo(keys);
  const categories = g.categories || [];
  const local = categories.includes('Shared/Split Screen Co-op') || categories.includes('Shared/Split Screen');
  const online = categories.includes('Online Co-op');
  const id = `M${String(baseEntries.length + i + 1).padStart(2, '0')}`;
  return {
    id,
    origin: 'market',
    title: g.name,
    titleEn: '',
    pool: 'M',
    poolLabel: '市面对照',
    playKey: primary,
    play: def ? def.name : '未归类',
    playKeys: keys,
    playDesc: def ? def.desc : '本样本内未映射到现有玩法族',
    oneLiner: shortOneLiner(g.oneLiner),
    coreVerb: '未获取',
    players: {
      modes: m.modes,
      note: m.modesNote,
      officialText,
      maxPlayers: m.maxPlayers == null ? '未获取' : String(m.maxPlayers),
    },
    age: { band: '未获取', basis: 'Steam 商店页没有儿童年龄/适配标注' },
    session: { band: '未获取', basis: '官方未标注单局时长' },
    onboarding: '未获取',
    mood: '未获取',
    platform: {
      target: `Steam（${[local ? '本地同屏' : '', online ? '在线合作' : ''].filter(Boolean).join(' / ') || '单人 / 平台信息见官方类目'}）`,
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
    steamUrl: `https://store.steampowered.com/app/${g.appid}/`,
    releaseYear: g.releaseDate ? String(g.releaseDate).match(/\d{4}/)?.[0] || '' : '',
    releaseDate: g.releaseDate,
    sampledAt: raw.sampledAt,
    detail: {
      'Steam 标签': (g.steamTags || []).join('、') || '未获取',
      'Steam 类目': categories.join('、') || '未获取',
      '官方人数原文': officialText,
      '官方标注上限': m.maxPlayers == null ? '未获取' : String(m.maxPlayers),
      '初始价（USD）': g.basePriceUSD == null ? '未获取' : String(g.basePriceUSD),
      '采样价（USD）': g.priceAtSampleUSD == null ? '未获取' : String(g.priceAtSampleUSD),
      '采样折扣': g.discountPctAtSample == null ? '未获取' : `${g.discountPctAtSample}%`,
      '评测数': g.reviewTotal == null ? '未获取' : String(g.reviewTotal),
      '好评率': g.positivePct == null ? '未获取' : `${g.positivePct}%`,
      '采样时在线': g.ccuAtSample == null ? '未获取' : String(g.ccuAtSample),
      '拥有人数区间': g.ownersRange || '未获取',
      '采样时间': raw.sampledAt,
    },
    source: {
      file: 'data/steam-expanded-2026-11-04.json',
      pointer: `#/results/${i}`,
      urls: g.sources || [],
      meta: raw.method,
    },
    prototype: null,
  };
});

const entries = [...baseEntries, ...newEntries];
const covered = new Set(entries.flatMap((e) => e.playKeys));
const totalFamilies = Object.keys(catalog.meta.playDefs).length;
const unclassified = entries.filter((e) => !e.playKeys.length).map((e) => `${e.id} ${e.title}`);
const out = {
  meta: {
    count: entries.length,
    sampledAt: raw.sampledAt,
    firstSampledAt: '2026-11-04T07:18:09.288Z',
    source: '两批：research/kids-fantasy/data/steam-demand-2026-11-04.json（M01–M16）+ data/steam-expanded-2026-11-04.json（M17–M38）',
    method: `Steam storesearch + appdetails + SteamSpy appdetails + 商店页评测摘要 + Steam 社区近期评测文本抽样；扩样本：${raw.method}`,
    caveats: [...new Set([...(market.meta.caveats || []), ...raw.caveats])],
    coveredFamilies: covered.size,
    totalFamilies,
    uncoveredFamilies: Object.keys(catalog.meta.playDefs).filter((k) => !covered.has(k)),
    unclassified,
    systemGap: {
      conclusion: '新样本里又有 3 款落不进 23 族（连同首轮 Castle Crashers 共 4 款），核心都是战斗 / 对抗；分类体系缺的是「战斗 / 对抗」这一整类。',
      evidence: ['M10 Castle Crashers®', 'M36 Gang Beasts', 'M37 Duck Game', 'M38 Stick Fight: The Game'],
      decision: '本轮不新增族；只记入 README 的体系缺口一节。',
    },
    boundaries: [
      `价格、评测数、在线人数都是采样时点值（首轮 2026-11-04T07:18:09.288Z；扩样本 ${raw.sampledAt}），不是历史峰值或历史最低价。`,
      '评测数为 SteamSpy 全语言合计，与商店页英文子集口径可能不同。',
      '人数只认官方原文；原文没写「未获取」，不按标签或类目反推人数。',
      '玩法族映射是编者判据，不代表厂商或发行商分类。',
      `${covered.size}/${totalFamilies} 族有对照是「按空族定向补齐」的结果，不是随机抽样或市场统计。`,
      '本样本内仍为空 0 族只表示每族至少找到 1 款可核实条目；「本样本内反复未见」才是较弱信号，但仍不等于市场空白。',
      '未归类 4 款全部以战斗 / 对抗为核心，说明分类体系缺这一整类；本轮不新增族。',
    ],
  },
  entries,
};

fs.writeFileSync(path.join(root, 'data', 'market.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`已写入 data/market.json：${entries.length} 款（原 16 + 新 ${newEntries.length}）`);
console.log(`覆盖 ${covered.size}/${totalFamilies} 族；仍为空 ${out.meta.uncoveredFamilies.length} 族；未归类 ${unclassified.length} 款`);
console.log('未归类：', unclassified.join('、'));
console.log('未覆盖：', out.meta.uncoveredFamilies.join(',') || '（无）');
