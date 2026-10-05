"""ドスパラ PC POP 作成ツール (ローカルサーバー)

使い方:
    python pcpop.py            # http://127.0.0.1:8765 をブラウザで開く
    python pcpop.py --port 9000 --no-browser
"""
from __future__ import annotations

import argparse
import json
import time
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import scraper

STATIC = Path(__file__).resolve().parent / "static"
MAX_BODY = 20 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[pcpop]", fmt % args)

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        f = (STATIC / path.lstrip("/")).resolve()
        if STATIC not in f.parents or not f.is_file():
            return self._send(404, b"not found", "text/plain")
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
        }.get(f.suffix, "application/octet-stream")
        self._send(200, f.read_bytes(), ctype)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._json(413, {"error": "リクエストが大きすぎます"})
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "JSONが不正です"})

        try:
            if self.path == "/api/fetch":
                url = (req.get("url") or "").strip()
                src = scraper.fetch_html(url)
                return self._json(200, scraper.parse_product(src, url))
            if self.path == "/api/ranking":
                # ページ内の「〜ランキング」をシリーズごとに返す (空の枠はランキング用カテゴリの一覧から埋める)
                url = (req.get("url") or "").strip()
                sections, warnings = scraper.ranking_sections(url, req.get("html") or None)
                if not sections:
                    msg = "ページ内にランキングが見つかりませんでした"
                    return self._json(422, {"error": msg + ("\n" + "\n".join(warnings) if warnings else "")})
                return self._json(200, {"sections": sections, "warnings": warnings})
            if self.path == "/api/parse":
                # 取得がブロックされた時用: ブラウザで「ページのソース」を貼り付け
                src = req.get("html") or ""
                return self._json(200, scraper.parse_product(src, req.get("url", "")))
        except scraper.FetchError as e:
            return self._json(502, {"error": str(e)})
        except scraper.ParseError as e:
            return self._json(422, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": f"解析エラー: {e}"})
        self._json(404, {"error": "not found"})


def _bind(port: int) -> ThreadingHTTPServer:
    """指定ポートが使えない場合 (Windows の予約ポート WinError 10013 / 使用中など) は別ポートを試す。"""
    candidates = [port, 8080, 8000, 18765, 28765, 0]  # 0 = OS に空きポートを選ばせる
    last = None
    for p in dict.fromkeys(candidates):
        try:
            return ThreadingHTTPServer(("127.0.0.1", p), Handler)
        except OSError as e:
            print(f"[pcpop] ポート {p} は使用できません: {e}")
            last = e
    raise SystemExit(f"起動できませんでした: {last}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    srv = _bind(a.port)
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print(f"PC POP ツール起動: {url}  (終了: Ctrl+C)")
    if not a.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
