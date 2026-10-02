"""ドスパラ商品ページ (BTO PC) からスペック・画像・価格を抽出する。

外部ライブラリ不要 (Python 標準ライブラリのみ)。
情報源の優先度:
  1. ページ内の `var productJson = {...}`      (CPU/GPU/メモリ/SSD など主要スペック・価格)
  2. 製品仕様テーブル `p-product-show-benchmark__table-spec` (基本構成の全項目)
  3. JSON-LD (Product)                          (画像一覧・価格・在庫)
  4. 個別の HTML 要素                            (ベンチマーク・ラベル・分割払い等)
"""
from __future__ import annotations

import gzip
import html
import json
import re
import urllib.request
import zlib
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

BASE = "https://www.dospara.co.jp"
ALLOWED_HOSTS = {"www.dospara.co.jp", "dospara.co.jp"}

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


class FetchError(Exception):
    pass


def fetch_html(url: str, timeout: int = 20) -> str:
    host = urlparse(url).hostname or ""
    if host not in ALLOWED_HOSTS:
        raise FetchError(f"ドスパラのURLではありません: {host or url}")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            enc = (res.headers.get("Content-Encoding") or "").lower()
            charset = res.headers.get_content_charset() or "utf-8"
    except Exception as e:  # noqa: BLE001
        raise FetchError(f"ページを取得できませんでした: {e}") from e
    if enc == "gzip":
        raw = gzip.decompress(raw)
    elif enc == "deflate":
        raw = zlib.decompress(raw)
    return raw.decode(charset, errors="replace")


# ---------------------------------------------------------------- helpers

def _text(fragment: str, unescape: bool = True) -> str:
    """HTML 断片をテキスト化 (<br> は改行)。"""
    s = re.sub(r"(?i)<br\s*/?>", "\n", fragment)
    s = re.sub(r"<[^>]+>", "", s)
    if unescape:
        s = html.unescape(s)
    lines = [re.sub(r"[ \t　]+", " ", ln).strip() for ln in s.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def _first(pattern: str, src: str, flags: int = re.S) -> str | None:
    m = re.search(pattern, src, flags)
    return m.group(1) if m else None


def _to_int(s) -> int | None:
    if s is None:
        return None
    digits = re.sub(r"[^\d-]", "", str(s))
    return int(digits) if digits not in ("", "-") else None


def _large_image(url: str) -> str:
    """?sw=400 のサムネイルURLを高解像度版に。"""
    if not url:
        return url
    url = urljoin(BASE, url)
    url = re.sub(r"([?&])sw=\d+", r"\1sw=1200", url)
    return url


# ---------------------------------------------------------------- sections

def parse_product_json(src: str) -> dict:
    m = re.search(r"var\s+productJson\s*=\s*(\{.*?\})\s*;?\s*</script>", src, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def parse_json_ld(src: str) -> dict:
    for block in re.findall(
        r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', src, re.S
    ):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for it in items:
            if isinstance(it, dict) and it.get("@type") == "Product":
                return it
    return {}


class _SpecTableParser(HTMLParser):
    """製品仕様テーブルの th/td を順序付きで取り出す。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows: list[tuple[str, str]] = []
        self._cell = None  # "th" | "td"
        self._buf: list[str] = []
        self._th = ""

    def handle_starttag(self, tag, attrs):
        if tag in ("th", "td"):
            self._cell, self._buf = tag, []
        elif tag == "br" and self._cell:
            self._buf.append("<br>")

    def handle_endtag(self, tag):
        if tag == self._cell:
            # 実体参照は HTMLParser 側で解決済み (裸の "&" もそのまま残る)
            val = _text("".join(self._buf), unescape=False)
            if tag == "th":
                self._th = val
            else:
                self.rows.append((self._th, val))
                self._th = ""
            self._cell = None

    def handle_data(self, data):
        if self._cell:
            self._buf.append(data)


def parse_spec_table(src: str) -> list[dict]:
    m = re.search(
        r'<table[^>]*class="[^"]*p-product-show-benchmark__table-spec[^"]*"[^>]*>(.*?)</table>',
        src,
        re.S,
    )
    if not m:
        return []
    p = _SpecTableParser()
    # 値に生の "<BR>" が混在するので大小文字問わず統一
    p.feed(re.sub(r"(?i)<br\s*/?>", "<br>", m.group(1)))
    return [{"label": k, "value": v} for k, v in p.rows if k]


def parse_benchmark(src: str) -> dict:
    out = {}
    title = _first(r'class="p-benchmark-modal__title">(.*?)</div>', src)
    score = _first(r'class="p-benchmark-modal__score">\s*([\d,]+)\s*<', src)
    if title:
        out["title"] = _text(title)
    if score:
        out["timeSpy"] = _to_int(score)
    fs = _first(r'class="p-benchmark-modal__firestrike-score">(.*?)</dl>', src)
    if fs:
        for dt, dd in re.findall(r"<dt>(.*?)</dt>\s*<dd>(.*?)</dd>", fs, re.S):
            out[_text(dt)] = _to_int(dd)
    level = _first(r'data-benchmark-level="(\d)"', src)
    m = re.search(r"LEVEL\s*(\d)", out.get("title", ""))
    if m:
        out["level"] = int(m.group(1))
    elif level:
        out["level"] = int(level)
    return out


def parse_images(src: str, ld: dict, pj: dict) -> list[str]:
    seen, out = set(), []

    def add(u):
        if not u:
            return
        u = _large_image(html.unescape(u))
        # 同一画像が /dw/image/v2/... と直リンクの両方で出るため、カタログ内パスで同一判定
        key = re.sub(r"\?.*$", "", u)
        key = re.sub(r"^.*?/(dw[0-9a-f]+/img/)", r"\1", key)
        if key not in seen:
            seen.add(key)
            out.append(u)

    # メインスライダー (原寸)
    for u in re.findall(r'<img[^>]+data-large="([^"]+)"', src):
        add(u)
    imgs = ld.get("image") or []
    for u in imgs if isinstance(imgs, list) else [imgs]:
        add(u)
    add(pj.get("imgurl"))
    return out


def parse_labels(src: str) -> list[str]:
    block = _first(r'<ul class="p-product-show-detail__label-list[^"]*">(.*?)</ul>', src)
    if not block:
        return []
    return [
        _text(x)
        for x in re.findall(r'<span class="p-product-item__label[^"]*">(.*?)</span>', block, re.S)
        if _text(x)
    ]


def parse_lineup(src: str) -> list[dict]:
    block = _first(r'<ul class="p-product-show-detail__lineup-list[^"]*">(.*?)</ul>', src)
    if not block:
        return []
    out = []
    for href, cls, body in re.findall(r'<a href="([^"]+)"\s*class="([^"]*)">(.*?)</a>', block, re.S):
        name = _first(r'lineup-list-product-name">(.*?)</p>', body)
        price = _first(r'lineup-list-product-price">([\d,]+)', body)
        out.append(
            {
                "url": urljoin(BASE, href),
                "name": _text(name or ""),
                "price": _to_int(price),
                "active": "active" in cls.split(),
            }
        )
    return out


# ---------------------------------------------------------------- main

# POPに載せる主要スペック: (表示名, productJson キー, 仕様テーブルの見出し候補)
KEY_SPECS = [
    ("OS", "os2", ["OS"]),
    ("CPU", "cpu2", ["CPU"]),
    ("GPU", "video2", ["グラフィック機能", "グラフィックボード"]),
    ("メモリ", "memory2", ["メモリ"]),
    ("SSD", "ssd2", ["SSD"]),
    ("追加SSD", "2ndssd", ["SSD 2"]),
    ("HDD", "hdd2", ["ハードディスク/SSD", "ハードディスク(追加1)"]),
    ("マザーボード", "mb2", ["マザーボード"]),
    ("電源", "powersupply", ["電源"]),
    ("CPUクーラー", None, ["CPUファン"]),
    ("ケース", None, ["ケース"]),
    ("LAN", "lan", ["LAN"]),
    ("無線LAN", "wlan", ["無線LAN"]),
    ("光学ドライブ", "drive", ["光学ドライブ"]),
    ("ディスプレイ", "display2", ["ディスプレイ", "液晶パネル"]),
    ("サイズ", None, ["サイズ"]),
    ("重量", "weight", ["重量"]),
]

# POP に初期表示する項目 (その他はパネルのチェックで追加)
DEFAULT_SHOW = {"OS", "CPU", "GPU", "メモリ", "SSD", "追加SSD", "HDD", "マザーボード", "電源", "CPUクーラー", "ディスプレイ"}
# 「無し」系は POP 初期表示から外す
_EMPTY_PAT = re.compile(r"(無し|なし)(\s|\(|（|$)")


def parse_product(src: str, url: str = "") -> dict:
    pj = parse_product_json(src)
    ld = parse_json_ld(src)
    table = parse_spec_table(src)
    tmap = {r["label"]: r["value"] for r in table}

    name = (
        pj.get("pname")
        or _text(_first(r'<h1 class="p-product-show-detail__product-name-area-product-name">(.*?)</h1>', src) or "")
        or ld.get("name", "")
    )
    # モデル名と付帯情報（『...』同梱版 など）を分割
    m = re.match(r"^(.*?)\s*(『.*』.*)$", name)
    model, edition = (m.group(1), m.group(2)) if m else (name, "")

    price = pj.get("amttax") or _to_int((ld.get("offers") or {}).get("price"))
    if price is None:
        price = _to_int(_first(r'itemprop="price"\s+content="(\d+)"', src))

    key_specs = []
    for label, pj_key, t_keys in KEY_SPECS:
        val = None
        source = None
        for k in t_keys:
            if tmap.get(k):
                val, source = tmap[k], "table"
                break
        if not val and pj_key and pj.get(pj_key):
            val, source = str(pj[pj_key]), "productJson"
        if not val:
            continue
        key_specs.append(
            {
                "label": label,
                "value": val,
                # POP 用: 1行目のみ (※注記・拡張スロット詳細などを除く)
                "display": val.split("\n")[0],
                "short": _short_value(label, pj, val),
                "source": source,
                "show": label in DEFAULT_SHOW and not _EMPTY_PAT.search(val),
            }
        )

    installment = None
    inst_price = _first(r'credit-price-wrapper-installment-price">\s*([\d,]+)', src)
    if inst_price:
        count = _first(r'credit-price-wrapper-installment-count">.*?\((\d+)回\)', src)
        installment = {"monthly": _to_int(inst_price), "count": _to_int(count)}

    warranty = _first(r'<li class="spec-warranty">(.*?)<a', src)

    return {
        "url": url,
        "canonical": _first(r'<link rel="canonical" href="([^"]+)"', src),
        "productId": pj.get("productID") or ld.get("sku"),
        "manageCode": _first(r"管理コード[：:]\s*([\w-]+)", src),
        "name": name,
        "model": model,
        "edition": edition,
        "catchcopy": pj.get("catchcopy") or "",
        "price": price,
        "installment": installment,
        "stock": pj.get("stkname") or "",
        "warranty": _text(warranty) if warranty else "",
        "labels": parse_labels(src),
        "benchmark": parse_benchmark(src),
        "keySpecs": key_specs,
        "specTable": table,
        "images": parse_images(src, ld, pj),
        "lineup": parse_lineup(src),
        "productJson": pj,
        "warnings": _warnings(pj, table, price),
    }


def _short_value(label: str, pj: dict, full: str) -> str:
    """POP の大見出し用の短い表記。"""
    short_map = {"CPU": "cpu", "GPU": "video", "メモリ": "memory", "SSD": "ssd", "OS": "os"}
    k = short_map.get(label)
    if k and pj.get(k):
        return pj[k]
    return full.split("\n")[0]


def _warnings(pj, table, price) -> list[str]:
    w = []
    if not pj:
        w.append("productJson が見つかりません（ページ構造が変わった可能性）")
    if not table:
        w.append("製品仕様テーブルが見つかりません")
    if price is None:
        w.append("価格が取得できません")
    return w


if __name__ == "__main__":
    import sys

    target = sys.argv[1]
    src = open(target, encoding="utf-8").read() if not target.startswith("http") else fetch_html(target)
    print(json.dumps(parse_product(src, target), ensure_ascii=False, indent=2))
