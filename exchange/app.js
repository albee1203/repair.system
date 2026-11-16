const NAMES = { USD: "美金", HKD: "港幣", GBP: "英鎊", AUD: "澳幣", CAD: "加拿大幣", SGD: "新加坡幣",
  CHF: "瑞士法郎", JPY: "日圓", ZAR: "南非幣", SEK: "瑞典幣", NZD: "紐元", THB: "泰幣", PHP: "菲國比索",
  IDR: "印尼幣", EUR: "歐元", KRW: "韓元", VND: "越南盾", MYR: "馬來幣", CNY: "人民幣" };
const STORE_KEY = "exchange-app-state";

const $ = (id) => document.getElementById(id);
const state = { direction: "toTwd", kind: "spot", currency: "USD", amount: "" };
let rates = [];

try { Object.assign(state, JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}); } catch {}
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} };

const label = (code) => NAMES[code] ? `${NAMES[code]} ${code}` : code;
const parseAmount = (text) => {
  const n = Number(String(text).replace(/[,\s]/g, ""));
  return text !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};
const WHOLE = new Set(["JPY", "KRW", "IDR", "VND"]);
const digitsFor = (code) => WHOLE.has(code) ? 0 : 2;
const money = (n, digits = 2) => n.toLocaleString("zh-TW", { maximumFractionDigits: digits });

// 外幣→台幣：銀行買入價；台幣→外幣：銀行賣出價
function rateFor(row) {
  const side = state.direction === "toTwd" ? "buy" : "sell";
  return row?.[`${state.kind}_${side}`] ?? null;
}
function convert(amount, row) {
  const rate = rateFor(row);
  if (amount == null || !rate) return null;
  return state.direction === "toTwd" ? amount * rate : amount / rate;
}

function render() {
  for (const b of document.querySelectorAll("[data-direction]")) b.setAttribute("aria-pressed", b.dataset.direction === state.direction);
  for (const b of document.querySelectorAll("[data-kind]")) b.setAttribute("aria-pressed", b.dataset.kind === state.kind);

  const toTwd = state.direction === "toTwd";
  const kindName = state.kind === "spot" ? "即期" : "現金";
  const row = rates.find((r) => r.currency === state.currency);
  const amount = parseAmount(state.amount);

  $("amount-label").textContent = toTwd ? `${label(state.currency)} 金額` : "新臺幣金額";
  $("result-label").textContent = toTwd ? "可換得新臺幣" : `可換得 ${label(state.currency)}`;

  const rate = rateFor(row);
  const value = convert(amount, row);
  if (!row) {
    $("result").textContent = "—"; $("rate-used").textContent = "";
  } else if (!rate) {
    $("result").textContent = "—";
    $("rate-used").textContent = `臺灣銀行未提供 ${state.currency} ${kindName}${toTwd ? "買入" : "賣出"}價，請改用${state.kind === "spot" ? "現金" : "即期"}匯率。`;
  } else {
    $("result").textContent = value == null ? "—" : toTwd ? `NT$ ${money(value)}` : `${money(value, digitsFor(state.currency))} ${state.currency}`;
    $("rate-used").textContent = `${kindName}${toTwd ? "買入" : "賣出"}價 1 ${state.currency} = ${rate} 台幣`;
  }

  const list = $("all-list");
  list.replaceChildren();
  $("all-heading").textContent = toTwd ? "各幣別 → 台幣" : "台幣 → 各幣別";
  $("all-note").textContent = amount == null
    ? "輸入金額後，一次看各幣別換算結果。點一列即可切換幣別。"
    : toTwd ? `各幣別 ${money(amount)} 元可換得的新臺幣（${kindName}）` : `NT$ ${money(amount)} 可換得的外幣（${kindName}）`;
  for (const r of rates) {
    const li = document.createElement("li");
    const rowRate = rateFor(r);
    const v = convert(amount, r);
    li.innerHTML = `<span></span><span class="value"></span>`;
    li.firstChild.textContent = label(r.currency);
    const out = li.lastChild;
    if (!rowRate) { out.textContent = "未提供"; out.classList.add("na"); }
    else if (amount == null) out.textContent = `1 ${r.currency} = ${rowRate} 台幣`;
    else out.textContent = toTwd ? `NT$ ${money(v)}` : `${money(v, digitsFor(r.currency))} ${r.currency}`;
    li.tabIndex = 0;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => pick(r.currency));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r.currency); } });
    list.append(li);
  }
  save();
}

function pick(code) {
  state.currency = code;
  $("currency").value = code;
  render();
  $("amount").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function load() {
  try {
    const res = await fetch("../rates/latest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    rates = data.rates;
    const offline = res.headers.get("x-from-cache") === "1";
    $("rate-date").textContent = `${data.date} 臺灣銀行牌告匯率${offline ? "（離線，顯示上次下載的資料）" : ""}`;
    const select = $("currency");
    select.replaceChildren(...rates.map((r) => new Option(label(r.currency), r.currency)));
    if (!rates.some((r) => r.currency === state.currency)) state.currency = rates[0]?.currency;
    select.value = state.currency;
    select.disabled = false;
  } catch {
    $("rate-date").textContent = "無法載入匯率，請連線後再試。";
  }
  render();
}

$("amount").value = state.amount;
$("amount").addEventListener("input", (e) => { state.amount = e.target.value.trim(); render(); });
$("currency").addEventListener("change", (e) => { state.currency = e.target.value; render(); });
for (const b of document.querySelectorAll("[data-direction]")) b.addEventListener("click", () => { state.direction = b.dataset.direction; render(); });
for (const b of document.querySelectorAll("[data-kind]")) b.addEventListener("click", () => { state.kind = b.dataset.kind; render(); });

load();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
}
