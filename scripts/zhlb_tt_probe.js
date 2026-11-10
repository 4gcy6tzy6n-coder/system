// 批量试调 zhlb 排课/房间目录 API —— 每次调用现读 csrfToken Cookie
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  const out = await page.evaluate(async () => {
    const csrf = () => (document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/) || [])[1] || '';
    const call = async (name, body) => {
      const r = await fetch(`/banpai/platform/apis?actionName=${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/plain, */*',
          'x-csrf-token': csrf(),
          'x-school-id': '002',
        },
        body: JSON.stringify(body || {}),
      });
      return (await r.text()).slice(0, 1200);
    };
    const res = {};
    const day = '2026-11-11';
    // 房间目录
    res.RoomTree = await call('GetV2SchoolBuildingRoomTree', {});
    res.RoomQuery2 = await call('PostV1SchoolBuildingRoomQuery', { schoolUid: '002' });
    // 作息节次
    res.Periods = await call('GetV1TimetableScheduleTablePeriodGet', {});
    // 课表
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
    console.log(v.replace(/\s+/g, ' ').slice(0, 600));
    console.log();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
