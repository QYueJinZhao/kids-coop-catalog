#!/usr/bin/env node
/**
 * 站点构建：data/catalog.json + scripts/template.html → index.html（单文件，file:// 可直接打开）
 *
 * 用法：node scripts/build.mjs
 * 产物：index.html（数据内联，无外网依赖、无服务端、无第三方库）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'catalog.json');
const templatePath = path.join(root, 'scripts', 'template.html');
const outPath = path.join(root, 'index.html');

const catalog = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const template = fs.readFileSync(templatePath, 'utf8');

/* ---------- 构建前校验：宁可失败，不生成半成品 ---------- */
const errors = [];
const ids = new Set();
const required = ['id', 'title', 'pool', 'playKey', 'oneLiner', 'coreVerb', 'players', 'age', 'session', 'onboarding', 'mood', 'platform', 'price', 'evidence', 'fit', 'why', 'source'];
const allowed = {
  onboarding: new Set(['低', '中', '高']),
  mood: new Set(['滑稽', '温暖', '惊奇', '紧张', '轻快']),
  'evidence.level': new Set(['E0', 'E1', 'E2']),
  'session.band': new Set(['≤1 分钟', '1–3 分钟', '3–5 分钟', '5 分钟+']),
};

catalog.entries.forEach((e, i) => {
  if (ids.has(e.id)) errors.push(`重复 id：${e.id}`);
  ids.add(e.id);
  required.forEach((k) => {
    if (e[k] == null || e[k] === '') errors.push(`第 ${i} 条 ${e.id} 缺字段 ${k}`);
  });
  if (!catalog.meta.playDefs[e.playKey]) errors.push(`${e.id} 的玩法族 ${e.playKey} 不在 meta.playDefs`);
  if (!allowed.onboarding.has(e.onboarding)) errors.push(`${e.id} 门槛值非法：${e.onboarding}`);
  if (!allowed.mood.has(e.mood)) errors.push(`${e.id} 情绪值非法：${e.mood}`);
  if (!allowed['evidence.level'].has(e.evidence.level)) errors.push(`${e.id} 证据等级非法：${e.evidence.level}`);
  if (!allowed['session.band'].has(e.session.band)) errors.push(`${e.id} 时长档非法：${e.session.band}`);
  if (!Array.isArray(e.players.modes) || e.players.modes.length === 0) errors.push(`${e.id} 无成立人数`);
  if (typeof e.fit !== 'number' || e.fit < 1 || e.fit > 5) errors.push(`${e.id} 适配分非法：${e.fit}`);
});
if (catalog.entries.length !== catalog.meta.entryCount) {
  errors.push(`meta.entryCount=${catalog.meta.entryCount} 与实际 ${catalog.entries.length} 不一致`);
}
if (errors.length) {
  console.error('构建校验失败：');
  errors.slice(0, 30).forEach((x) => console.error(' - ' + x));
  process.exit(1);
}

/* 内联 JSON：转义 < 防止提前闭合 script 标签 */
const json = JSON.stringify(catalog).replace(/</g, '\\u003c');
const html = template.replace('__DATA__', json);
if (!html.includes('id="catalog-data"')) {
  console.error('模板缺少 catalog-data 容器');
  process.exit(1);
}
fs.writeFileSync(outPath, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`已生成 index.html：${catalog.entries.length} 条，${kb} KB，数据内联`);
console.log(`玩法族 ${Object.keys(catalog.meta.playDefs).length} 类；E1 条目 ${catalog.entries.filter((e) => e.evidence.level === 'E1').length} 条`);
