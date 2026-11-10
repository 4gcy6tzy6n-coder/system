// 过瑞数反爬，探查 zhjw 正方教务系统的空闲教室查询入口
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto('http://zhjw.uibe.edu.cn/', { waitUntil: 'domcontentloaded' }).catch(e => console.log('goto:', e.message));
  await page.waitForTimeout(8000); // 等瑞数挑战完成并跳转

  console.log('URL after challenge:', page.url());
  console.log('title:', await page.title());
  fs.writeFileSync('raw/zhjw_browser.html', await page.content());
  await page.screenshot({ path: 'raw/zhjw_browser.png', fullPage: true });

  // 收集所有链接
  const links = await page.$$eval('a[href]', as => as.map(a => [a.getAttribute('href'), a.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)]));
  console.log('links:', JSON.stringify(links.slice(0, 50), null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
