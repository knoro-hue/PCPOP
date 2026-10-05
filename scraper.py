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
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
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


class ParseError(Exception):
    pass


# 取得結果のキャッシュ (同じページを何度も取りに行かない)
_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 300
_CACHE_LOCK = threading.Lock()
# 直接接続が使えない環境 (社内プロキシ等) では、2回目以降は直接接続を試さずに済ませる
_DIRECT_OK: bool | None = None


def _check_host(url: str):
    host = urlparse(url).hostname or ""
    if host not in ALLOWED_HOSTS:
        raise FetchError(f"ドスパラのURLではありません: {host or url}")


def _cached(key: str):
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit and time.time() - hit[0] < _CACHE_TTL:
            return hit[1]
    return None


def _store(key: str, src: str) -> str:
    with _CACHE_LOCK:
        _CACHE[key] = (time.time(), src)
    return src


def fetch_html(url: str, timeout: int = 8) -> str:
    """ページの HTML (サーバーが返すそのもの) を取得。

    直接接続 → Windows のシステムプロキシ経由 (PowerShell) → ヘッドレスブラウザ の順に試す。
    一度失敗した直接接続は以降スキップするので、社内ネットワークでも2回目からは待たされない。
    """
    global _DIRECT_OK
    _check_host(url)
    hit = _cached("raw:" + url)
    if hit is not None:
        return hit
    errors = []
    if _DIRECT_OK is not False:
        try:
            src = _fetch_urllib(url, timeout)
            _DIRECT_OK = True
            return _store("raw:" + url, src)
        except Exception as e:  # noqa: BLE001
            errors.append(f"直接接続: {e}")
            if _DIRECT_OK is None:
                _DIRECT_OK = False
    if os.name == "nt":
        try:
            src = _fetch_powershell(url, 45)
            return _store("raw:" + url, src)
        except Exception as e:  # noqa: BLE001
            errors.append(f"Windowsプロキシ経由: {e}")
    try:
        return _store("raw:" + url, render_html(url, budget_ms=3000))
    except Exception as e:  # noqa: BLE001
        errors.append(f"ブラウザ経由: {e}")
    raise FetchError("ページを取得できませんでした（" + " / ".join(errors) + "）")


_IMG_CACHE: dict[str, tuple[bytes, str]] = {}


def fetch_image(url: str, timeout: int = 10) -> tuple[bytes, str]:
    """商品画像を取得 (POP 側で余白を切り取って重ねるため、ローカル経由で渡す)。"""
    global _DIRECT_OK
    _check_host(url)
    if url in _IMG_CACHE:
        return _IMG_CACHE[url]
    errors = []
    data = None
    if _DIRECT_OK is not False:
        try:
            data, _ = _urllib_bytes(url, timeout, "image/*,*/*;q=0.8")
            _DIRECT_OK = True
        except Exception as e:  # noqa: BLE001
            errors.append(f"直接接続: {e}")
            if _DIRECT_OK is None:
                _DIRECT_OK = False
    if data is None and os.name == "nt":
        try:
            data = _powershell_bytes(url, 30)
        except Exception as e:  # noqa: BLE001
            errors.append(f"Windowsプロキシ経由: {e}")
    if data is None:
        raise FetchError("画像を取得できませんでした（" + " / ".join(errors) + "）")
    head = data[:16]
    ctype = ("image/png" if head.startswith(b"\x89PNG") else "image/webp" if head[8:12] == b"WEBP"
             else "image/gif" if head.startswith(b"GIF") else "image/jpeg")
    if len(_IMG_CACHE) > 200:
        _IMG_CACHE.clear()
    _IMG_CACHE[url] = (data, ctype)
    return data, ctype


# ---------------------------------------------------------------- headless browser

def find_browser() -> str | None:
    """PC にインストール済みの Edge / Chrome を探す (追加インストール不要)。"""
    env = os.environ.get("PCPOP_BROWSER")
    if env and os.path.exists(env):
        return env
    cands = []
    for base in (os.environ.get("PROGRAMFILES(X86)"), os.environ.get("PROGRAMFILES"), os.environ.get("LOCALAPPDATA")):
        if base:
            cands += [
                os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"),
            ]
    cands += [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    for name in ("msedge", "microsoft-edge", "google-chrome", "chromium", "chromium-browser", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


_BROWSER_LOCK = threading.Lock()


def render_html(url: str, budget_ms: int = 8000, timeout: int = 60, _allow_any_host: bool = False) -> str:
    """ヘッドレスの Edge/Chrome でページを開き、JavaScript 実行後の HTML を返す。

    ランキングのように JavaScript で後から表示される部分を取るために使う。
    ブラウザは Windows のプロキシ設定をそのまま使うので社内ネットワークでも通る。
    """
    if not _allow_any_host:
        _check_host(url)
    key = f"dom{budget_ms}:" + url
    hit = _cached(key)
    if hit is not None:
        return hit
    exe = find_browser()
    if not exe:
        raise FetchError("Edge / Chrome が見つかりません（環境変数 PCPOP_BROWSER で場所を指定できます）")
    # 普段使いのブラウザと干渉しないよう専用プロファイル (キャッシュが効くので2回目以降は速い)
    profile = os.path.join(tempfile.gettempdir(), "pcpop-browser-profile")
    cmd = [
        exe, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--mute-audio", f"--user-data-dir={profile}",
        f"--user-agent={UA}", "--blink-settings=imagesEnabled=false",
        f"--virtual-time-budget={budget_ms}", "--dump-dom", url,
    ]
    if os.name != "nt" and hasattr(os, "geteuid") and os.geteuid() == 0:
        cmd.insert(1, "--no-sandbox")
    with _BROWSER_LOCK:  # 同じプロファイルを同時に使わない
        r = subprocess.run(cmd, capture_output=True, timeout=timeout,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    out = r.stdout.decode("utf-8", errors="replace")
    if "<html" not in out.lower():
        err = r.stderr.decode("utf-8", errors="replace").strip().splitlines()
        raise FetchError("ブラウザでページを開けませんでした" + (f": {err[-1]}" if err else ""))
    return _store(key, out)


# ---------------------------------------------------------------- 実ブラウザで表示されるまで待って読む (DevTools)

# ページ上のランキング枠がすべて表示し終わったか (商品リンクと価格が入ったか)
RANKING_READY_JS = r"""
(() => {
  if (location.href === 'about:blank' || document.readyState !== 'complete') return false;
  const uls = [...document.querySelectorAll('ul.model-card-list.--ranking')];
  if (!uls.length) return true;
  return uls.every((ul) => {
    const a = ul.querySelector('a[href*="/MC"]');
    const p = ul.querySelector('[data-key="amttaxnounit"]');
    return a && (!p || p.textContent.trim() !== '');
  });
})()
"""


# 月々の分割価格はランキング表示のさらに後 (約1秒後) に入る: 入るまで少しだけ待つ
INSTALLMENT_READY_JS = r"""
(() => {
  const boxes = [...document.querySelectorAll('ul.model-card-list.--ranking .js-smbc-box')];
  return !boxes.length || boxes.every((b) => {
    const p = b.querySelector('.smbc_item_price');
    const price = Number((p ? p.textContent : '').replace(/[^0-9]/g, ''));
    if (price && price < 30000) return true;  // 3万円未満は分割表示なし
    const s = b.querySelector('.SmbcAuto');
    return s && s.textContent.trim() !== '';
  });
})()
"""


class _WebSocket:
    """DevTools 用の最小 WebSocket クライアント (標準ライブラリのみ)。"""

    def __init__(self, ws_url: str, timeout: float):
        import base64
        import socket

        u = urlparse(ws_url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n"
                           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise FetchError("ブラウザとの接続に失敗しました")
            head += chunk
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise FetchError("ブラウザとの接続に失敗しました: " + head.split(b"\r\n", 1)[0].decode(errors="replace"))
        self.buf = head.split(b"\r\n\r\n", 1)[1]
        self.next_id = 0

    def _read(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(max(65536, n - len(self.buf)))
            if not chunk:
                raise FetchError("ブラウザとの接続が切れました")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _send(self, text: str):
        data = text.encode()
        n = len(data)
        head = bytes([0x81])
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + n.to_bytes(2, "big")
        else:
            head += bytes([0x80 | 127]) + n.to_bytes(8, "big")
        mask = os.urandom(4)
        self.sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _recv(self) -> str:
        parts = []
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7F
            if n == 126:
                n = int.from_bytes(self._read(2), "big")
            elif n == 127:
                n = int.from_bytes(self._read(8), "big")
            payload = self._read(n)
            op = b0 & 0x0F
            if op in (0x1, 0x0):
                parts.append(payload)
                if b0 & 0x80:
                    return b"".join(parts).decode("utf-8", errors="replace")
            elif op == 0x8:
                raise FetchError("ブラウザとの接続が切れました")

    def call(self, method: str, **params):
        self.next_id += 1
        mid = self.next_id
        self._send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self._recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise FetchError(f"ブラウザ: {msg['error'].get('message')}")
                return msg.get("result", {})

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def render_until(url: str, ready_js: str = RANKING_READY_JS, timeout: float = 45, _allow_any_host: bool = False) -> str:
    """Edge/Chrome (画面なし) でページを開き、ready_js が true になる (= 表示し終わる) まで待ってから HTML を返す。

    ページの JavaScript をそのまま実行させるので、ブラウザで見えている内容と同じものが取れる。
    """
    import socket

    if not _allow_any_host:
        _check_host(url)
    key = "ready:" + url
    hit = _cached(key)
    if hit is not None:
        return hit
    exe = find_browser()
    if not exe:
        raise FetchError("Edge / Chrome が見つかりません（環境変数 PCPOP_BROWSER で場所を指定できます）")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    profile = os.path.join(tempfile.gettempdir(), "pcpop-browser-profile")
    cmd = [
        exe, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--mute-audio", f"--user-data-dir={profile}", f"--user-agent={UA}",
        "--blink-settings=imagesEnabled=false", f"--remote-debugging-port={port}",
        "--remote-allow-origins=*", "about:blank",
    ]
    if os.name != "nt" and hasattr(os, "geteuid") and os.geteuid() == 0:
        cmd.insert(1, "--no-sandbox")
    deadline = time.time() + timeout
    with _BROWSER_LOCK:
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        ws = None
        try:
            ws_url = None
            while time.time() < deadline and ws_url is None:
                try:
                    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                            f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                        pages = [t for t in json.loads(r.read()) if t.get("type") == "page"]
                    if pages:
                        ws_url = pages[0]["webSocketDebuggerUrl"]
                except OSError:
                    time.sleep(0.2)
            if not ws_url:
                raise FetchError("ブラウザを起動できませんでした")
            ws = _WebSocket(ws_url, timeout=max(5, deadline - time.time()))
            ws.call("Page.navigate", url=url)
            ready = False
            while time.time() < deadline:
                time.sleep(0.4)
                r = ws.call("Runtime.evaluate", expression=ready_js, returnByValue=True)
                if r.get("result", {}).get("value") is True:
                    ready = True
                    break
            if ready and ready_js is RANKING_READY_JS:
                grace = min(deadline, time.time() + 5)
                while time.time() < grace:
                    r = ws.call("Runtime.evaluate", expression=INSTALLMENT_READY_JS, returnByValue=True)
                    if r.get("result", {}).get("value") is True:
                        break
                    time.sleep(0.3)
            loc = ws.call("Runtime.evaluate", expression="location.href", returnByValue=True).get("result", {}).get("value") or ""
            if loc.startswith("chrome-error:") or loc == "about:blank":
                raise FetchError("ブラウザでページを開けませんでした（ネットワークに接続できません）")
            out = ws.call("Runtime.evaluate", expression="document.documentElement.outerHTML",
                          returnByValue=True).get("result", {}).get("value") or ""
        finally:
            if ws:
                ws.close()
            proc.kill()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
    if "<html" not in out.lower() and "<head" not in out.lower():
        raise FetchError("ブラウザでページを開けませんでした")
    if not ready:
        return out  # 時間内に全部は出なかった: 出ている分で読む (キャッシュしない)
    return _store(key, out)


def fetch_ranking_html(url: str) -> str:
    """ランキング (JavaScript で表示) を含む HTML を取得。ブラウザで表示し終わるまで待つ。"""
    return render_until(url)


def _urllib_bytes(url: str, timeout: int, accept: str = "*/*") -> tuple[bytes, str | None]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "ja,en;q=0.8", "Accept-Encoding": "gzip, deflate"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        enc = (res.headers.get("Content-Encoding") or "").lower()
        charset = res.headers.get_content_charset()
    if enc == "gzip":
        raw = gzip.decompress(raw)
    elif enc == "deflate":
        raw = zlib.decompress(raw)
    return raw, charset


def _fetch_urllib(url: str, timeout: int) -> str:
    raw, charset = _urllib_bytes(url, timeout, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    return raw.decode(charset or "utf-8", errors="replace")


_PS_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$wc = New-Object Net.WebClient
$wc.Proxy = [Net.WebRequest]::GetSystemWebProxy()
$wc.Proxy.Credentials = [Net.CredentialCache]::DefaultCredentials
$wc.Headers.Add('User-Agent', $env:PCPOP_UA)
$wc.Headers.Add('Accept-Language', 'ja,en;q=0.8')
$wc.DownloadFile($env:PCPOP_URL, $env:PCPOP_OUT)
"""


def _powershell_bytes(url: str, timeout: int) -> bytes:
    fd, out = tempfile.mkstemp(suffix=".html")
    os.close(fd)
    try:
        env = dict(os.environ, PCPOP_URL=url, PCPOP_OUT=out, PCPOP_UA=UA)
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", _PS_SCRIPT],
            env=env, capture_output=True, timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if r.returncode != 0:
            raw = r.stderr or r.stdout or b""
            try:
                msg = raw.decode("utf-8")
            except UnicodeDecodeError:
                msg = raw.decode("cp932", "replace")  # 日本語版 Windows の PowerShell 出力
            msg = msg.strip()
            raise RuntimeError(msg.splitlines()[0] if msg else f"exit {r.returncode}")
        with open(out, "rb") as f:
            return f.read()
    finally:
        try:
            os.remove(out)
        except OSError:
            pass


def _fetch_powershell(url: str, timeout: int) -> str:
    return _powershell_bytes(url, timeout).decode("utf-8", errors="replace")


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
    if not pj and not table:
        hint = ""
        if _RANK_UL.search(src):
            hint = "（ランキング/一覧ページのようです。「人気ランキングPOP」画面を使ってください）"
        raise ParseError("商品ページのスペック情報が見つかりません" + hint)
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



# ---------------------------------------------------------------- ranking

class RankingNotRendered(ParseError):
    """ランキング枠はあるが、中身が JavaScript で後から描画されるため空のケース。"""


_RANK_UL = re.compile(r'<ul\b[^>]*class="[^"]*\bmodel-card-list\b[^"]*--ranking[^"]*"[^>]*>', re.I)
_RANK_LI = re.compile(r'<li\b[^>]*\bdata-ranking="(\d+)"[^>]*>', re.I)
_MC_URL = re.compile(r"/(MC\d+)(?:-SN\d+)?\.html", re.I)


def _by_key(chunk: str, key: str) -> str:
    """data-key="xxx" を持つ要素のテキスト (ドスパラ一覧の共通マークアップ)。"""
    v = _first(rf'<(?:p|span|div)[^>]*data-key="{key}"[^>]*>(.*?)</(?:p|span|div)>', chunk)
    return _text(v) if v else ""


_CARD_LI = re.compile(r'<li\b(?=[^>]*(?:\bclass="[^"]*\bmodel-card\b|\bdata-ranking=))[^>]*>', re.I)


def parse_ranking(src: str, base_url: str = BASE, limit: int | None = None) -> list[dict]:
    """ランキング `ul.model-card-list.--ranking` (JavaScript で表示された後の HTML) を全件返す。

    カードごとに 順位・商品URL・名前・画像・価格・出荷目安・主要スペック・訴求タグ。
    順位は li か カード内の data-ranking。色違いの <object> (別順位の画像/ボタン) は読まない。
    """
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)  # コメントアウトされたタグを除外
    m = _RANK_UL.search(src)
    if not m:
        return []
    body = src[m.end():]
    nxt = _RANK_UL.search(body)  # 次のランキング枠より前まで
    if nxt:
        body = body[:nxt.start()]
    lis = list(_CARD_LI.finditer(body))
    items = []
    for i, li in enumerate(lis):
        end = lis[i + 1].start() if i + 1 < len(lis) else len(body)
        raw = body[li.start():end]
        # 色違い (例: ホワイト) は <object class="model-img|model-btn" data-ranking="5〜8"> に入っている
        var_img = var_url = var_color = ""
        for tag, inner in re.findall(r'(?is)(<object\b[^>]*>)(.*?)</object>', raw):
            if not re.search(r'\bdata-ranking=|\bmodel-(?:img|btn)\b', tag):
                continue
            if re.search(r'\bmodel-img\b', tag):
                var_img = var_img or (_first(r'<img\b[^>]*\bsrc="(http[^"]+)"', inner) or "")
            if re.search(r'\bmodel-btn\b', tag):
                var_color = var_color or _text(inner)
                var_url = var_url or (_first(r'<a\b[^>]*\bhref="([^"]*MC\d+[^"]*)"', inner) or "")
        chunk = re.sub(r'(?is)<object\b(?=[^>]*(?:\bdata-ranking=|\bclass="[^"]*\bmodel-(?:img|btn)\b))[^>]*>.*?</object>',
                       "", raw)
        main_color = _text(_first(r'(?is)<div\b[^>]*class="[^"]*\bmodel-btn\b[^"]*"[^>]*>(.*?)</div>', chunk) or "")
        rank = _first(r'data-ranking="(\d+)"', chunk)
        href = _first(r'<a\b[^>]*\bhref="([^"]*MC\d+[^"]*)"', chunk) or ""
        href = html.unescape(href)
        if not rank or not _MC_URL.search(href):
            continue  # 未表示のテンプレート (href 空など)
        img = _first(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*data-key="primeimgurl"', chunk) or _first(
            r'<img\b[^>]*data-key="primeimgurl"[^>]*\bsrc="([^"]+)"', chunk) or _first(r'<img\b[^>]*\bsrc="(http[^"]+)"', chunk)
        monthly = _first(r'data-format="\{installmentAmt\}"[^>]*>([\d,]+)<', chunk)
        count = _first(r'data-format="\{installment\}回"[^>]*>(\d+)回<', chunk)
        items.append({
            "rank": int(rank),
            "url": urljoin(base_url, href),
            "name": _by_key(chunk, "primename"),
            "image": html.unescape(img) if img else "",
            "image2": html.unescape(var_img),          # 色違い (白など) の画像
            "url2": urljoin(base_url, html.unescape(var_url)) if var_url else "",
            "colors": [c for c in (main_color, var_color) if c],
            "price": _to_int(_by_key(chunk, "amttaxnounit")),
            "stock": _by_key(chunk, "stkname"),
            "os": _by_key(chunk, "os"),
            "cpu": _by_key(chunk, "cpu"),
            "video": _by_key(chunk, "video"),
            "tags": [_text(t) for t in re.findall(r'<p class="tag-appeal">(.*?)</p>', chunk, re.S) if _text(t)],
            "installment": {"monthly": _to_int(monthly), "count": _to_int(count)} if monthly else None,
        })
    if not items:
        raise RankingNotRendered(
            "ランキング枠の中身が空です（ページのソースには順位が入っていません）。"
            "「ランキング取得」ボタンを使うか、ドスパラのページで F12 →「Console」のコードでコピーしたものを貼ってください。"
        )
    items.sort(key=lambda x: x["rank"])
    return items[:limit] if limit else items


# ---------------------------------------------------------------- series rankings (例: /TC30)

def _lines(fragment: str) -> list[str]:
    """HTML 断片を「見た目の行」に分けたテキストにする (ブロック要素の区切りで改行)。"""
    s = re.sub(r"(?is)<(script|style)\b.*?</\1>", "", fragment)
    s = re.sub(r"(?i)<br\s*/?>|</(p|div|li|dt|dd|tr|td|th|h[1-6]|ul|dl|section|a|button)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    out = []
    for ln in s.split("\n"):
        ln = re.sub(r"[ \t　]+", " ", ln).strip()
        if ln:
            out.append(ln)
    return out


# 本体価格 "244,980円(税込)" (月々の "円(税込/36回払い)" は除外)
_PRICE = re.compile(
    r"(\d{1,3}(?:,\d{3})+)\s*(?:<[^>]+>\s*)*円\s*(?:<[^>]+>\s*)*[（(]\s*税込\s*[)）]"
)
_HEADING = re.compile(r"<(h[1-6])\b[^>]*>(.*?)</\1>", re.S | re.I)
_A_TAG = re.compile(r'<a\b[^>]*\bhref="([^"]*?/(MC\d+)(?:-SN\d+)?\.html[^"]*)"[^>]*>(.*?)</a>', re.S | re.I)
_IMG_SRC = re.compile(r'<img\b[^>]*\bsrc="([^"]+)"', re.I)
_PRODUCT_IMG = re.compile(r"(/img/large/|/dw/image/|Sites-dospara-catalog)", re.I)
_SPEC_LABELS = {"OS": "os", "GPU": "video", "CPU": "cpu"}


def _series_name(title: str) -> str:
    t = re.sub(r"(ゲーミング)?(PC|パソコン)?\s*(おすすめ|人気|売れ筋)?\s*ランキング.*$", "", title).strip()
    return t or title


def _parse_series_cards(region: str, base_url: str) -> list[dict]:
    """価格を手がかりにカードを区切る。カード = [前の価格〜この価格] に名前・画像、[この価格〜次の価格] にスペック。"""
    prices = list(_PRICE.finditer(region))
    items = []
    for k, pm in enumerate(prices):
        start = prices[k - 1].end() if k else 0
        end = prices[k + 1].start() if k + 1 < len(prices) else len(region)
        before, after = region[start:pm.start()], region[pm.end():end]
        links = list(_A_TAG.finditer(before))
        if not links:
            continue
        main = links[-1]  # 価格の直前のリンク = このカードの商品 (前カードの色違いボタンより後ろ)
        mc = main.group(2)
        names = [_text(a.group(3)) for a in links if a.group(2) == mc]
        alts = re.findall(r'alt="([^"]{6,})"', before)
        cand = [n for n in names if len(n) >= 6] + [html.unescape(a) for a in alts[-2:]]
        name = max(cand, key=len) if cand else ""
        if not name:
            g = [ln for ln in _lines(before) if re.match(r"(GALLERIA|THIRDWAVE|raytrek|Diginnos)", ln, re.I)]
            name = g[-1] if g else ""
        imgs = [u for u in _IMG_SRC.findall(before) if _PRODUCT_IMG.search(u)]
        stock = [ln for ln in _lines(before) if "出荷" in ln and len(ln) <= 15]
        spec = {"os": "", "video": "", "cpu": ""}
        lines = _lines(after)
        for i, ln in enumerate(lines):
            m = re.match(r"^(OS|GPU|CPU)\s*[：:]?\s*(.*)$", ln)
            if not m or spec[_SPEC_LABELS[m.group(1)]]:
                continue
            val = m.group(2).lstrip("：: ").strip()
            if not val and i + 1 < len(lines):
                val = lines[i + 1].lstrip("：: ").strip()
            spec[_SPEC_LABELS[m.group(1)]] = val
        joined = " ".join(lines)
        mon = re.search(r"月々\s*([\d,]+)\s*円.*?(\d+)\s*回", joined)
        items.append({
            "rank": len(items) + 1,
            "url": urljoin(base_url, html.unescape(main.group(1))),
            "name": name,
            "image": html.unescape(imgs[-1]) if imgs else "",
            "price": _to_int(pm.group(1)),
            "stock": stock[-1] if stock else "",
            **spec,
            "tags": [],
            "installment": {"monthly": _to_int(mon.group(1)), "count": _to_int(mon.group(2))} if mon else None,
        })
    return items


def parse_ranking_sections(src: str, base_url: str = BASE) -> list[dict]:
    """ページ内の「〜ランキング」見出しごとにランキングを返す。

    戻り値: [{"title": 見出し, "series": シリーズ名, "items": [...]}]
    - /gamepc のような ul.model-card-list.--ranking はその構造で読む
    - /TC30 のようなシリーズ別ランキングは、見出し〜次の見出しの範囲で価格を手がかりにカードを読む
    """
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    src = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", "", src)
    heads = list(_HEADING.finditer(src))
    sections = []
    for i, h in enumerate(heads):
        title = _text(h.group(2))
        if "ランキング" not in title:
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(src)
        region = src[h.end():end]
        if _RANK_UL.search(region):
            try:
                items = parse_ranking(region, base_url)
            except RankingNotRendered:
                items = []
        else:
            items = _parse_series_cards(region, base_url)
        if items:
            sections.append({"title": title, "series": _series_name(title), "items": items})
    if not sections:
        # 見出しが無い / 取れない場合: ランキング枠単体
        items = parse_ranking(src, base_url)  # 未描画なら RankingNotRendered
        if items:
            sections.append({"title": "人気ランキング", "series": "人気ランキング", "items": items})
    return sections


if __name__ == "__main__":
    import sys

    target = sys.argv[1]
    src = open(target, encoding="utf-8").read() if not target.startswith("http") else fetch_html(target)
    print(json.dumps(parse_product(src, target), ensure_ascii=False, indent=2))
