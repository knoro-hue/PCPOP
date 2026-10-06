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


if __name__ == "__main__":
    unittest.main()
