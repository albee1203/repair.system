"""抓取臺灣銀行牌告匯率，存成每日 CSV、最新 JSON 與主要貨幣歷史 JSON。

用法：
  python scripts/fetch_rates.py                     # 下載今日匯率
  python scripts/fetch_rates.py --backfill-days 90  # 另補抓過去 90 天（已有的日期略過）
  python scripts/fetch_rates.py --input 檔案.csv     # 解析本機檔案（測試用）
  python scripts/fetch_rates.py --history-only      # 只依現有 CSV 重建 history.json
"""
import argparse
import csv
import io
import json
import pathlib
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

SOURCE_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day"
DATED_URL = "https://rate.bot.com.tw/xrt/flcsv/0/{day}"
TAIPEI = timezone(timedelta(hours=8))
FIELDS = ["currency", "cash_buy", "cash_sell", "spot_buy", "spot_sell"]
HEADERS = ["幣別", "現金買入", "現金賣出", "即期買入", "即期賣出"]
MAJOR = ["USD", "CNY", "HKD", "THB", "EUR", "KRW"]
HISTORY_POINTS = 90


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


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "daily-rates-bot"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def write_daily(rates: list[dict], out_dir: pathlib.Path, day: str) -> pathlib.Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    daily = out_dir / f"{day}.csv"
    with daily.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADERS)
        for rate in rates:
            writer.writerow(["" if rate[f] is None else rate[f] for f in FIELDS])
    return daily


def write_latest(rates: list[dict], out_dir: pathlib.Path, now: datetime) -> None:
    latest = {
        "date": f"{now:%Y-%m-%d}",
        "fetched_at": now.isoformat(timespec="seconds"),
        "source": SOURCE_URL,
        "rates": rates,
    }
    (out_dir / "latest.json").write_text(
        json.dumps(latest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_daily(path: pathlib.Path) -> dict[str, dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))[1:]
    return {row[0]: dict(zip(FIELDS[1:], (to_rate(v) for v in row[1:]))) for row in rows if row}


def basis_for(code: str, rows: list[dict]) -> str:
    """主要依即期賣出價；整段期間都沒有即期價的幣別（如韓元）改用現金賣出價。"""
    return "spot_sell" if any(r.get("spot_sell") for r in rows) else "cash_sell"


def build_history(out_dir: pathlib.Path) -> pathlib.Path:
    files = sorted(p for p in out_dir.glob("????-??-??.csv"))[-HISTORY_POINTS:]
    days = [(p.stem, read_daily(p)) for p in files]
    currencies = {}
    for code in MAJOR:
        rows = [rates[code] for _, rates in days if code in rates]
        basis = basis_for(code, rows)
        points = [[day, rates[code][basis]] for day, rates in days
                  if code in rates and rates[code][basis]]
        currencies[code] = {"basis": basis, "points": points}
    history = {"updated": days[-1][0] if days else None, "currencies": currencies}
    target = out_dir / "history.json"
    target.write_text(json.dumps(history, ensure_ascii=False, separators=(",", ":")) + "\n",
                      encoding="utf-8")
    return target


def backfill(out_dir: pathlib.Path, days: int, today: date) -> None:
    previous = None
    added = 0
    for offset in range(days, 0, -1):
        day = today - timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        target = out_dir / f"{day:%Y-%m-%d}.csv"
        if target.exists():
            previous = read_daily(target)
            continue
        try:
            rates = parse(decode(download(DATED_URL.format(day=f"{day:%Y-%m-%d}"))))
        except Exception as error:  # 假日或查無資料
            print(f"{day} 略過：{error}")
            continue
        finally:
            time.sleep(0.5)
        as_map = {r["currency"]: {f: r[f] for f in FIELDS[1:]} for r in rates}
        if as_map == previous:  # 與前一營業日完全相同，視為休市
            print(f"{day} 與前一日相同，視為休市略過")
            continue
        write_daily(rates, out_dir, f"{day:%Y-%m-%d}")
        previous = as_map
        added += 1
    print(f"補抓完成，新增 {added} 天")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=pathlib.Path)
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("rates"))
    parser.add_argument("--backfill-days", type=int, default=0)
    parser.add_argument("--history-only", action="store_true")
    args = parser.parse_args()
    now = datetime.now(TAIPEI)
    if not args.history_only:
        if args.backfill_days:
            backfill(args.out, args.backfill_days, now.date())
        raw = args.input.read_bytes() if args.input else download(SOURCE_URL)
        rates = parse(decode(raw))
        daily = write_daily(rates, args.out, f"{now:%Y-%m-%d}")
        write_latest(rates, args.out, now)
        print(f"已寫入 {daily}，共 {len(rates)} 種幣別")
    print(f"已更新 {build_history(args.out)}")


if __name__ == "__main__":
    main()
