// 系统探测 zhlb 房间目录/日历/日程 API 的参数格式
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }
  const hdrs = JSON.parse(fs.readFileSync('data/zhlb_real_headers.json', 'utf-8')).headers;

  const out = await page.evaluate(async ({ hdrs }) => {
    const call = async (name, body) => {
      const h = { ...hdrs };
      delete h['content-length']; delete h['x-trace-id'];
      const r = await fetch(`/banpai/platform/apis?actionName=${name}`, {
        method: 'POST', headers: h, body: JSON.stringify(body || {}),
      });
      return (await r.text()).slice(0, 1200);
    };
    const res = {};
    // 房间列表：带 schoolUid
    res.RoomList_all = await call('PostWebRoomOrderV1RoomListModel', {
      page: 1, pageSize: 5, buildingUidList: [], floorNumList: [],
      roomStatus: null, startTime: Date.now(), endTime: Date.now() + 1800000,
      searchKeyword: '', seatCountMin: null, seatCountMax: null, schoolUid: '002',
    });
    res.RoomList_status2 = await call('PostWebRoomOrderV1RoomListModel', {
      page: 1, pageSize: 5, buildingUidList: [], floorNumList: [],
      roomStatus: 2, startTime: Date.now(), endTime: Date.now() + 1800000,
      searchKeyword: '', seatCountMin: null, seatCountMax: null, schoolUid: '002',
    });
    // 目录类
    res.BuildingList = await call('GetV1SchoolBuildingList', { schoolUid: '002' });
    res.BuildingRoomList = await call('GetV1SchoolBuildingRoomList', { schoolUid: '002' });
    res.WebBuildingList = await call('GetWebBuildingV1List', { schoolUid: '002' });
    // 日历/日程类（先试 schoolUid 维度）
    res.RoomCalendarDay = await call('GetRoomCalendarV1Day', { schoolUid: '002', day: Date.now() });
    res.RoomSchedule = await call('GetWebRoomOrderV1RoomSchedule', { schoolUid: '002', startTime: Date.now(), endTime: Date.now() + 86400000 });
    return res;
  }, { hdrs });

  for (const [k, v] of Object.entries(out)) {
    console.log(`=== ${k} ===`);
    console.log(v);
    console.log();
  }
  fs.writeFileSync('data/zhlb_api_samples3.json', JSON.stringify(out, null, 1));

  // 汇报 zhjw 状态
  for (const p of ctx.pages()) {
    console.log('TAB:', p.url(), '|', await p.title().catch(() => ''));
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
