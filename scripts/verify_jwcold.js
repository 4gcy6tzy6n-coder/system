// 真实浏览器验证 jwcold 教室使用情况查询是否能查到数据
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const requests = [];
  page.on('request', r => {
    if (r.resourceType() === 'xhr' || r.resourceType() === 'fetch' || r.method() === 'POST')
      requests.push(`${r.method()} ${r.url()}`);
  });

  await page.goto('https://jwcold.uibe.edu.cn/classroom/ClassroomShow.aspx', { waitUntil: 'networkidle' });

  // 填表并提交
  await page.selectOption('#ddlJiaoXueLou', '博学楼');
  await page.fill('#txtRiQi', '2026-11-11');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.click('#btnQuery'),
  ]);
  await page.waitForTimeout(3000); // 等 DevExpress 回调

  const html = await page.content();
  require('fs').writeFileSync('raw/jwcold_browser_result.html', html);
  await page.screenshot({ path: 'raw/jwcold_browser_result.png', fullPage: true });

  const dataRows = await page.$$eval('tr', trs =>
    trs.filter(t => /dxgvDataRow|DXDataRow/.test(t.className + t.id)).length);
  const emptyRow = await page.$$eval('tr', trs =>
    trs.filter(t => /dxgvEmptyDataRow/.test(t.className)).map(t => t.textContent.trim()));
  const headerCells = await page.$$eval('#gvClassroom_DXHeaderTable td', tds =>
    tds.map(t => t.textContent.trim()).filter(Boolean));

  console.log('URL:', page.url());
  console.log('grid data rows:', dataRows);
  console.log('empty-row text:', JSON.stringify(emptyRow));
  console.log('headers:', JSON.stringify(headerCells));
  console.log('POST/XHR traffic:', JSON.stringify(requests, null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
