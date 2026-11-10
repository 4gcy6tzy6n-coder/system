// 从 CDP Chrome（端口 9333）导出 zhlb 登录 Cookie → data/zhlb_cookies.json（供 site/server.js 实时调用教务接口）
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const cookies = await ctx.cookies('https://zhlb.uibe.edu.cn');
  const jar = {};
  for (const c of cookies) jar[c.name] = c.value;
  if (!jar['connect.sid'] && !jar['sw_sid']) {
    console.error('未找到登录会话 Cookie，请先在 Chrome 窗口登录 zhlb.uibe.edu.cn');
    process.exit(2);
  }
  const out = { savedAt: new Date().toISOString(), cookies: jar };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'zhlb_cookies.json'), JSON.stringify(out, null, 1));
  console.log('已导出', Object.keys(jar).length, '个 Cookie → data/zhlb_cookies.json');
  console.log('字段:', Object.keys(jar).join(', '));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
