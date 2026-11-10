// 全量采集器：248 房间 × 教学周 → 周课表（占用数据），断点续采
// 数据源: POST /banpai/platform/apis?actionName=GetTimetableV1RoomWeekTimetable {roomUid, weekIndex, schoolUid:'002'}
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CDP = 'http://127.0.0.1:9333';

const OUT = path.join(__dirname, '..', 'data', 'occupancy.ndjson');
const ROOMS = path.join(__dirname, '..', 'data', 'rooms_full.json');
const PLAN = path.join(__dirname, '..', 'data', 'timetable_plan.json');
const DONE = path.join(__dirname, '..', 'data', 'occupancy_done.json');

function httpPut(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject); req.end();
  });
}

async function connect() {
  for (let i = 0; i < 8; i++) {
    try { return await chromium.connectOverCDP(CDP); }
    catch (e) { await httpPut(`${CDP}/json/new?about:blank`).catch(() => {}); await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error('CDP 连接失败');
}

async function main() {
  const roomsWrap = JSON.parse(fs.readFileSync(ROOMS, 'utf-8'));
  const plan = JSON.parse(fs.readFileSync(PLAN, 'utf-8'));
  const weeks = plan.data.weekList.map(w => w.weekIndex);
  console.log('weeks:', weeks.length, '→', weeks.join(','));

  const tasks = [];
  for (const b of roomsWrap) {
    for (const r of b.rooms) {
      for (const wk of weeks) {
        tasks.push({ building: b.building.buildingName, roomUid: r.roomUid, roomName: r.roomName, seatCount: r.seatCount, weekIndex: wk });
      }
    }
  }
  console.log('total room-week tasks:', tasks.length);

  // 断点续采
  const done = new Set(fs.existsSync(DONE) ? JSON.parse(fs.readFileSync(DONE, 'utf-8')) : []);
  const pending = tasks.filter(t => !done.has(t.roomUid + '#' + t.weekIndex));
  console.log('already done:', done.size, '| pending:', pending.length);

  const browser = await connect();
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) throw new Error('no zhlb tab（请先登录 zhlb）');

  const outStream = fs.createWriteStream(OUT, { flags: 'a' });
  let count = 0;
  const CHUNK = 12;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    const results = await page.evaluate(async (chunk) => {
      const csrf = () => (document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/) || [])[1] || '';
      const out = [];
      for (const t of chunk) {
        try {
          const r = await fetch('/banpai/platform/apis?actionName=GetTimetableV1RoomWeekTimetable', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'accept': 'application/json', 'x-csrf-token': csrf(), 'x-school-id': '002' },
            body: JSON.stringify({ roomUid: t.roomUid, weekIndex: t.weekIndex, schoolUid: '002' }),
          });
          const txt = await r.text();
          out.push({ t, ok: r.status === 200, txt: txt.slice(0, 200000) });
        } catch (e) { out.push({ t, ok: false, txt: 'FETCH_ERR ' + e.message }); }
        await new Promise(r2 => setTimeout(r2, 250));
      }
      return out;
    }, chunk);

    let fatal = false;
    for (const res of results) {
      if (/invalid csrf|登录|logon/i.test(res.txt)) { fatal = true; break; }
      if (res.ok && /"statusCode":200/.test(res.txt)) {
        let lessons = [];
        try { lessons = JSON.parse(res.txt).data || []; } catch (e) {}
        outStream.write(JSON.stringify({ ...res.t, lessons }) + '\n');
        done.add(res.t.roomUid + '#' + res.t.weekIndex);
        count++;
      } else {
        console.log('WARN', res.t.roomName, 'week', res.t.weekIndex, res.txt.slice(0, 120));
        outStream.write(JSON.stringify({ ...res.t, lessons: [], error: res.txt.slice(0, 200) }) + '\n');
        done.add(res.t.roomUid + '#' + res.t.weekIndex);
        count++;
      }
    }
    // 保存断点
    fs.writeFileSync(DONE, JSON.stringify([...done]));
    if (fatal) { console.log('会话失效，已保存断点（完成 ' + done.size + '），请重新登录后重跑'); break; }
    if (count % 240 < CHUNK) console.log(`progress: ${done.size}/${tasks.length} (${new Date().toLocaleTimeString()})`);
  }

  outStream.end();
  console.log('COLLECTION FINISHED, collected this run:', count, '| total done:', done.size);
  await browser.close();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
