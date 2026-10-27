'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const deps = ['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const { chromium } = require(require.resolve('playwright', { paths: deps }));
const sharp = require(require.resolve('sharp', { paths: deps }));
const { open, boxes } = require('./Test-MaterialMotion38.cjs');
sharp.concurrency(1); sharp.cache({ memory: 16, files: 0 });
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'local53-rollback');
const ids = ['terran', 'protoss', 'zerg'];
const rejected = /console-environment|console52/i;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = { success: false, viewport: { width: 1600, height: 1000 }, view: 'profile', cases: [], previews: [], errors: [], rejectedRequests: [] };

function compare(actual, baseline, label) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(baseline).sort(), label + ': geometry groups');
  for (const key of Object.keys(baseline)) {
    assert.equal(actual[key].length, baseline[key].length, label + ': ' + key);
    for (let i = 0; i < baseline[key].length; i++) for (let j = 0; j < 4; j++)
      assert.ok(Math.abs(actual[key][i][j] - baseline[key][i][j]) < .1, label + ': ' + key + ' bounds');
  }
}
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect.getTiming().iterations !== Infinity) { try { animation.finish(); } catch {} }
      else { animation.pause(); animation.currentTime = 0; }
    }
    for (const name of ['DSCampaignInteriors', 'DSTerranInstruments', 'DSProtossPylon', 'DSEquipmentActivity', 'DSProtossPower']) window[name]?.seek?.(2000);
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.ok(!rejected.test(fs.readFileSync(path.join(root, 'wwwroot/index.html'), 'utf8')), 'index must not reference rejected runtime');
  const previews = JSON.parse(fs.readFileSync(path.join(root, 'assets/themes/preview-sources.json'), 'utf8'));
  for (const id of ids) {
    const asset = previews.assets.find(entry => entry.theme === id);
    assert.ok(asset, id + ': preview metadata');
    assert.equal(asset.version, '1.1.7-local.51', id + ': restored preview version');
    assert.equal(asset.generator, 'verification/Refresh-Equipment51Previews.cjs');
    const bytes = fs.readFileSync(path.join(root, asset.path));
    assert.equal(hash(bytes), asset.sha256, id + ': recorded preview hash');
    const expected = await sharp(path.join(__dirname, 'local51-equipment', id + '-profile-1600.png')).resize({ width: 600 }).webp({ quality: 92 }).toBuffer();
    assert.equal(hash(bytes), hash(expected), id + ': preview matches actual local51 source capture');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, asset.width); assert.equal(metadata.height, asset.height);
    report.previews.push({ id, source: 'verification/local51-equipment/' + id + '-profile-1600.png', sha256: hash(bytes), restoredLocal51: true });
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // Install listeners before the shared open helper navigates, so rejected
  // requests and early runtime errors cannot escape rollback validation.
  const monitoredBrowser = { newPage: async options => {
    const page = await browser.newPage(options);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => { if (rejected.test(request.url())) report.rejectedRequests.push(request.url()); });
    return page;
  } };
  try {
    const baselinePage = await open(monitoredBrowser, 'default', 1600, 1000, 'profile');
    await settle(baselinePage);
    const baseline = await boxes(baselinePage);
    await baselinePage.close();
    for (const id of ids) {
      const page = await open(monitoredBrowser, id, 1600, 1000, 'profile');
      await page.waitForFunction(() => window.DSEquipmentActivity?.diagnostics().filter(item => item.ready).length >= (document.documentElement.dataset.graphicalStyle === 'terran' ? 2 : 1));
      await settle(page);
      const geometry = await boxes(page);
      compare(geometry, baseline, id);
      const forbidden = await page.evaluate(() => ({
        runtime: typeof window.DSConsoleEnvironment !== 'undefined',
        elements: [...document.querySelectorAll('[class],[id],script[src],link[href]')].filter(element => /console-environment|console52/i.test([element.className, element.id, element.getAttribute('src'), element.getAttribute('href')].join(' '))).map(element => element.outerHTML.slice(0, 250)),
        resources: performance.getEntriesByType('resource').filter(entry => /console-environment|console52/i.test(entry.name)).map(entry => entry.name)
      }));
      assert.deepEqual(forbidden, { runtime: false, elements: [], resources: [] }, id + ': rejected environment absent');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id + ': horizontal overflow');
      const screenshot = id + '-profile-1600.png';
      await page.screenshot({ path: path.join(out, screenshot), animations: 'allow' });
      report.cases.push({ id, defaultGeometry: true, geometry, rejectedEnvironmentAbsent: true, screenshot });
      await page.close();
    }
    assert.deepEqual(report.rejectedRequests, [], 'no rejected environment requests from initial navigation onwards');
    assert.deepEqual(report.errors, [], 'no page errors');
    report.success = true;
  } finally { await browser.close(); }
  console.log(JSON.stringify({ success: true, cases: report.cases.length, restoredPreviews: report.previews.length }));
}
if (require.main === module) main().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
});
