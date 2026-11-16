"""抓取臺灣銀行牌告匯率，存成每日 CSV 與最新 JSON。

用法：
  python scripts/fetch_rates.py            # 從臺灣銀行下載
  python scripts/fetch_rates.py --input 檔案.csv  # 解析本機檔案（測試用）
"""
import argparse
import csv
import io
import json
import pathlib
import urllib.request
from datetime import datetime, timedelta, timezone

SOURCE_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day"
TAIPEI = timezone(timedelta(hours=8))
FIELDS = ["currency", "cash_buy", "cash_sell", "spot_buy", "spot_sell"]
HEADERS = ["幣別", "現金買入", "現金賣出", "即期買入", "即期賣出"]


def decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "big5"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("無法辨識匯率檔案編碼")


def to_rate(value: str):
    value = value.strip()
    try:
        number = float(value)
    except ValueError:
        return None
    return number if number > 0 else None  # 0 代表臺灣銀行未提供此項


def parse(text: str) -> list[dict]:
    """依「本行買入／本行賣出」欄位定位，其後兩欄分別為現金、即期。"""
    rates = []
    for row in csv.reader(io.StringIO(text)):
        row = [cell.strip() for cell in row]
        if "本行買入" not in row or "本行賣出" not in row:
            continue
        buy, sell = row.index("本行買入"), row.index("本行賣出")
        rates.append({
            "currency": row[0],
            "cash_buy": to_rate(row[buy + 1]),
            "cash_sell": to_rate(row[sell + 1]),
            "spot_buy": to_rate(row[buy + 2]),
            "spot_sell": to_rate(row[sell + 2]),
        })
    if not rates:
        raise ValueError("匯率檔案沒有可解析的幣別")
    return rates


def write(rates: list[dict], out_dir: pathlib.Path, now: datetime) -> pathlib.Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    daily = out_dir / f"{now:%Y-%m-%d}.csv"
    with daily.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADERS)
        for rate in rates:
            writer.writerow(["" if rate[f] is None else rate[f] for f in FIELDS])
    latest = {
        "date": f"{now:%Y-%m-%d}",
        "fetched_at": now.isoformat(timespec="seconds"),
        "source": SOURCE_URL,
        "rates": rates,
    }
    (out_dir / "latest.json").write_text(
        json.dumps(latest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return daily


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=pathlib.Path)
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("rates"))
    args = parser.parse_args()
    if args.input:
        raw = args.input.read_bytes()
    else:
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "daily-rates-bot"})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    rates = parse(decode(raw))
    daily = write(rates, args.out, datetime.now(TAIPEI))
    print(f"已寫入 {daily}，共 {len(rates)} 種幣別")


if __name__ == "__main__":
    main()
