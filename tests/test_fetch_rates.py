import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import fetch_rates  # noqa: E402

SAMPLE = pathlib.Path(__file__).with_name("sample_bot_rates.csv")


class ParseTest(unittest.TestCase):
    def test_parses_cash_and_spot(self):
        rates = fetch_rates.parse(fetch_rates.decode(SAMPLE.read_bytes()))
        self.assertEqual([r["currency"] for r in rates], ["USD", "JPY", "ZAR"])
        self.assertEqual(rates[0], {"currency": "USD", "cash_buy": 31.85, "cash_sell": 32.52,
                                    "spot_buy": 32.175, "spot_sell": 32.325})

    def test_zero_means_unavailable(self):
        zar = fetch_rates.parse(fetch_rates.decode(SAMPLE.read_bytes()))[2]
        self.assertIsNone(zar["cash_buy"])
        self.assertIsNone(zar["cash_sell"])
        self.assertEqual(zar["spot_sell"], 1.85)

    def test_big5_input(self):
        rates = fetch_rates.parse(fetch_rates.decode(SAMPLE.read_text("utf-8").encode("big5")))
        self.assertEqual(len(rates), 3)

    def test_rejects_unexpected_content(self):
        with self.assertRaises(ValueError):
            fetch_rates.parse("<html>維護中</html>")


if __name__ == "__main__":
    unittest.main()
