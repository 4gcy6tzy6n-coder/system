# UIBE 教室空闲时间表

对外经济贸易大学教室空闲查询：选一间教室，直接看它**今天什么时候上课、什么时候空闲**。
一个页面，三条信息：上课时间段（带课程名和老师）、空闲时间段、13 节速览条。

**在线版（GitHub Pages）：https://4gcy6tzy6n-coder.github.io/system/** —— 直接用快照数据，免登录、免服务器。

**本地实时版**：`node site/server.js` → http://127.0.0.1:8787 —— 通过浏览器会话直连教务平台，实时查课表。

## 更新线上数据

```bash
node scripts/collect_occupancy.js     # 重新采集（断点续采）
python3 scripts/normalize.py          # 生成 site/data/
cp -R site/data/* docs/data/          # 同步到 Pages 目录
git add -A && git commit -m "更新排课快照" && git push
```

## 实时 vs 快照

页面底部有一行小字说明当前数据：

- **实时数据：刚自教务系统读取** —— 教务平台在线、登录有效
- **离线快照：11-10 采集** —— 教务接口不可用（会话过期 / 平台 502 / 校外网络），自动降级，页面照常可用
- 页面会**先用快照秒出结果，再尝试实时覆盖**，所以不会白屏等待

教务平台恢复且重新登录后，下一次查询自动变回实时；服务器端在会话失效后有 5 分钟冷却，重新导出 Cookie 会立即解除。

## 快速开始

```bash
node site/server.js          # 打开 http://127.0.0.1:8787
```

服务器会自动用 `data/zhlb_cookies.json` 里的教务登录态**实时**查课表；会话过期时会自动回退到
`site/data/` 里的离线快照（采集于 2026-11-10，全学期 18 周）。

直接双击 `site/index.html` 也能看，此时只用离线快照。

## 数据从哪来

| 来源 | 说明 |
|---|---|
| 实时接口 | `site/server.js` → zhlb 智慧教学平台 `GetTimetableV1RoomWeekTimetable`（教室周课表）+ `GetWebBuildingRoomV1List`（房间目录）。接口细节见 `data/FINDINGS.md` |
| 离线快照 | `scripts/collect_occupancy.js` 采集 248 间教室 × 18 个教学周，`scripts/normalize.py` 生成 `site/data/`（43,887 条课次） |

已被替换/失效的系统（不作为数据源）：jwcold 旧查询页（无数据）、zhjw 强智教务（登录不可用）。

## 刷新登录态（实时接口用）

1. 确保 Chrome 以调试端口运行并已登录 zhlb：
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9333 \
     --user-data-dir="$PWD/browser-profile" \
     https://zhlb.uibe.edu.cn/
   ```
   在弹出的窗口里登录，然后：
   ```bash
   node scripts/export_cookies.js    # 导出 Cookie → data/zhlb_cookies.json
   ```

## 重新采集离线快照

```bash
node scripts/collect_occupancy.js   # 断点续采，进度在 data/occupancy_done.json
python3 scripts/normalize.py        # 生成 site/data/rooms.json + meta.json + days/*.json
```

## 目录

```
site/              网站（index.html + app.js + assets + data/）
  server.js        本地服务器：静态站 + 实时教务接口代理
  index.html       单页：hero + 查询台 + 页脚
  app.js           查询逻辑（实时 API → 离线快照 → 内置作息表，逐级兜底）
data/FINDINGS.md   数据源排查与接口配方（全部逆向结论）
scripts/           采集器、Cookie 导出、规范化脚本
raw/               排查过程存档（旧系统验证、截图）
```

## 设计

按 design-taste-frontend 技能规范构建（`site/PLAN.md` 是页面计划，`site/.taste-skill/` 有检查结果与豁免）。
门禁结果：`GATE: PASS`；动效使用 GSAP（速览条/答案行的位移入场），hero 入场用工具包的 data-enter。
