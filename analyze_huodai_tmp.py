# -*- coding: utf-8 -*-
"""只读分析 D:\codexproject\带货 目录的素材更新情况（不修改/删除/移动任何文件）"""
import sys, os
from datetime import datetime, date

sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"D:\codexproject\带货"
REF = date(2026, 9, 1)

def scan(path):
    """递归统计 path 下所有文件：返回 (文件数, 总字节, 最新mtime, 最旧mtime)"""
    count = 0
    total = 0
    newest = None
    oldest = None
    for dirpath, dirnames, filenames in os.walk(path, followlinks=False):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                st = os.stat(fp)
            except OSError as e:
                print(f"  [跳过无法访问: {fp} -> {e}]")
                continue
            count += 1
            total += st.st_size
            mt = st.st_mtime
            if newest is None or mt > newest:
                newest = mt
            if oldest is None or mt < oldest:
                oldest = mt
    return count, total, newest, oldest

def fmt_ts(ts):
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else "-"

def days_since(ts):
    if ts is None:
        return None
    return (REF - datetime.fromtimestamp(ts).date()).days

def human_size(n):
    if n is None:
        return "-"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} TB"

print("=" * 72)
print("带货素材目录分析报告")
print(f"分析对象 : {ROOT}")
print(f"参照时间 : {REF}  (任务指定的当前时间)")
print("操作性质 : 全程只读")
print("=" * 72)

# ---------- 一、顶层结构 ----------
print("\n【一】顶层结构")
top_dirs = []   # (name, count, total, newest, oldest)
top_files = []  # (name, size, mtime)
try:
    entries = sorted(os.scandir(ROOT), key=lambda e: (e.is_dir(follow_symlinks=False) is False, e.name.lower()))
except FileNotFoundError:
    print(f"错误：目录不存在 -> {ROOT}")
    sys.exit(1)

for e in entries:
    if e.is_dir(follow_symlinks=False):
        c, t, nw, ol = scan(e.path)
        top_dirs.append((e.name, c, t, nw, ol))
    elif e.is_file(follow_symlinks=False):
        st = e.stat()
        top_files.append((e.name, st.st_size, st.st_mtime))
    else:
        print(f"  [其他条目(链接/未知): {e.name}]")

print(f"顶层子目录数 : {len(top_dirs)}")
print(f"顶层文件数   : {len(top_files)}  (合计 {human_size(sum(f[1] for f in top_files))})")
if top_dirs:
    print("\n| 子目录 | 文件数(递归) | 总大小 | 最新修改 | 最旧修改 |")
    print("|--------|--------------|--------|----------|----------|")
    for name, c, t, nw, ol in sorted(top_dirs, key=lambda x: (x[2] is not None, x[2]), reverse=True):
        print(f"| {name} | {c} | {human_size(t)} | {fmt_ts(nw)} | {fmt_ts(ol)} |")
if top_files:
    print("\n顶层散落文件：")
    for name, sz, mt in top_files:
        print(f"  - {name}  ({human_size(sz)}, 修改于 {fmt_ts(mt)}, 距今 {days_since(mt)} 天)")

# ---------- 二、分类子目录及有意义的二级子目录 ----------
print("\n" + "=" * 72)
print("【二】各分类目录素材更新情况（按最近更新倒序）")
print("=" * 72)

rows = []  # (层级, 路径显示名, 相对路径, 文件数, 总大小, 最新mtime, 最旧mtime, 天数)

for name, c, t, nw, ol in top_dirs:
    rows.append(("1级", name, name, c, t, nw, ol, days_since(nw)))
    # 有意义的二级子目录（递归含文件者）
    sub = os.path.join(ROOT, name)
    try:
        subs = sorted(os.scandir(sub), key=lambda e: e.name.lower())
    except OSError:
        continue
    for s in subs:
        if s.is_dir(follow_symlinks=False):
            c2, t2, nw2, ol2 = scan(s.path)
            if c2 > 0:
                rows.append(("2级", f"{name} / {s.name}", os.path.join(name, s.name), c2, t2, nw2, ol2, days_since(nw2)))

if not rows:
    print("\n⚠ 未发现任何子目录（无分类目录可统计）。")

rows.sort(key=lambda r: (r[5] is not None, r[5]), reverse=True)

print("\n| 层级 | 目录 | 文件数 | 总大小 | 最新更新 | 最旧文件 | 距参照日(天) |")
print("|------|------|--------|--------|----------|----------|--------------|")
for lvl, disp, rel, c, t, nw, ol, d in rows:
    print(f"| {lvl} | {disp} | {c} | {human_size(t)} | {fmt_ts(nw)} | {fmt_ts(ol)} | {d if d is not None else '-'} |")

# ---------- 三、超过 30/60/90 天未更新 ----------
print("\n" + "=" * 72)
print("【三】超过 30 / 60 / 90 天没有新素材的目录")
print("=" * 72)

bucket90 = [r for r in rows if r[7] is not None and r[7] > 90]
bucket60 = [r for r in rows if r[7] is not None and 60 < r[7] <= 90]
bucket30 = [r for r in rows if r[7] is not None and 30 < r[7] <= 60]

def print_bucket(title, bucket):
    print(f"\n■ {title} ({len(bucket)} 个)")
    if not bucket:
        print("   （无）")
    for lvl, disp, rel, c, t, nw, ol, d in bucket:
        print(f"   - [{lvl}] {disp} : {c} 个文件, 最近更新 {fmt_ts(nw)}, 距今 {d} 天")

print_bucket("超过 90 天未更新（最紧急）", bucket90)
print_bucket("超过 60 天未更新（较紧急）", bucket60)
print_bucket("超过 30 天未更新（需关注）", bucket30)

# ---------- 四、建议分档 ----------
print("\n" + "=" * 72)
print("【四】建议补充素材分档")
print("=" * 72)
print("\n[紧急] 超过 90 天未更新，素材严重老化，建议立即补充：")
for r in bucket90:
    print(f"   🔴 {r[1]}（{r[7]} 天）")
if not bucket90:
    print("   （无）")
print("\n[较急] 60~90 天未更新，建议近期安排补充：")
for r in bucket60:
    print(f"   🟠 {r[1]}（{r[7]} 天）")
if not bucket60:
    print("   （无）")
print("\n[关注] 30~60 天未更新，建议本月内补充：")
for r in bucket30:
    print(f"   🟡 {r[1]}（{r[7]} 天）")
if not bucket30:
    print("   （无）")

normal = [r for r in rows if r[7] is not None and r[7] <= 30]
print("\n[正常] 30 天内更新过，无需处理：")
for r in normal:
    print(f"   🟢 {r[1]}（{r[7]} 天前更新）")
if not normal and rows:
    print("   （无）")

print("\n[说明] 以上均以参照日 2026-09-01 为准；只读分析，未改动任何文件。")
