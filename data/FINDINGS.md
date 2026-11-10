# UIBE 教室空闲时间数据采集 — 勘察记录

日期：2026-11-10（第10教学周，2026-2027-1 学期：9/7–12/25 共16周，考试周 12/28–1/8）

## 数据源排查结论

### 1. jwcold.uibe.edu.cn/classroom/ClassroomShow.aspx（教务处官网链接的"教室使用情况查询"）—— ❌ 数据源已枯竭
- ASP.NET WebForms + DevExpress ASPxGridView，无需登录。
- 表单：`ddlJiaoXueLou`（全部/博学楼/诚信楼/宁远楼/新求索楼/知行楼）+ `txtRiQi`（yyyy-MM-dd）+ `chkIsWuAnPai`（只筛选全天无安排）+ `btnQuery`。
- 网格列：教室 | 类型 | 座位数 | 日期（第一节 第二节 第三节 第四节 晚上，对应五/大节）。
- 字段名：JiaoShi / JiaoShiLeiXing / ZuoWeiShu / 节次列 '1','2','中'(隐藏),'3','4','5'。
- **实测（HTTP POST + 真实 Chromium 两种方式）**：2016–2027 全部抽样日期 × 全部教学楼 → 恒为 0 行 "No data to display"。
- 表单编码已验证：UTF-8/GBK 都试过；日期正确回显、下拉值正确回显（"知行楼"round-trip 正常），说明请求无误，是服务端无数据。
- 证据：`raw/jwcold_browser_result.html` / `raw/jwcold_browser_result.png`。
- 结论：jwcold 是 2023-2024 前后被替换的旧教务系统（站内新闻停更于 2024-01），数据源已不再维护。

### 2. zhjw.uibe.edu.cn（教务综合管理信息系统，正方）—— ⚠️ 可用但有门槛
- 前置瑞数（RSWAF）JS 反爬：curl 返回 412 + `$_ts` 挑战；headless shell 被识别（空白页）。
- 需要统一身份认证/学号密码登录（待确认是否有公开"空闲教室查询"页）。
- 注意：教务处 FAQ 称教务系统"校园网可直接访问，校外需登录 VPN"——但 WAF 有响应说明公网可达，登录后能否查询待验证。

### 3. zhlb.uibe.edu.cn（智慧教学管理平台，新）—— ⚠️ 需登录
- 所有路由重定向到 `uc/config-login`（统一身份账号 / 非统一身份账号两种登录）。
- 疑似为新一代排课/教室管理平台，登录后可能有教室/课表查询接口。

### 4. 其他
- tas1.uibe.edu.cn（教学辅助平台）：连接失败（疑似仅校园网）。
- 学习空间预约系统：只有 2017 使用说明文档，为预约用途，不是课表占用数据源。

## 已采集的静态资料（建站可直接用）
- `data/rooms_meta.csv`：191 间教室元数据（楼名/房间号/教室类型/设备设施/建筑面积/座位/位置），来自教务处"教室基本情况表"(2017)。
- 作息表（2015）：第一大节 08:00–09:30 / 第二大节 09:50–11:20(3学时至12:10) / 第三大节 13:30–15:00 / 第四大节 15:20–16:50(3学时至17:40) / 第五大节 18:30–20:00(3学时至20:50)。
- 校历（2026-2027）：`raw/calendar_2026_2027.png`；教学周计算：2026-09-07 起算第1周。

## 4. zhlb.uibe.edu.cn 智慧教学平台 —— ✅ 已打通，数据采集源（最终方案）

账号：学生（学号 202493003，姚应亮），登录态在 Chrome CDP 会话（端口 9333，profile: `browser-profile/`）。

### 采集 API 配方（全部为 `POST https://zhlb.uibe.edu.cn/banpai/platform/apis?actionName=<名>`，JSON body）
Headers 必带：`content-type: application/json`、`x-csrf-token: <Cookie 里的 csrfToken 值>`、`x-school-id: 002`。

| 用途 | actionName | body |
|---|---|---|
| 楼宇列表 | `GetWebBuildingV1List` | `{"schoolUid":"002"}` |
| 房间列表 | `GetWebBuildingRoomV1List` | `{"schoolUid":"002","buildingUid":"<uid>"}` |
| 房间树 | `GetWebBuildingRoomV1Tree` | `{"schoolUid":"002"}` |
| 教学计划(周列表) | `GetWebTimetableV1Plans` | `{"schoolId":"002"}` |
| **房间周课表（核心）** | `GetTimetableV1RoomWeekTimetable` | `{"roomUid":"<uid>","weekIndex":<1-18>,"schoolUid":"002"}` |
| 房间当天选座/课 | `GetLessonV1RoomDaySeat` | `{"schoolUid":"002","roomUid":"<uid>","day":<yyyyMMdd int>}` |

`GetTimetableV1RoomWeekTimetable` 返回字段：lessonUid, courseUid, courseName, startTime/endTime(ms), buildingUid/buildingName, roomUid/roomName, lessonDate(ms), weekIndex, dayIndex(1-7), startIdx/endIdx(节次), courseClassName, campusName, studentCount, weekRange("4-16"), courseTeacherList[]。

### 节次表（13 节，来自 /kindlink/frontend/api/course/resource/v1/timetable 的 metaInfo.rowHeaders）
1:08:00-08:45 2:08:46-09:30 3:09:50-10:35 4:10:36-11:20 5:11:25-12:10 6:13:30-14:15 7:14:16-15:00 8:15:20-16:05 9:16:06-16:50 10:16:55-17:40 11:18:30-19:15 12:19:16-20:00 13:20:05-20:50

### 教学计划
planUid 1321097528820977664，2026-09-07 → 2027-01-08，共 18 周（weekIndex 1-18）。学期列表 API：`GET /kindlink/frontend/api/course/resource/v1/term/list`。

### 房间目录（248 间）
博学楼 41 / 诚信楼 6 / 默认建筑 1 / "宁" 1 / 宁远楼 98 / 新求索楼 73 / 知行楼 28（`data/rooms_full.json`）。
注意：zhlb 目录与教务处 2017 版"教室基本情况表"（`data/rooms_meta.csv`，191 间）不完全一致，展示时以 zhlb 为准。

### 其他已知接口（未用到）
- `GET /kindlink/frontend/api/course/resource/v1/timetable?queryDate=YYYY-MM-DD&queryScope=2`：自己的周课表（含 classRoomUid/Name）。
- 班牌侧还有 `GetTimetableV1RoomTimetable`（缺 int 参数未破解）、`GetMobileTimetableUserLesson` 等；管理侧排课接口（PostV1TimetableListCourseTimetable 等）需更高权限。
- 巡课（摄像头）API：`/kindlink/frontend/api/course/admin/server/v1/list?serviceCode=PATROL`（内网 IP 10.18.x.x，不在采集范围）。

## 采集产物
- `data/occupancy.ndjson`：每行 {building, roomUid, roomName, seatCount, weekIndex, lessons[]}（采集器 `scripts/collect_occupancy.js`，断点文件 `data/occupancy_done.json`）。
- 规范化输出（建站用）：`data/rooms.json` + `data/occupancy.json`（由 `scripts/normalize.js` 生成）。

## 工具链
- Playwright + Chromium 已装好（`scripts/` 下有探查脚本）。
- 网格抓取的表单协议细节见 `scripts/verify_jwcold.js`（含 VIEWSTATE 提交流程，若旧系统复活可直接复用）。
