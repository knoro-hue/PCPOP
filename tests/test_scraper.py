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
    def test_top3_in_order(self):
        src = (Path(__file__).parent / "fixtures" / "ranking_synthetic.html").read_text(encoding="utf-8")
        items = scraper.parse_ranking(src, "https://www.dospara.co.jp/gamepc")
        self.assertEqual([i["url"] for i in items], [
            "https://www.dospara.co.jp/TC30/MC25585-SN5037.html",
            "https://www.dospara.co.jp/TC30/MC20000.html",
            "https://www.dospara.co.jp/TC143/MC30000-SN1.html",
        ])
        self.assertEqual(items[0]["name"], "GALLERIA XPR7A-R57-GD Ryzen 7 7700")
        self.assertEqual([i["rank"] for i in items], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
