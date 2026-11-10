// zhlb 会话工具：确保有 zhlb 标签页（自愈），验证登录态；附带排课 API 探测
// 用法: node scripts/zhlb_session.js [probe]
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');

const CDP = 'http://127.0.0.1:9333';
const ZHLB_PORTAL = 'https://zhlb.uibe.edu.cn/mf/edu-platform/main/portal';

function httpPut(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.end();
  });
}

async function ensureTab(ctx) {
  let page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) {
    await httpPut(`${CDP}/json/new?${encodeURIComponent(ZHLB_PORTAL)}`).catch(() => {});
    for (let i = 0; i < 20 && !page; i++) {
      await new Promise(r => setTimeout(r, 500));
      page = ctx.pages().find(p => p.url().includes('zhlb'));
    }
  }
  return page;
}

async function main() {
  let browser;
  for (let i = 0; i < 6; i++) {
    try { browser = await chromium.connectOverCDP(CDP); break; }
    catch (e) {
      await httpPut(`${CDP}/json/new?about:blank`).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!browser) throw new Error('CDP 连接失败');
  const ctx = browser.contexts()[0];
  const page = await ensureTab(ctx);
  if (!page) throw new Error('无法建立 zhlb 标签页');

  if (!/\/mf\/edu-platform\/main\/portal/.test(page.url())) {
    await page.goto(ZHLB_PORTAL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  const url = page.url();
  const loggedIn = !/config-login|\/uc\//.test(url);
  console.log('zhlb tab:', url, '| 登录态:', loggedIn ? 'OK' : '需要重新登录');
  if (!loggedIn) { await browser.close(); process.exit(2); }

  if (process.argv[2] === 'probe') {
    const out = await page.evaluate(async () => {
      const csrf = () => (document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/) || [])[1] || '';
      const call = async (name, body) => {
        const r = await fetch(`/banpai/platform/apis?actionName=${name}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'accept': 'application/json, text/plain, */*', 'x-csrf-token': csrf(), 'x-school-id': '002' },
          body: JSON.stringify(body || {}),
        });
        return (await r.text()).slice(0, 1500);
      };
      const res = {};
      const day = '2026-11-11';
      res.RoomTree = await call('GetV2SchoolBuildingRoomTree', {});
      res.RoomQuery2 = await call('PostV1SchoolBuildingRoomQuery', { schoolUid: '002' });
      res.Periods = await call('GetV1TimetableScheduleTablePeriodGet', {});
      res.CourseTT1 = await call('PostV1TimetableListCourseTimetable', { page: 1, pageSize: 5 });
      res.TTByDate = await call('PostV1TimetableGetByDate', { date: day });
      res.TTCountByDate = await call('PostV1TimetableCountByDate', { date: day });
      res.RoomRel = await call('GetV1TimetableRoomScheduleRelList', {});
      res.CurTTByRoom = await call('PostMofangyunLocal18898MfTimetableApiGetCurrentTimetableByRoom', {});
      res.SchedTables = await call('PostV1TimetableScheduleTableListGet', { page: 1, pageSize: 5 });
      return res;
    });
    fs.writeFileSync('data/zhlb_timetable_probe2.json', JSON.stringify(out, null, 1));
    for (const [k, v] of Object.entries(out)) {
      console.log(`=== ${k} ===`);
      console.log(v.replace(/\s+/g, ' ').slice(0, 700));
      console.log();
    }
  }
  await browser.close();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
