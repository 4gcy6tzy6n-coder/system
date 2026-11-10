// 抓真实请求头后，带 header 调用关键 API（房间日程/每日活动/房间目录/学期）
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  // 抓一个真实请求的头
  const captured = [];
  const onReq = req => {
    if (req.url().includes('/apis') && !captured.length) {
      captured.push({ headers: req.headers(), postData: req.postData(), url: req.url() });
    }
  };
  page.on('request', onReq);

  // 触发 UI 查询：点击"全览模式"再点回"列表模式"，或改变楼宇筛选
  for (const label of ['全览模式', '列表模式']) {
    await page.locator(`text=${label}`).first().click().catch(e => {});
    await page.waitForTimeout(3500);
    if (captured.length) break;
  }
  // 还没抓到就改楼宇筛选
  if (!captured.length) {
    await page.locator('text=全部楼宇').first().click().catch(e => {});
    await page.waitForTimeout(1000);
    await page.locator('text=博学楼').first().click().catch(e => {});
    await page.waitForTimeout(3500);
  }
  page.off('request', onReq);
  if (!captured.length) { console.log('未能捕获 API 请求'); process.exit(1); }

  const hdrs = captured[0].headers;
  console.log('captured headers:', JSON.stringify(hdrs, null, 1));
  console.log('captured post:', (captured[0].postData || '').slice(0, 300));
  fs.writeFileSync('data/zhlb_real_headers.json', JSON.stringify(captured[0], null, 1));

  // 用同样 header 调用其它 API
  const out = await page.evaluate(async ({ hdrs }) => {
    const call = async (name, body, method = 'POST') => {
      const h = { ...hdrs };
      delete h['content-length'];
      const opt = method === 'POST'
        ? { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }
        : { method: 'GET', headers: h };
      const r = await fetch(`/banpai/platform/apis?actionName=${name}`, opt);
      return (await r.text()).slice(0, 700);
    };
    const res = {};
    res.TermList = await call('GetV1TermList', '', 'GET');
    res.BuildingRoomList = await call('GetV1SchoolBuildingRoomList', '', 'GET');
    res.BuildingList = await call('GetV1SchoolBuildingList', '', 'GET');
    res.RoomActivityDayList = await call('GetRoomActivityItemV1DayList', '', 'GET');
    return res;
  }, { hdrs });

  for (const [k, v] of Object.entries(out)) {
    console.log(`=== ${k} ===`);
    console.log(v);
  }
  fs.writeFileSync('data/zhlb_api_samples.json', JSON.stringify(out, null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
