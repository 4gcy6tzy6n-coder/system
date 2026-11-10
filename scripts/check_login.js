// 通过 CDP 连接已打开的 Chrome，报告各标签页登录状态
// 用法: node scripts/check_login.js
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const contexts = browser.contexts();
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      // 简单登录判定：URL 或正文含 login/logon/登录 且无"退出/注销"
      let hint = '';
      try {
        const body = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
        const loggedIn = /退出|注销|注销登录|欢迎|个人中心|我的/.test(body) && !/统一身份|账号登录/.test(body.slice(0, 200));
        const loginPage = /login|logon|cas|auth/i.test(url) || /登录|统一身份/.test(body.slice(0, 300));
        hint = loginPage && !loggedIn ? '登录页' : (loggedIn ? '疑似已登录' : '未知状态');
      } catch (e) { hint = '(无法读取: ' + e.message + ')'; }
      console.log(JSON.stringify({ url, title: title.slice(0, 50), hint }));
    }
  }
  await browser.close(); // 只断开 CDP 连接，不关浏览器
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
