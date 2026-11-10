// 通过 CDP 查看 zhjw 当前页面的链接和文本（登录前侦察）
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhjw'));
  if (!page) { console.log('no zhjw tab'); process.exit(1); }

  console.log('URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200));
  console.log('TEXT:', text);
  const links = await page.$$eval('a[href]', as => as.map(a => [a.getAttribute('href'), a.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)]).filter(x => x[1]));
  console.log('LINKS:');
  for (const [h, t] of links) console.log(' ', h, '|', t);
  await page.screenshot({ path: 'raw/zhjw_home.png', fullPage: false });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
