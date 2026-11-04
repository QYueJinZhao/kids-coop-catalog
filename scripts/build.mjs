#!/usr/bin/env node
/**
 * 站点构建：data/catalog.json（自有 224 条）+ data/market.json（市面 16 款）
 *            + scripts/template.html → index.html（单文件，file:// 可直接打开）
 *
 * 用法：node scripts/build.mjs
 * 产物：index.html（数据内联，无外网依赖、无服务端、无第三方库）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'catalog.json');
const marketPath = path.join(root, 'data', 'market.json');
const templatePath = path.join(root, 'scripts', 'template.html');
const outPath = path.join(root, 'index.html');

const catalog = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const market = JSON.parse(fs.readFileSync(marketPath, 'utf8'));
const template = fs.readFileSync(templatePath, 'utf8');

/* ---------- 构建前校验：宁可失败，不生成半成品 ---------- */
const errors = [];
const ids = new Set();
const required = ['id', 'title', 'pool', 'playKey', 'oneLiner', 'coreVerb', 'players', 'age', 'session', 'onboarding', 'mood', 'platform', 'price', 'evidence', 'fit', 'why', 'source'];
const allowed = {
  onboarding: new Set(['低', '中', '高', '未获取']),
  mood: new Set(['滑稽', '温暖', '惊奇', '紧张', '轻快', '未获取']),
  'evidence.level': new Set(['E0', 'E1', 'E2', 'E3']),
  'session.band': new Set(['≤1 分钟', '1–3 分钟', '3–5 分钟', '5 分钟+', '未获取']),
};

function checkCommon(e, i, origin) {
  if (ids.has(e.id)) errors.push(`重复 id：${e.id}`);
  ids.add(e.id);
  required.forEach((k) => {
    if (k === 'fit' && origin === 'market') return; // 市面条目不做评分
    if (e[k] == null || e[k] === '') errors.push(`第 ${i} 条 ${e.id} 缺字段 ${k}`);
  });
  if (!allowed.onboarding.has(e.onboarding)) errors.push(`${e.id} 门槛值非法：${e.onboarding}`);
  if (!allowed.mood.has(e.mood)) errors.push(`${e.id} 情绪值非法：${e.mood}`);
  if (!allowed['evidence.level'].has(e.evidence.level)) errors.push(`${e.id} 证据等级非法：${e.evidence.level}`);
  if (!allowed['session.band'].has(e.session.band)) errors.push(`${e.id} 时长档非法：${e.session.band}`);
  if (origin === 'own') {
    if (!catalog.meta.playDefs[e.playKey]) errors.push(`${e.id} 的玩法族 ${e.playKey} 不在 meta.playDefs`);
    if (!Array.isArray(e.players.modes) || e.players.modes.length === 0) errors.push(`${e.id} 无成立人数`);
    if (typeof e.fit !== 'number' || e.fit < 1 || e.fit > 5) errors.push(`${e.id} 适配分非法：${e.fit}`);
  }
}

catalog.entries.forEach((e, i) => checkCommon(e, i, 'own'));
market.entries.forEach((e, i) => {
  checkCommon(e, i, 'market');
  if (e.origin !== 'market') errors.push(`${e.id} origin 必须为 market`);
  if (e.evidence.level !== 'E3') errors.push(`${e.id} 市面条目证据等级必须为 E3`);
  if (!Array.isArray(e.playKeys)) errors.push(`${e.id} 缺 playKeys`);
  if (e.playKeys.length) {
    e.playKeys.forEach((k) => {
      if (!catalog.meta.playDefs[k]) errors.push(`${e.id} 映射到不存在的玩法族 ${k}`);
    });
  } else if (e.playKey !== 'UNMAPPED') {
    errors.push(`${e.id} 未归类条目的 playKey 应为 UNMAPPED`);
  }
  if (!e.steamUrl) errors.push(`${e.id} 缺 Steam 链接`);
  if (e.fit !== null) errors.push(`${e.id} 市面条目不应有适配分（避免做优劣评分）`);
});
if (catalog.entries.length !== catalog.meta.entryCount) {
  errors.push(`meta.entryCount=${catalog.meta.entryCount} 与实际 ${catalog.entries.length} 不一致`);
}
if (market.entries.length !== market.meta.count) {
  errors.push(`market.meta.count=${market.meta.count} 与实际 ${market.entries.length} 不一致`);
}
if (errors.length) {
  console.error('构建校验失败：');
  errors.slice(0, 30).forEach((x) => console.error(' - ' + x));
  process.exit(1);
}

const own = catalog.entries.map((e) => ({ ...e, origin: 'own', playKeys: [e.playKey] }));
const marketEntries = market.entries.map((e) => ({ ...e }));
const entries = [...own, ...marketEntries];

const combined = {
  meta: {
    ...catalog.meta,
    version: '1.1',
    subtitle: `自有 ${own.length} 条 + 市面对照 ${marketEntries.length} 款，按玩法族并列可筛`,
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    ownCount: own.length,
    marketCount: marketEntries.length,
    evidenceNote: '全库 E2（真人试玩）= 0。4 条自有条目有 HTML 原型 + 合成代理实测（E1）；220 条为 E0；16 款市面对照为 E3（外部可核实事实，不是试玩证据）。',
    gaps: [
      ...catalog.meta.gaps.filter((g) => !g.startsWith('外部商业同类未接入')),
      `市面对照只覆盖 ${market.meta.coveredFamilies}/${market.meta.totalFamilies} 个玩法族；「本样本内未见同族」不等于市场空白。`,
      ...market.meta.boundaries,
    ],
    marketMeta: market.meta,
  },
  entries,
};

/* 内联 JSON：转义 < 防止提前闭合 script 标签 */
const json = JSON.stringify(combined).replace(/</g, '\\u003c');
const html = template.replace('__DATA__', json);
if (!html.includes('id="catalog-data"')) {
  console.error('模板缺少 catalog-data 容器');
  process.exit(1);
}
fs.writeFileSync(outPath, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`已生成 index.html：${entries.length} 条（自有 ${own.length} + 市面 ${marketEntries.length}），${kb} KB，数据内联`);
console.log(`玩法族 ${Object.keys(catalog.meta.playDefs).length} 类；市面覆盖 ${market.meta.coveredFamilies} 类；E1 ${own.filter((e) => e.evidence.level === 'E1').length} 条；E3 ${marketEntries.length} 条`);
