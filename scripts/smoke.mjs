#!/usr/bin/env node
/**
 * 冒烟测试：真实 Chromium（playwright-core）打开 index.html，逐项断言。
 *
 * 用法：node scripts/smoke.mjs
 * 产物：smoke-report.json（逐项结果 + 汇总），失败时进程退出码 1。
 *
 * 覆盖：自有 + 市面两类筛选、玩法族筛选、玩法族对照视图、搜索、两种条目详情、
 *       console error / pageerror / 失败请求 / 外网请求、390px 横向溢出。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = pathToFileURL(path.join(root, 'index.html')).href;
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const market = JSON.parse(fs.readFileSync(path.join(root, 'data', 'market.json'), 'utf8'));
const own = catalog.entries;
const all = [...own, ...market.entries];
const total = all.length;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: String(detail ?? '') });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
function countBy(filter) { return all.filter(filter).length; }
function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const externalRequests = [];
const allRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
page.on('requestfailed', (r) => failedRequests.push(r.url() + ' :: ' + (r.failure() && r.failure().errorText)));
page.on('request', (r) => {
  allRequests.push(r.url());
  if (!/^(file:|data:|about:)/.test(r.url())) externalRequests.push(r.url());
});

await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForSelector('#grid .card', { timeout: 5000 });

/* ---------- 1. 总量与统计 ---------- */
const cardCount = await page.locator('#grid .card').count();
check(`条目数：列表渲染 ${total} 条（自有 ${own.length} + 市面 ${market.entries.length}）`,
  cardCount === total, `DOM ${cardCount} / 数据 ${total}`);

const statsText = (await page.locator('#stats').innerText()).replace(/\s+/g, ' ');
check('头部统计：收录 240 / 自有 224 · 市面 16',
  new RegExp(`收录 ${total} 条`).test(statsText) && /自有 224 · 市面 16/.test(statsText), statsText.slice(0, 120));
check('头部统计：市面覆盖 12 类', /市面覆盖 12 类/.test(statsText), statsText.slice(0, 160));

/* ---------- 2. 两类筛选 ---------- */
await page.click('.chip[data-origin="market"]');
await page.waitForTimeout(60);
const marketCards = await page.locator('#grid .card').count();
const marketOnly = await page.locator('#grid .card[data-origin="market"]').count();
check('筛选：市面对照 16 条', marketCards === market.entries.length && marketOnly === market.entries.length,
  `DOM ${marketCards} / market 卡片 ${marketOnly} / 数据 ${market.entries.length}`);

await page.click('.chip[data-origin="own"]');
await page.waitForTimeout(60);
const ownCards = await page.locator('#grid .card[data-origin="own"]').count();
check('筛选：自有创意 224 条', ownCards === own.length, `DOM ${ownCards} / 数据 ${own.length}`);

await page.click('#reset');
await page.waitForTimeout(60);
check('重置来源筛选回到 240', (await page.locator('#grid .card').count()) === total, '已回到全部');

/* ---------- 3. 玩法族筛选（自有 + 市面同族） ---------- */
const f01All = countBy((e) => (e.playKeys || [e.playKey]).includes('F01'));
await page.click('.chip[data-play="F01"]');
await page.waitForTimeout(60);
check('筛选：玩法族 F01（自有+市面）', (await page.locator('#grid .card').count()) === f01All,
  `DOM ${await page.locator('#grid .card').count()} / 预期 ${f01All}`);
check('F01 列表含市面 Overcooked! 2', (await page.locator('#grid .card[data-id="M01"]').count()) === 1, 'M01 在列');

await page.click('.chip[data-origin="market"]');
await page.waitForTimeout(60);
const f01Market = countBy((e) => e.origin === 'market' && e.playKeys.includes('F01'));
check('组合筛选：F01 + 市面', (await page.locator('#grid .card').count()) === f01Market, `预期 ${f01Market}`);

await page.click('#reset');
await page.waitForTimeout(60);

/* ---------- 4. 玩法族对照视图 ---------- */
await page.click('#tabCompare');
await page.waitForTimeout(120);
const rows = await page.locator('#compare .crow').count();
check('对照视图：23 个玩法族 + 1 个未归类行', rows === 24, `DOM ${rows}`);
check('对照视图打开后列表隐藏',
  (await page.locator('#grid').isVisible()) === false && (await page.locator('#originFacet').isVisible()) === false,
  'grid/origin facet 已隐藏');

const rowF05 = page.locator('#compare .crow[data-row="F05"]');
check('对照行 F05 标为「本样本内已有」', (await rowF05.locator('.tag.has').count()) === 1, 'tag.has 存在');
check('对照行 F05 右栏含 Overcooked! 2', (await rowF05.innerText()).includes('Overcooked! 2'), '市面侧有 M01');
const rowF04 = page.locator('#compare .crow[data-row="F04"]');
check('对照行 F04 标为「本样本内未见对照」', (await rowF04.locator('.tag.none').count()) === 1, 'tag.none 存在');
check('F04 左栏仍有自有条目', (await rowF04.locator('.mini').count()) > 0, `mini ${await rowF04.locator('.mini').count()}`);
const unmapped = page.locator('#compare .crow[data-row="UNMAPPED"]');
check('未归类行含 Castle Crashers', (await unmapped.innerText()).includes('Castle Crashers'), 'M10 在未归类行');

/* 对照视图内玩法族筛选 */
await page.click('.chip[data-play="F05"]');
await page.waitForTimeout(80);
check('对照视图 + 玩法族 F05 只剩 1 行', (await page.locator('#compare .crow').count()) === 1, '单行对照');
await page.click('.chip[data-play=""]');
await page.waitForTimeout(80);

/* 对照视图内搜索 */
await page.fill('#q', 'PICO PARK');
await page.waitForTimeout(100);
const searchRows = await page.locator('#compare .crow').count();
const f02Row = page.locator('#compare .crow[data-row="F02"]');
check('对照视图搜索「PICO PARK」只留有内容的行', searchRows === 2, `DOM ${searchRows}`);
check('F02 行右栏含 PICO PARK', (await f02Row.innerText()).includes('PICO PARK'), '搜索命中映射行');

/* 对照视图点进市面详情 */
await page.locator('#compare .mini[data-id="M03"]').first().click();
await page.waitForSelector('.modal.open');
const m3 = await page.locator('#modalCard').innerText();
check('对照行可打开市面详情 M03', m3.includes('PICO PARK') && m3.includes('M03'), m3.split('\n')[0]);
check('市面详情有官方人数原文与 E3', m3.includes('官方支持人数') && /2-8 players/.test(m3) && m3.includes('E3'), '含原文与 E3');
check('市面详情有映射判据与谱系关联', m3.includes('映射判据') && m3.includes('机制谱系关联'), '两段都在');
check('市面详情不做适配分评分', !m3.includes('适配分'), '无适配分');
check('市面详情有 Steam 商店页链接', (await page.locator('#modalCard a.btn-link').getAttribute('href')) === 'https://store.steampowered.com/app/1509960/', 'appid 1509960');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);

/* ---------- 5. 回到列表：搜索与市面详情 ---------- */
await page.click('#tabList');
await page.waitForTimeout(80);
await page.fill('#q', '');
await page.click('#reset');
await page.waitForTimeout(80);

await page.fill('#q', 'PICO PARK');
await page.waitForTimeout(80);
check('搜索「PICO PARK」命中 2 款市面游戏', (await page.locator('#grid .card').count()) === 2,
  `DOM ${await page.locator('#grid .card').count()}`);

await page.fill('#q', 'Overcooked');
await page.waitForTimeout(80);
const ovTotal = await page.locator('#grid .card').count();
const ovMarket = await page.locator('#grid .card[data-origin="market"]').count();
check('搜索「Overcooked」命中 2 款市面 + 谱系提及 1 条自有',
  ovMarket === 2 && ovTotal === 3 && (await page.locator('#grid .card[data-id="M02"]').count()) === 1,
  `DOM ${ovTotal}（市面 ${ovMarket}）`);

await page.fill('#q', 'A41');
await page.waitForTimeout(80);
check('搜索编号「A41」仍精确命中 1 条', (await page.locator('#grid .card').count()) === 1, '精确编号优先');

await page.fill('#q', '');
await page.click('#reset');
await page.waitForTimeout(80);
await page.click('#grid .card[data-id="M01"]');
await page.waitForSelector('.modal.open');
const m1 = await page.locator('#modalCard').innerText();
check('市面详情 M01 显示初始价/采样价', m1.includes('初始价 / 采样价') && /48\.49/.test(m1) && /16\.48/.test(m1), '价格字段在');
check('市面详情 M01 显示评测数与采样时间', /72,?801/.test(m1) && m1.includes('2026-11-04'), '评测/采样时间在');
check('市面详情 M01 有「未获取」或口径说明', m1.includes('未获取') || m1.includes('采样时点'), '边界说明');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);

/* 自有条目详情回归 */
await page.click('#grid .card[data-id="A01"]');
await page.waitForSelector('.modal.open');
const a01 = await page.locator('#modalCard').innerText();
check('自有详情 A01 仍显示原型实测 72/72 与判据', /72\/72/.test(a01) && a01.includes('分类判据') && a01.includes('S01'), 'A01 详情正常');
check('自有详情 A01 显示适配分', a01.includes('适配分'), '自有评分保留');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);

/* ---------- 6. 390px ---------- */
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#grid .card');
await page.waitForTimeout(100);
const mobileList = await page.evaluate(() => {
  const de = document.documentElement;
  const cards = Array.from(document.querySelectorAll('#grid .card'));
  return {
    docWidth: de.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    maxCardRight: cards.length ? Math.max(...cards.map((c) => c.getBoundingClientRect().right)) : 0,
    overflowing: Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (el.closest('.chips')) return false; // 横向滚动容器内的 chip 属于预期内滚动
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).slice(0, 5).map((el) => el.className || el.tagName),
  };
});
check('390px 列表无页面级横向溢出', mobileList.docWidth <= mobileList.innerWidth + 1 && mobileList.bodyWidth <= mobileList.innerWidth + 1,
  `scrollWidth ${mobileList.docWidth} / innerWidth ${mobileList.innerWidth}`);
check('390px 卡片不超出视口', mobileList.maxCardRight <= mobileList.innerWidth + 1, `最右卡片 right=${mobileList.maxCardRight.toFixed(1)}`);
check('390px 无越界元素', mobileList.overflowing.length === 0, mobileList.overflowing.join(', ') || '无');

await page.click('#tabCompare');
await page.waitForTimeout(120);
const mobileCompare = await page.evaluate(() => {
  const de = document.documentElement;
  return {
    docWidth: de.scrollWidth,
    innerWidth: window.innerWidth,
    rows: document.querySelectorAll('#compare .crow').length,
    overflowing: Array.from(document.querySelectorAll('#compare *')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).slice(0, 5).map((el) => el.className || el.tagName),
  };
});
check('390px 对照视图无横向溢出', mobileCompare.docWidth <= mobileCompare.innerWidth + 1,
  `scrollWidth ${mobileCompare.docWidth} / innerWidth ${mobileCompare.innerWidth}`);
check('390px 对照视图单列不越界', mobileCompare.overflowing.length === 0 && mobileCompare.rows === 24,
  mobileCompare.overflowing.join(', ') || `无越界 · ${mobileCompare.rows} 行`);

/* 手机端点开市面详情 */
await page.locator('#compare .mini[data-id="M04"]').first().click();
await page.waitForSelector('.modal.open');
const mobileModal = await page.evaluate(() => {
  const c = document.querySelector('.modal-card');
  const r = c.getBoundingClientRect();
  return { width: r.width, right: r.right, scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
});
check('390px 市面详情全屏宽度且不溢出', mobileModal.right <= mobileModal.inner + 1 && mobileModal.scroll <= mobileModal.inner + 1,
  `modal ${mobileModal.width.toFixed(0)}px, scrollWidth ${mobileModal.scroll}`);
await page.keyboard.press('Escape');

/* ---------- 7. 网络与运行期错误 ---------- */
check('无 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('无失败请求', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
check('无外网请求', externalRequests.length === 0, externalRequests.slice(0, 3).join(' | '));
check('请求均为本地文件', allRequests.every((u) => /^(file:|data:|about:)/.test(u)), `共 ${allRequests.length} 个请求`);

await browser.close();

const passed = results.filter((r) => r.ok).length;
const totalChecks = results.length;
const report = {
  generatedAt: new Date().toISOString(),
  target: 'index.html',
  entries: { total, own: own.length, market: market.entries.length },
  browser: 'Chrome (playwright-core, headless)',
  summary: { total: totalChecks, passed, failed: totalChecks - passed },
  requests: { total: allRequests.length, external: externalRequests.slice(0, 10), failed: failedRequests.slice(0, 10) },
  consoleErrors: consoleErrors.slice(0, 20),
  pageErrors: pageErrors.slice(0, 20),
  results,
};
fs.writeFileSync(path.join(root, 'smoke-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n冒烟汇总：${passed}/${totalChecks} 通过（${fmt(total)} 条 = 自有 ${own.length} + 市面 ${market.entries.length}）`);
if (passed !== totalChecks) process.exit(1);
