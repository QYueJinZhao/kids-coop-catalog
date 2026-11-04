#!/usr/bin/env node
/**
 * 冒烟测试：真实 Chromium（playwright-core）打开 index.html，逐项断言。
 *
 * 用法：node scripts/smoke.mjs
 * 产物：smoke-report.json（逐项结果 + 汇总），失败时进程退出码 1。
 *
 * 覆盖：条目数、筛选组合、搜索、详情弹层、console error / pageerror /
 *       失败请求 / 外网请求、390px 横向溢出。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = pathToFileURL(path.join(root, 'index.html')).href;
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const entries = catalog.entries;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: String(detail ?? '') });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

function expected(filter) {
  return entries.filter(filter).length;
}

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

const cardCount = await page.locator('#grid .card').count();
check('条目数：列表渲染 224 条', cardCount === entries.length, `DOM ${cardCount} / 数据 ${entries.length}`);

const statsText = await page.locator('#stats').innerText();
check('头部统计显示收录 224', /收录\s*224\s*条/.test(statsText.replace(/\s+/g, ' ')), statsText.replace(/\s+/g, ' ').slice(0, 80));

// 筛选组合 1：玩法族 F01
await page.click('.chip[data-play="F01"]');
await page.waitForTimeout(60);
const n1 = await page.locator('#grid .card').count();
check('筛选：玩法族 F01', n1 === expected((e) => e.playKey === 'F01'), `DOM ${n1} / 预期 ${expected((e) => e.playKey === 'F01')}`);

// 筛选组合 2：F01 + 4P
await page.selectOption('select[data-key="players"]', '4P');
await page.waitForTimeout(60);
const n2 = await page.locator('#grid .card').count();
const exp2 = expected((e) => e.playKey === 'F01' && e.players.modes.includes('4P'));
check('筛选组合：F01 + 4P', n2 === exp2, `DOM ${n2} / 预期 ${exp2}`);

// 筛选组合 3：F01 + 4P + 门槛低
await page.selectOption('select[data-key="onboarding"]', '低');
await page.waitForTimeout(60);
const n3 = await page.locator('#grid .card').count();
const exp3 = expected((e) => e.playKey === 'F01' && e.players.modes.includes('4P') && e.onboarding === '低');
check('筛选组合：F01 + 4P + 门槛低', n3 === exp3, `DOM ${n3} / 预期 ${exp3}`);

const countText = await page.locator('#count').innerText();
check('计数文案随筛选更新', countText.includes(`显示 ${n3} / 224`), countText.slice(0, 90));

// 重置后搜索
await page.click('#reset');
await page.waitForTimeout(60);
const resetCount = await page.locator('#grid .card').count();
check('重置筛选回到 224', resetCount === entries.length, `DOM ${resetCount}`);

await page.fill('#q', '四角抬月');
await page.waitForTimeout(80);
const searchN = await page.locator('#grid .card').count();
check('搜索「四角抬月」命中 1 条', searchN === 1, `DOM ${searchN}`);
check('搜索结果含 A01', (await page.locator('#grid .card[data-id="A01"]').count()) === 1, 'A01 卡片存在');

await page.fill('#q', 'A41');
await page.waitForTimeout(80);
const searchN2 = await page.locator('#grid .card').count();
check('搜索编号「A41」命中 1 条', searchN2 === 1, `DOM ${searchN2}`);

await page.fill('#q', '月亮');
await page.waitForTimeout(80);
const searchN3 = await page.locator('#grid .card').count();
check('搜索「月亮」命中 > 0', searchN3 > 0, `DOM ${searchN3}`);

// 详情弹层：A01 原型结论
await page.fill('#q', '');
await page.click('#reset');
await page.waitForTimeout(80);
await page.click('#grid .card[data-id="A01"]');
await page.waitForSelector('.modal.open');
const modalText = await page.locator('#modalCard').innerText();
check('详情弹层打开 A01', modalText.includes('四角抬月'), modalText.split('\n')[0]);
check('详情显示原型实测与冒烟数', /72\/72/.test(modalText) && /原型/.test(modalText), '含 72/72 与原型段');
check('详情显示分类判据', modalText.includes('分类判据') && modalText.includes('S01'), '判据段存在');
check('详情显示来源指针', /ideas\.json|adventures\.json/.test(modalText), '含来源文件');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
check('Esc 关闭弹层', (await page.locator('.modal.open').count()) === 0, '已关闭');

// 390px 手机
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#grid .card');
await page.waitForTimeout(100);
const mobile = await page.evaluate(() => {
  const de = document.documentElement;
  const cards = Array.from(document.querySelectorAll('#grid .card'));
  return {
    docWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    bodyWidth: document.body.scrollWidth,
    maxCardRight: cards.length ? Math.max(...cards.map((c) => c.getBoundingClientRect().right)) : 0,
    innerWidth: window.innerWidth,
    overflowing: Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (el.closest('.chips')) return false; // 横向滚动容器内的 chip 属于预期内滚动
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).slice(0, 5).map((el) => el.className || el.tagName),
  };
});
check('390px 无页面级横向溢出', mobile.docWidth <= mobile.innerWidth + 1 && mobile.bodyWidth <= mobile.innerWidth + 1,
  `scrollWidth ${mobile.docWidth} / clientWidth ${mobile.clientWidth} / innerWidth ${mobile.innerWidth}`);
check('390px 卡片不超出视口', mobile.maxCardRight <= mobile.innerWidth + 1, `最右卡片 right=${mobile.maxCardRight.toFixed(1)}`);
check('390px 无越界元素', mobile.overflowing.length === 0, mobile.overflowing.join(', ') || '无');

// 手机端点开详情
await page.click('#grid .card[data-id="B17"]');
await page.waitForSelector('.modal.open');
const mobileModal = await page.evaluate(() => {
  const c = document.querySelector('.modal-card');
  const r = c.getBoundingClientRect();
  return { width: r.width, right: r.right, scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
});
check('390px 详情按全屏宽度且不溢出', mobileModal.right <= mobileModal.inner + 1 && mobileModal.scroll <= mobileModal.inner + 1,
  `modal ${mobileModal.width.toFixed(0)}px, scrollWidth ${mobileModal.scroll}`);
await page.keyboard.press('Escape');

// 网络与运行期错误
check('无 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('无失败请求', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
check('无外网请求', externalRequests.length === 0, externalRequests.slice(0, 3).join(' | '));
check('请求均为本地文件', allRequests.every((u) => /^(file:|data:|about:)/.test(u)), `共 ${allRequests.length} 个请求`);

await browser.close();

const passed = results.filter((r) => r.ok).length;
const total = results.length;
const report = {
  generatedAt: new Date().toISOString(),
  target: 'index.html',
  entries: entries.length,
  browser: 'Chrome (playwright-core, headless)',
  summary: { total, passed, failed: total - passed },
  requests: { total: allRequests.length, external: externalRequests.slice(0, 10), failed: failedRequests.slice(0, 10) },
  consoleErrors: consoleErrors.slice(0, 20),
  pageErrors: pageErrors.slice(0, 20),
  results,
};
fs.writeFileSync(path.join(root, 'smoke-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n冒烟汇总：${passed}/${total} 通过`);
if (passed !== total) process.exit(1);
