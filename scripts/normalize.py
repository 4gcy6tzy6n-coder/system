#!/usr/bin/env python3
"""把 occupancy.ndjson + rooms_full.json + timetable_plan.json 规范化为建站数据。

输出:
  site/data/rooms.json     [{building, roomUid, roomName, seatCount}]
  site/data/schedule.json  {dateStr: {roomUid: [[startIdx,endIdx,course,teachers,classes,studentCount], ...]}}
  site/data/meta.json      {periods, weeks, generatedAt, stats}
"""
import json, os, sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SITE_DATA = os.path.join(ROOT, 'site', 'data')
os.makedirs(SITE_DATA, exist_ok=True)

# ---- 节次表（2026-2027 学年，13 节）----
PERIODS = [
    {"i": 1, "start": "08:00", "end": "08:45"},
    {"i": 2, "start": "08:46", "end": "09:30"},
    {"i": 3, "start": "09:50", "end": "10:35"},
    {"i": 4, "start": "10:36", "end": "11:20"},
    {"i": 5, "start": "11:25", "end": "12:10"},
    {"i": 6, "start": "13:30", "end": "14:15"},
    {"i": 7, "start": "14:16", "end": "15:00"},
    {"i": 8, "start": "15:20", "end": "16:05"},
    {"i": 9, "start": "16:06", "end": "16:50"},
    {"i": 10, "start": "16:55", "end": "17:40"},
    {"i": 11, "start": "18:30", "end": "19:15"},
    {"i": 12, "start": "19:16", "end": "20:00"},
    {"i": 13, "start": "20:05", "end": "20:50"},
]

def canon_building(name):
    """把教务数据里同一栋楼的异名合并成规范名。
    数据源里有一条手工占位场地所在楼写作「宁」，实为宁远楼。"""
    n = (name or '').strip()
    if n == '宁':
        return '宁远楼'
    return n

def main():
    # ---- 房间 ----
    rooms_wrap = json.load(open(os.path.join(DATA, 'rooms_full.json'), encoding='utf-8'))
    rooms = []
    for b in rooms_wrap:
        for r in b['rooms']:
            rooms.append({
                'building': canon_building(b['building']['buildingName']),
                'roomUid': r['roomUid'],
                'roomName': r['roomName'],
                'seatCount': r.get('seatCount') or 0,
            })
    def is_manual(r):
        return ('手动' in r['roomName']) or ('默认场地' in r['roomName'])
    rooms.sort(key=lambda r: (r['building'], is_manual(r), r['roomName']))

    # ---- 教学周 ----
    plan = json.load(open(os.path.join(DATA, 'timetable_plan.json'), encoding='utf-8'))['data']
    week_start = {w['weekIndex']: w['startDate'] for w in plan['weekList']}
    weeks = sorted(week_start)

    # ---- 占用 ----
    nd = os.path.join(DATA, 'occupancy.ndjson')
    if not os.path.exists(nd):
        print('occupancy.ndjson 不存在，请先运行采集器', file=sys.stderr)
        sys.exit(1)

    schedule = {}   # dateStr -> roomUid -> list of blocks
    total_lessons = 0
    missing_rooms = {}
    with open(nd, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get('error'):
                continue
            wk = rec['weekIndex']
            if wk not in week_start:
                continue
            mon = date.fromisoformat(week_start[wk])  # 该周周一
            for les in rec.get('lessons', []):
                # lessonDate 为该周某天 00:00 的毫秒时间戳；也用 dayIndex 兜底
                day_idx = les.get('dayIndex')  # 1-7，1=周一
                if day_idx:
                    d = mon + timedelta(days=day_idx - 1)
                else:
                    d = date.fromtimestamp(les['lessonDate'] / 1000)
                ds = d.isoformat()
                uid = les.get('roomUid') or rec['roomUid']
                schedule.setdefault(ds, {}).setdefault(uid, []).append([
                    les.get('startIdx'), les.get('endIdx'),
                    les.get('courseName', ''),
                    ','.join(t.get('teacherName', '') for t in les.get('courseTeacherList', []) or []),
                    les.get('courseClassName', ''),
                    les.get('studentCount', 0),
                ])
                total_lessons += 1
                if uid not in {r['roomUid'] for r in rooms}:
                    missing_rooms[uid] = les.get('roomName', uid)

    # 排序：每天内每房间按开始节次
    schedule_out = {}
    for ds in sorted(schedule):
        schedule_out[ds] = {uid: sorted(blks, key=lambda b: (b[0] or 0)) for uid, blks in schedule[ds].items()}

    # ---- 输出 ----
    os.makedirs(os.path.join(SITE_DATA, 'days'), exist_ok=True)
    json.dump(rooms, open(os.path.join(SITE_DATA, 'rooms.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # 按天拆分，网站按需加载
    for ds, rooms_map in schedule_out.items():
        json.dump(rooms_map, open(os.path.join(SITE_DATA, 'days', ds + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    busy_rooms = {uid for ds in schedule_out.values() for uid in ds}
    meta = {
        'generatedAt': date.today().isoformat(),
        'term': {'name': '2026-2027-1', 'start': plan['startDate'], 'end': plan['endDate']},
        'periods': PERIODS,
        'weeks': weeks,
        'weekStart': week_start,
        'stats': {
            'rooms': len(rooms),
            'roomsWithClasses': len(busy_rooms),
            'lessonInstances': total_lessons,
            'daysWithClasses': len(schedule_out),
            'roomsMissingFromCatalog': missing_rooms,
        },
    }
    json.dump(meta, open(os.path.join(SITE_DATA, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f"rooms: {len(rooms)} | busy rooms: {len(busy_rooms)} | lesson instances: {total_lessons} | days: {len(schedule_out)}")
    if missing_rooms:
        print(f"课表中出现但目录缺失的房间 ({len(missing_rooms)}):", list(missing_rooms.values())[:20])

if __name__ == '__main__':
    main()
