# -*- coding: utf-8 -*-
"""Download and parse juya daily RSS, extract issue 2026-09-01 full text."""
import html
import re
import sys
import urllib.request
from html.parser import HTMLParser

URL = "https://daily.juya.uk/rss.xml"
TARGET = "2026-09-01"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip > 0:
            self.skip -= 1

    def handle_data(self, data):
        if self.skip == 0:
            self.parts.append(data)

    def text(self):
        s = "".join(self.parts)
        return re.sub(r"\s+", " ", s).strip()


def plain(seg):
    p = TextExtractor()
    p.feed(seg)
    return p.text()


def parse_items(content):
    items = []
    h3s = list(re.finditer(r"<h3>(.*?)</h3>", content, re.S | re.I))
    for i, m in enumerate(h3s):
        start = m.end()
        end = h3s[i + 1].start() if i + 1 < len(h3s) else len(content)
        body = content[start:end]
        am = re.search(r'<a\s+href="([^"]+)"', m.group(1))
        link = am.group(1) if am else None
        bq = None
        bm = re.search(r"<blockquote>(.*?)</blockquote>", body, re.S | re.I)
        if bm:
            bq = plain(bm.group(1))
        detail = None
        for pp in re.findall(r"<p>(.*?)</p>", body, re.S | re.I):
            if "<img" in pp:
                continue
            txt = plain(pp)
            if txt and txt != bq:
                detail = txt
                break
        items.append({"title": plain(m.group(1)), "link": link,
                      "quote": bq, "detail": detail})
    return items


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    req = urllib.request.Request(URL, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8", "replace")

    lb = re.search(r"<lastBuildDate>(.*?)</lastBuildDate>", raw)
    print("lastBuildDate:", lb.group(1) if lb else "N/A")

    item_blocks = re.findall(r"<item>(.*?)</item>", raw, re.S)
    target = None
    for blk in item_blocks:
        tm = re.search(r"<title>(.*?)</title>", blk, re.S)
        title = plain(tm.group(1)) if tm else ""
        if TARGET in title:
            target = blk
            break
    if target is None:
        print("TARGET ITEM NOT FOUND")
        return
    print("found item:", plain(re.search(r"<title>(.*?)</title>", target, re.S).group(1)))

    cm = re.search(r"<content:encoded>(.*?)</content:encoded>", target, re.S)
    if not cm:
        print("NO content:encoded")
        return
    content = html.unescape(cm.group(1))

    # overview lines (概览)
    ov = re.search(r"<h2>概览</h2>(.*?)(?=<h2>|$)", content, re.S)
    print("\n===== OVERVIEW =====")
    if ov:
        for li in re.findall(r"<li>(.*?)</li>", ov.group(1), re.S):
            print("-", plain(li))

    h2s = list(re.finditer(r"<h2>(.*?)</h2>", content, re.S))
    for i, m in enumerate(h2s):
        sec_title = plain(m.group(1))
        if sec_title == "概览":
            continue
        start = m.end()
        end = h2s[i + 1].start() if i + 1 < len(h2s) else len(content)
        body = content[start:end]
        print("\n" + "=" * 16)
        print("SECTION:", sec_title)
        for it in parse_items(body):
            print("-" * 56)
            print("TITLE:", it["title"])
            print("LINK:", it["link"])
            print("QUOTE:", it["quote"])
            print("DETAIL:", it["detail"])


if __name__ == "__main__":
    main()
