import unittest
from pathlib import Path

import scraper

FIX = Path(__file__).parent / "fixtures" / "MC25585-SN5037.html"


class TestDosparaParse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = scraper.parse_product(FIX.read_text(encoding="utf-8"), "x")

    def spec(self, label):
        return next(s["value"] for s in self.d["keySpecs"] if s["label"] == label)

    def test_basic(self):
        d = self.d
        self.assertEqual(d["productId"], "MC25585-SN5037")
        self.assertEqual(d["model"], "GALLERIA XPR7A-R57-GD Ryzen 7 7700/LEDファン標準搭載モデル")
        self.assertTrue(d["edition"].startswith("『Minecraft"))
        self.assertEqual(d["price"], 301080)
        self.assertEqual(d["installment"], {"monthly": 8400, "count": 36})
        self.assertEqual(d["stock"], "翌日出荷")
        self.assertEqual(d["manageCode"], "25585-5037")
        self.assertEqual(d["warnings"], [])

    def test_key_specs(self):
        self.assertEqual(self.spec("CPU"), "AMD Ryzen 7 7700 (3.8GHz-5.3GHz/8コア/16スレッド)")
        self.assertTrue(self.spec("GPU").startswith("NVIDIA GeForce RTX 5070 12GB GDDR7"))
        self.assertEqual(self.spec("メモリ"), "16GB (16GB×1) (DDR5-4800)")
        self.assertEqual(self.spec("SSD"), "1TB SSD (M.2 NVMe Gen4)")
        self.assertEqual(self.spec("電源"), "750W 電源 (80PLUS GOLD)")
        self.assertEqual(self.spec("OS"), "Windows 11 Home 64ビット")
        shown = [s["label"] for s in self.d["keySpecs"] if s["show"]]
        self.assertEqual(shown, ["OS", "CPU", "GPU", "メモリ", "SSD", "マザーボード", "電源", "CPUクーラー"])
        gpu = next(s for s in self.d["keySpecs"] if s["label"] == "GPU")
        self.assertEqual(gpu["display"], "NVIDIA GeForce RTX 5070 12GB GDDR7 (HDMI x1，DisplayPort x3)")

    def test_spec_table(self):
        t = {r["label"]: r["value"] for r in self.d["specTable"]}
        self.assertEqual(len(self.d["specTable"]), 33)
        self.assertEqual(t["CPUグリス"], "ノーマルグリス\n熱伝導率: 5W/m･K程度")  # 大文字 <BR>
        self.assertEqual(t["Minecraft ライセンス"], "Minecraft Java&Bedrock Edition")
        self.assertEqual(t["サイズ"], "220（幅）×488（奥行き）×498（高さ） mm")

    def test_benchmark(self):
        b = self.d["benchmark"]
        self.assertEqual((b["timeSpy"], b["Fire Strike"], b["Fire Strike Ultra"], b["level"]),
                         (20258, 44905, 14468, 5))

    def test_images_and_labels(self):
        imgs = self.d["images"]
        self.assertTrue(imgs[0].endswith("case_ge-gd_main.png"))
        self.assertEqual(sum("case_ge-gd_main" in u for u in imgs), 1)
        self.assertEqual(len(self.d["labels"]), 4)

    def test_reject_other_host(self):
        with self.assertRaises(scraper.FetchError):
            scraper.fetch_html("https://example.com/")



class TestRanking(unittest.TestCase):
    """実ページ /gamepc のランキング部分 (ブラウザ描画後) で検証。"""

    @classmethod
    def setUpClass(cls):
        src = (Path(__file__).parent / "fixtures" / "gamepc_ranking.html").read_text(encoding="utf-8")
        cls.items = scraper.parse_ranking(src, "https://www.dospara.co.jp/gamepc")

    def test_all_items_in_rank_order(self):
        self.assertEqual([i["rank"] for i in self.items], [1, 2, 3, 4])
        self.assertEqual([i["url"] for i in self.items], [
            "https://www.dospara.co.jp/TC30/MC25585-SN5037.html",
            "https://www.dospara.co.jp/TC30/MC25617-SN4914.html",
            "https://www.dospara.co.jp/TC30/MC25629-SN4995.html",
            "https://www.dospara.co.jp/TC30/MC23019-SN4776.html",
        ])

    def test_item_fields(self):
        it = self.items[1]
        self.assertTrue(it["name"].startswith("GALLERIA XGR5M-R56T8G-GD Ryzen 5 7500F"))
        self.assertEqual((it["price"], it["stock"], it["cpu"], it["video"], it["os"]),
                         (221080, "翌日出荷", "Ryzen 5 7500F", "GeForce RTX 5060 Ti 8GB", "Windows 11 Home"))
        self.assertEqual(it["installment"], {"monthly": 6200, "count": 36})
        self.assertEqual(it["tags"], ["32GBメモリへの変更が半額", "2TB HDD追加が半額"])
        self.assertIn("case_gem-gd_main.png", it["image"])

    def test_commented_out_tags_are_ignored(self):
        self.assertEqual(self.items[3]["tags"], [])
        self.assertEqual(self.items[3]["price"], 524980)

    def test_unrendered_template_raises(self):
        src = '<ul class="model-card-list --ranking get_ranking_data" data-categoryname="TC30">' \
              '<li data-ranking="1"><a class="model-card" href="" data-key="primeurl"></a></li></ul>'
        with self.assertRaises(scraper.RankingNotRendered):
            scraper.parse_ranking(src)

    def test_no_ranking_block(self):
        self.assertEqual(scraper.parse_ranking('<a href="/TC30/MC1.html">x</a>'), [])


class TestSeriesRanking(unittest.TestCase):
    """/TC30 のシリーズ別ランキング (画面キャプチャから再現した合成HTML)。"""

    @classmethod
    def setUpClass(cls):
        src = (Path(__file__).parent / "fixtures" / "tc30_series_synthetic.html").read_text(encoding="utf-8")
        cls.secs = scraper.parse_ranking_sections(src, "https://www.dospara.co.jp/TC30")

    def test_sections(self):
        self.assertEqual([s["series"] for s in self.secs], ["Fシリーズ（ピラーレス）", "Eシリーズ（Mini ITX）"])
        self.assertEqual([len(s["items"]) for s in self.secs], [4, 3])

    def test_cards(self):
        f = self.secs[0]["items"]
        self.assertEqual([i["url"].rsplit("/", 1)[1] for i in f],
                         ["MC30001-SN1.html", "MC30002-SN1.html", "MC30003-SN1.html", "MC30004-SN1.html"])  # 色違いボタンは無視
        self.assertEqual([i["price"] for i in f], [244980, 489980, 329980, 359980])  # 月々の価格は拾わない
        self.assertEqual((f[1]["cpu"], f[1]["video"], f[1]["os"]), ("Ryzen 7 9800X3D", "GeForce RTX 5080 16GB", "Windows 11 Home"))
        self.assertEqual(f[1]["name"], "GALLERIA FDR7A-R58-B Ryzen 7 9800X3D搭載モデル")
        self.assertEqual(f[0]["installment"], {"monthly": 6800, "count": 36})
        self.assertIn("case_fg_main.png", f[0]["image"])

    def test_gamepc_block_becomes_one_section(self):
        src = (Path(__file__).parent / "fixtures" / "gamepc_ranking.html").read_text(encoding="utf-8")
        secs = scraper.parse_ranking_sections(src)
        self.assertEqual(len(secs), 1)
        self.assertEqual(len(secs[0]["items"]), 4)


class TestErrors(unittest.TestCase):
    def setUp(self):
        scraper._CACHE.clear()
        scraper._DIRECT_OK = None

    def test_ranking_page_is_not_a_product(self):
        src = (Path(__file__).parent / "fixtures" / "gamepc_ranking.html").read_text(encoding="utf-8")
        with self.assertRaisesRegex(scraper.ParseError, "人気ランキングPOP"):
            scraper.parse_product(src, "https://www.dospara.co.jp/gamepc")

    def test_fetch_falls_back_to_powershell_on_windows(self):
        from unittest import mock
        with mock.patch.object(scraper, "_fetch_urllib", side_effect=TimeoutError("timed out")), \
             mock.patch.object(scraper.os, "name", "nt"), \
             mock.patch.object(scraper, "_fetch_powershell", return_value="<html>ok</html>") as ps:
            self.assertEqual(scraper.fetch_html("https://www.dospara.co.jp/gamepc"), "<html>ok</html>")
            ps.assert_called_once()

    def test_fetch_error_lists_both_attempts(self):
        from unittest import mock
        with mock.patch.object(scraper, "_fetch_urllib", side_effect=TimeoutError("timed out")), \
             mock.patch.object(scraper.os, "name", "nt"), \
             mock.patch.object(scraper, "_fetch_powershell", side_effect=RuntimeError("407 Proxy")):
            with self.assertRaisesRegex(scraper.FetchError, "直接接続: timed out.*Windowsプロキシ経由: 407"):
                scraper.fetch_html("https://www.dospara.co.jp/gamepc")



class TestFetchSpeed(unittest.TestCase):
    def setUp(self):
        scraper._CACHE.clear()
        scraper._DIRECT_OK = None

    def test_direct_failure_is_remembered_and_cache_is_used(self):
        from unittest import mock
        with mock.patch.object(scraper, "_fetch_urllib", side_effect=TimeoutError("timed out")) as direct, \
             mock.patch.object(scraper.os, "name", "nt"), \
             mock.patch.object(scraper, "_fetch_powershell", return_value="<html>p</html>") as ps:
            scraper.fetch_html("https://www.dospara.co.jp/TC30/MC1.html")
            scraper.fetch_html("https://www.dospara.co.jp/TC30/MC2.html")
            scraper.fetch_html("https://www.dospara.co.jp/TC30/MC2.html")  # キャッシュ
            self.assertEqual(direct.call_count, 1)  # 2回目以降は直接接続を待たない
            self.assertEqual(ps.call_count, 2)

    def test_render_rejects_other_hosts(self):
        with self.assertRaises(scraper.FetchError):
            scraper.render_html("https://example.com/")


class TestTC30Rendered(unittest.TestCase):
    """/TC30 をブラウザで表示し終わった後の HTML (ページの JavaScript が枠を埋めた状態)。"""

    def setUp(self):
        d = Path(__file__).parent / "fixtures"
        self.rendered = (d / "tc30_rendered.html").read_text(encoding="utf-8")
        self.raw = (d / "tc30_raw.html").read_text(encoding="utf-8")

    def test_series_in_page_order(self):
        secs = scraper.parse_ranking_sections(self.rendered, "https://www.dospara.co.jp/TC30")
        self.assertEqual([s["series"] for s in secs], ["Xシリーズ", "Fシリーズ（ピラーレス）", "Eシリーズ（Mini ITX）"])
        f = secs[1]["items"]
        self.assertEqual([i["rank"] for i in f], [1, 2, 3, 4])
        self.assertEqual([i["price"] for i in f], [244980, 489980, 329980, 359980])
        self.assertTrue(f[0]["name"].startswith("GALLERIA FGR7M-R56T8G-B "))
        self.assertEqual(f[0]["url"], "https://www.dospara.co.jp/TC30/MC25320-SN4902.html")
        self.assertEqual(f[0]["cpu"], "Ryzen 7 5700X")
        self.assertEqual(f[0]["video"], "GeForce RTX 5060 Ti 8GB")
        self.assertEqual(f[0]["stock"], "翌日出荷")
        self.assertEqual(f[0]["installment"], {"monthly": 6800, "count": 36})
        # 白モデル (data-ranking=5〜8 の <object>) は順位に混ざらず、色違いとして付く
        self.assertFalse(any("-W " in i["name"] for i in f))
        self.assertEqual(f[0]["colors"], ["ブラック", "ホワイト"])
        self.assertTrue(f[0]["image"].endswith("case_sfm-b_main.png?sw=400"))
        self.assertTrue(f[0]["image2"].endswith("case_sfm-w_main.png?sw=400"))
        self.assertEqual(f[0]["url2"], "https://www.dospara.co.jp/TC30/MC25320-SN4902.html")

    def test_raw_source_is_reported_as_not_rendered(self):
        with self.assertRaises(scraper.RankingNotRendered):
            scraper.parse_ranking_sections(self.raw, "https://www.dospara.co.jp/TC30")


class TestTC143Rendered(unittest.TestCase):
    """/TC143 (ゲーミングノート): li.get_ranking_data のカード。名前の欄はコメントアウト、画面サイズあり。"""

    def setUp(self):
        d = Path(__file__).parent / "fixtures"
        self.rendered = (d / "tc143_rendered.html").read_text(encoding="utf-8")
        self.raw = (d / "tc143_raw.html").read_text(encoding="utf-8")

    def test_note_ranking(self):
        secs = scraper.parse_ranking_sections(self.rendered, "https://www.dospara.co.jp/TC143")
        self.assertEqual([s["series"] for s in secs], ["Nシリーズ（ゲーミングノート）"])
        items = secs[0]["items"]
        self.assertEqual([i["rank"] for i in items], [1, 2, 3, 4])
        self.assertEqual([i["price"] for i in items], [199980, 259980, 429980, 149980])
        a = items[0]
        self.assertEqual(a["url"], "https://www.dospara.co.jp/TC143/MC24001.html")
        self.assertTrue(a["name"].startswith("GALLERIA XL7C-R56-6"))
        self.assertEqual(a["cpu"], "インテル Core i7-13620H")
        self.assertEqual(a["video"], "GeForce RTX 5060 Laptop GPU 8GB")
        self.assertEqual(a["os"], "Windows 11 Home")
        self.assertEqual(a["display"], "15.6インチ")
        self.assertEqual(a["stock"], "翌日出荷")
        self.assertEqual(a["installment"], {"monthly": 5500, "count": 36})

    def test_name_falls_back_to_image_alt(self):
        src = self.rendered.replace('data-key="primename"', 'data-key="x"').replace(
            'alt="" data-key="primeimgurl"', 'alt="GALLERIA ALT NAME" data-key="primeimgurl"', 1)
        items = scraper.parse_ranking_sections(src)[0]["items"]
        self.assertEqual(items[0]["name"], "GALLERIA ALT NAME")

    def test_raw_source_is_reported_as_not_rendered(self):
        with self.assertRaises(scraper.RankingNotRendered):
            scraper.parse_ranking_sections(self.raw, "https://www.dospara.co.jp/TC143")




class TestAddMemory(unittest.TestCase):
    """デスクトップ (/TC30)・ノート (/TC143) とも商品ページからメモリを付ける。"""

    def test_desktop_and_note(self):
        d = Path(__file__).parent / "fixtures"
        product = (d / "MC25585-SN5037.html").read_text(encoding="utf-8")
        desk = scraper.parse_ranking_sections((d / "tc30_rendered.html").read_text(encoding="utf-8"))
        note = scraper.parse_ranking_sections((d / "tc143_rendered.html").read_text(encoding="utf-8"))
        opened = []

        def fake(url, timeout=8):
            opened.append(url)
            return product

        orig = scraper.fetch_html
        scraper.fetch_html = fake
        try:
            errors = scraper.add_memory(desk + note)
        finally:
            scraper.fetch_html = orig
        self.assertEqual(errors, [])
        self.assertEqual(desk[0]["items"][0]["memory"], "16GB (16GB×1) (DDR5-4800)")
        self.assertEqual(note[0]["items"][0]["memory"], "16GB (16GB×1) (DDR5-4800)")
        self.assertTrue(any("/TC143/" in u for u in opened))
        self.assertEqual(len(opened), len(set(opened)))  # 同じ商品ページは1回だけ

    def test_failure_falls_back(self):
        d = Path(__file__).parent / "fixtures"
        desk = scraper.parse_ranking_sections((d / "tc30_rendered.html").read_text(encoding="utf-8"))
        orig = scraper.fetch_html
        scraper.fetch_html = lambda url, timeout=8: (_ for _ in ()).throw(scraper.FetchError("offline"))
        try:
            errors = scraper.add_memory(desk)
        finally:
            scraper.fetch_html = orig
        self.assertEqual(desk[0]["items"][0]["memory"], "")
        self.assertEqual(len(errors), 1)


class TestPopSheet(unittest.TestCase):
    """個別POP (店頭フォーマット) 用の整形。"""

    def test_sheet_from_product_page(self):
        d = scraper.parse_product(FIX.read_text(encoding="utf-8"), "x")
        s = d["sheet"]
        self.assertEqual((s["brand"], s["series"], s["code"], s["mc"]), ("GALLERIA", "X-Series", "XPR7A-R57-GD", "MC25585"))
        b = {x["key"]: x for x in s["basic"]}
        self.assertEqual((b["GPU"]["main"], b["GPU"]["sub"], b["GPU"]["brand"]),
                         ("GeForce RTX 5070 12GB", "(HDMI x1, DisplayPort x3)", "geforce"))
        self.assertEqual((b["CPU"]["main"], b["CPU"]["sub"], b["CPU"]["brand"]),
                         ("AMD Ryzen 7 7700", "(3.8GHz-5.3GHz/8コア/16スレッド)", "amd"))
        self.assertEqual((b["メモリ"]["main"], b["メモリ"]["sub"]), ("16GB", "(16GB×1) (DDR5-4800)"))
        self.assertEqual(b["SSD"]["main"], "1TB SSD")
        self.assertEqual(b["OS"]["main"], "Windows 11 Home 64ビット")
        self.assertEqual(s["ports"]["cols"], ["前面", "背面"])
        self.assertEqual(s["ports"]["rows"]["2.0"], [2, 4])
        self.assertEqual(s["ports"]["rows"]["3.2 Gen1 Type-A"], [2, 5])
        self.assertEqual(s["ports"]["rows"]["3.2 Gen2 Type-C"], [0, 1])
        self.assertEqual(s["wifi"], {"main": "非搭載", "sub": "※別途オプション"})
        self.assertEqual(s["lan"], {"main": "2.5Gb", "sub": "対応LANポート"})
        self.assertEqual(s["size"], {"W": "220", "D": "488", "H": "498"})
        self.assertEqual(s["weight"], "16")
        self.assertEqual(s["warranty"], "持込修理保証: 保証期間1年")

    def test_ports_variants(self):
        p = scraper.parse_ports("左側面:USB3.2 Gen2 Type-C ×1、USB 3.2 Gen1 Type-A x2\n右側面:Thunderbolt 4 ×1、USB4 ×1")
        self.assertEqual(p["cols"], ["左側面", "右側面"])
        self.assertEqual(p["rows"]["3.2 Gen2 Type-C"], [1, 0])
        self.assertEqual(p["rows"]["3.2 Gen1 Type-A"], [2, 0])
        self.assertEqual(p["rows"]["Thunderbolt 4"], [0, 1])
        self.assertEqual(p["rows"]["4.0"], [0, 1])

    def test_game_fps_table(self):
        src = ("<table><tr><th>ゲームタイトル</th><th>FHD</th><th>4K</th></tr>"
               "<tr><th>Apex Legends</th><td>275 fps</td><td>170fps</td></tr>"
               "<tr><th>Valorant</th><td>375</td><td>375</td></tr></table>")
        g = scraper.parse_game_fps(src)
        self.assertEqual(g["cols"], ["FHD", "4K"])
        self.assertEqual(g["rows"][0], {"title": "Apex Legends", "vals": ["275 fps", "170 fps"]})
        self.assertEqual(g["rows"][1]["vals"], ["375 fps", "375 fps"])
        # fps の無い表 (推奨fps の説明表など見出しに解像度が無いもの) は使わない
        self.assertEqual(scraper.parse_game_fps("<table><tr><th>ジャンル</th><th>推奨fps</th></tr><tr><th>FPS</th><td>120 fps以上</td></tr></table>"), {})


class TestFpsData(unittest.TestCase):
    """data フォルダの fps データ (ul_fpsdate.json) を MC番号で引く。"""

    def test_lookup(self):
        g = scraper.fps_for("MC19364")
        # 店頭POPの見本 (XPC7A-R57-GD) と同じ値: 画質「最高」の FHD / 4K
        self.assertEqual(g["Apex Legends"]["最高"]["1080p/FHD"], "275 fps")
        self.assertEqual(g["Apex Legends"]["最高"]["2160p/4K"], "170 fps")
        self.assertEqual(g["Cyberpunk 2077"]["最高"]["1080p/FHD"], "145 fps")
        self.assertEqual(scraper.fps_for("MC00000"), {})

    def test_in_sheet(self):
        d = scraper.parse_product(FIX.read_text(encoding="utf-8"), "x")
        self.assertEqual(d["sheet"]["fps"]["Valorant"]["最高"]["1080p/FHD"], "445 fps")


class TestNoteSheet(unittest.TestCase):
    """ノートPC (GALLERIA / THIRDWAVE) の個別POP用データ。"""

    def load(self, name):
        src = (Path(__file__).parent / "fixtures" / f"{name}.html").read_text(encoding="utf-8")
        return scraper.parse_product(src, "x")["sheet"]

    def test_galleria_note(self):
        s = self.load("note_galleria")
        self.assertEqual((s["series"], s["code"], s["pid"]), ("N-Series", "NPC7L-R56-G5", "MC25167-SN3526"))
        n = s["note"]
        self.assertEqual((n["inch"], n["panel"], n["hz"], n["res"], n["weight"]), ("15.3", "非光沢液晶", "165", "1920 x 1200", "1.9"))
        self.assertEqual(n["gamut"], "sRGB 100%")
        self.assertEqual(n["wifi"], {"main": "6E 対応", "sub": "(ax/ac/a/b/g/n)"})
        self.assertEqual(n["lan"], {"main": "1Gb", "sub": "対応LANポート"})
        self.assertTrue(n["hdmi"])
        self.assertEqual(n["usb"], ["3.2 Gen1 Type-A X 3", "3.2 Gen2 Type-C X 2"])
        self.assertEqual((n["size"], n["sizeNote"]), ({"W": "342", "D": "254", "H": "30"}, "(ゴム足含む)"))
        self.assertEqual(n["uses"], {})            # GALLERIA はゲーム性能の表
        self.assertTrue(s["fps"])

    def test_thirdwave_note(self):
        s = self.load("note_thirdwave")
        self.assertEqual((s["brand"], s["series"], s["code"]), ("THIRDWAVE", "", "DA5-C7HIGA-08S"))
        cpu = next(b for b in s["basic"] if b["key"] == "CPU")
        self.assertEqual(cpu["main"], "インテル Core Ultra 7 155H")
        n = s["note"]
        self.assertEqual((n["inch"], n["hz"], n["res"], n["weight"]), ("15.6", "60", "1920 x 1080", "1.7"))
        self.assertEqual(n["gamut"], "")  # 色域の記載なし
        self.assertEqual(n["gpu"], {"main": "インテル Arc グラフィックス", "sub": "(CPU内蔵)"})
        self.assertEqual(n["wifi"]["main"], "7 対応")
        # 用途の目安は data/ul_specdate.json から
        self.assertEqual(n["uses"], {"動画視聴": "◎", "office": "◎", "動画編集": "◎", "クラウドAI": "◎", "ローカルAI": "◎"})

    def test_desktop_is_not_note(self):
        self.assertIsNone(scraper.parse_product(FIX.read_text(encoding="utf-8"), "x")["sheet"]["note"])


class TestPortVariants(unittest.TestCase):
    """入出力ポートの USB 表記ゆれ。"""

    def rows(self, text):
        p = scraper.parse_ports(text)
        return {n: c for n, c in p["rows"].items() if sum(c)}

    def test_type_inside_parentheses(self):
        # 括弧の中の「、」で切らない: Gen2 は Type-C、Gen1 は Type-A。HDMI の "Type A" は数えない
        src = ("USB3.2 Gen2 (Type-C、映像出力 DisplayPort1.4 対応、PD対応/65W) ×1、USB3.2 Gen1 (Type-A) ×2、"
               "HDMI 2.1 Type A ×1、マイク入力・ヘッドフォン出力 共用端子 (3.5mm 4極 CTIA) ×1")
        self.assertEqual(self.rows(src), {"3.2 Gen1 Type-A": [2], "3.2 Gen2 Type-C": [1]})
        n = scraper._note_info({"入出力ポート": src}, lambda *k: "14インチ 非光沢液晶" if "ディスプレイ" in k else "", "", "", "")
        self.assertEqual(n["usb"], ["3.2 Gen1 Type-A X 2", "3.2 Gen2 Type-C X 1"])
        self.assertTrue(n["hdmi"])

    def test_other_spellings(self):
        self.assertEqual(self.rows("USB Type-C (USB3.2 Gen2 / 10Gbps) x1, USB 3.2 Gen 1 Type-A x2, "
                                   "Thunderbolt 4 (USB Type-C) ×1, USB4 (Type-C) ×1"),
                         {"3.2 Gen1 Type-A": [2], "3.2 Gen2 Type-C": [1], "4.0": [1], "Thunderbolt 4": [1]})
        self.assertEqual(self.rows("USB3.1 Gen1 Type-A×2、USB3.2 Gen2x2 Type-C ×1、USB 2.0 Type-A ×1、USB-C (5Gbps) ×1"),
                         {"2.0": [1], "3.2 Gen1 Type-A": [2], "3.2 Gen1 Type-C": [1], "3.2 Gen2x2 Type-C": [1]})

    def test_sides_on_one_line(self):
        # 商品データ (productJson) では「，背面:」が同じ行に続く
        p = scraper.parse_ports("前面:USB 2.0 ×2 、USB 3.2 Gen1 Type-C ×1，背面:USB 2.0 ×4 、USB 3.2 Gen2 Type-C ×1")
        self.assertEqual(p["cols"], ["前面", "背面"])
        self.assertEqual(p["rows"]["2.0"], [2, 4])
        self.assertEqual(p["rows"]["3.2 Gen2 Type-C"], [0, 1])


class TestCustomize(unittest.TestCase):
    """商品ページのカスタマイズ選択肢 (実ページ MC25585-SN5037 の選択肢)。"""

    def setUp(self):
        self.c = scraper.parse_product(FIX.read_text(encoding="utf-8"), "x")["customize"]

    def test_categories(self):
        self.assertEqual(list(self.c), ["オフィスソフト", "メモリ", "CPUファン", "CPUグリス", "電源", "SSD", "無線LAN"])
        for opts in self.c.values():
            self.assertEqual(sum(o["base"] for o in opts), 1)   # 標準はひとつ
            self.assertEqual(next(o for o in opts if o["base"])["price"], 0)

    def test_options(self):
        mem = {o["pop"]: o["price"] for o in self.c["メモリ"]}
        self.assertEqual(mem["32GB (16GB×2) (DDR5-4800)"], 28050)        # 《キャンペーン》表記は POP 用から除く
        self.assertEqual(self.c["メモリ"][0]["label"], "16GB (16GB×1) (DDR5-4800)")
        office = [o["pop"] for o in self.c["オフィスソフト"]]
        self.assertIn("Microsoft 365 Personal (24か月版)", office)        # 2行目の ※注記 は含めない
        self.assertEqual({o["pop"]: o["price"] for o in self.c["無線LAN"]}["Wi-Fi 6+Bluetooth(R)5.2対応 無線LAN"], 4000)
        ssd = {o["pop"]: o["price"] for o in self.c["SSD"]}
        self.assertEqual(ssd["2TB SSD (M.2 NVMe Gen4)"], 29000)


class TestModelName(unittest.TestCase):
    """型番・型番の後ろの説明・シリーズ名 (コラボ等は GSL-Series)。"""

    def sheet(self, name):
        return scraper.pop_sheet({"model": name, "productId": "MC1-SN1", "specTable": [], "keySpecs": []})

    def test_collab_is_gsl(self):
        s = self.sheet("GALLERIA KNDR7A-R58-W Ryzen 7 9800X3D搭載 カグラナナ コラボモデル")
        self.assertEqual((s["series"], s["code"], s["codeSub"]),
                         ("GSL-Series", "KNDR7A-R58-W", "Ryzen 7 9800X3D搭載 カグラナナ コラボモデル"))
        for word in ["推奨", "動作確認済み", "大会", "協賛", "公認", "監修"]:
            self.assertEqual(self.sheet(f"GALLERIA XA7C-R57 タイトル{word}モデル")["series"], "GSL-Series", word)

    def test_normal_model(self):
        s = self.sheet("GALLERIA XPR7A-R57-GD Ryzen 7 7700/LEDファン標準搭載モデル")
        self.assertEqual((s["series"], s["codeSub"]), ("X-Series", "Ryzen 7 7700/LEDファン標準搭載モデル"))


if __name__ == "__main__":
    unittest.main()
