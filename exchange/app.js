const NAMES = { USD: "美金", HKD: "港幣", GBP: "英鎊", AUD: "澳幣", CAD: "加拿大幣", SGD: "新加坡幣",
  CHF: "瑞士法郎", JPY: "日圓", ZAR: "南非幣", SEK: "瑞典幣", NZD: "紐元", THB: "泰幣", PHP: "菲國比索",
  IDR: "印尼幣", EUR: "歐元", KRW: "韓元", VND: "越南盾", MYR: "馬來幣", CNY: "人民幣" };
const STORE_KEY = "exchange-app-state";

const $ = (id) => document.getElementById(id);
const state = { direction: "toTwd", kind: "spot", currency: "USD", amount: "" };
let rates = [];
let range = 22; // 走勢期間（營業日數）

try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY)) ?? {};
  for (const key of Object.keys(state)) if (key in saved) state[key] = saved[key];
  if ([5, 22, 66].includes(saved.range)) range = saved.range;
} catch {}
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, range })); } catch {} };

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

// ---- 主要貨幣匯率變動 ----
const MAJOR = ["USD", "CNY", "HKD", "THB", "EUR", "KRW"];
const SVG_NS = "http://www.w3.org/2000/svg";
let history = null;

const decimalsFor = (v) => v >= 10 ? 3 : v >= 1 ? 4 : 5;
const fmtRate = (v) => v.toFixed(decimalsFor(v));
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function changeText(curr, prev) {
  const span = document.createElement("span");
  span.className = "chg";
  if (prev == null) { span.textContent = "—"; return span; }
  const diff = curr - prev;
  const pct = prev ? (diff / prev) * 100 : 0;
  const arrow = document.createElement("span");
  const dir = Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
  arrow.className = `arrow ${dir}`;
  arrow.textContent = dir === "up" ? "▲" : dir === "down" ? "▼" : "－";
  const absDiff = `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(decimalsFor(curr))}`;
  span.append(arrow, ` ${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`);
  span.title = `較前一營業日 ${absDiff} 台幣`;
  span.setAttribute("aria-label", dir === "flat" ? "與前一營業日持平"
    : `較前一營業日${dir === "up" ? "上漲" : "下跌"} ${Math.abs(diff).toFixed(decimalsFor(curr))}，${Math.abs(pct).toFixed(2)}%`);
  return span;
}

function sparkline(points, onHover) {
  const W = 160, H = 44, P = 4;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("spark");
  const values = points.map((p) => p[1]);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || max * 0.001 || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const el = (name, attrs) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node); return node;
  };
  el("line", { class: "base", x1: P, x2: W - P, y1: y(values[0]), y2: y(values[0]), "vector-effect": "non-scaling-stroke" });
  el("polyline", { class: "line", points: points.map((p, i) => `${x(i)},${y(p[1])}`).join(" "), "vector-effect": "non-scaling-stroke" });
  const cursor = el("line", { class: "cursor", y1: 0, y2: H, visibility: "hidden", "vector-effect": "non-scaling-stroke" });
  const dot = el("circle", { class: "dot", r: 3.5, cx: x(points.length - 1), cy: y(values.at(-1)), "vector-effect": "non-scaling-stroke" });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${shortDate(points[0][0])} 至 ${shortDate(points.at(-1)[0])}，最低 ${fmtRate(min)}，最高 ${fmtRate(max)}`);

  const move = (clientX) => {
    const box = svg.getBoundingClientRect();
    const rel = ((clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((rel - P) / (W - 2 * P)) * (points.length - 1))));
    cursor.setAttribute("x1", x(i)); cursor.setAttribute("x2", x(i)); cursor.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(values[i]));
    onHover(i);
  };
  const leave = () => {
    cursor.setAttribute("visibility", "hidden");
    dot.setAttribute("cx", x(points.length - 1)); dot.setAttribute("cy", y(values.at(-1)));
    onHover(null);
  };
  svg.addEventListener("pointermove", (e) => move(e.clientX));
  svg.addEventListener("pointerdown", (e) => move(e.clientX));
  svg.addEventListener("pointerleave", leave);
  svg.addEventListener("pointercancel", leave);
  return svg;
}

function renderTrends() {
  for (const b of document.querySelectorAll("[data-range]")) b.setAttribute("aria-pressed", Number(b.dataset.range) === range);
  const list = $("trend-list");
  if (!history) { list.innerHTML = `<li class="muted">無法載入匯率走勢，請連線後再試。</li>`; return; }
  list.replaceChildren();
  for (const code of MAJOR) {
    const all = history.currencies[code]?.points ?? [];
    if (!all.length) continue;
    const points = all.slice(-(range + 1));
    const [lastDate, last] = all.at(-1);
    const prev = all.length > 1 ? all.at(-2)[1] : null;
    const li = document.createElement("li");

    const name = document.createElement("div");
    name.className = "trend-name";
    name.innerHTML = "<strong></strong><small></small>";
    name.firstChild.textContent = NAMES[code];
    name.lastChild.textContent = code;
    name.title = `換算 ${NAMES[code]}`;
    name.addEventListener("click", () => pick(code));

    const value = document.createElement("div");
    value.className = "trend-value";
    const strong = document.createElement("strong");
    const sub = document.createElement("small");
    const showLatest = () => {
      strong.textContent = fmtRate(last);
      sub.replaceChildren(changeText(last, prev));
    };
    showLatest();
    value.append(strong, sub);

    let chart;
    if (points.length < 2) {
      chart = document.createElement("div");
      chart.className = "spark-empty";
      chart.textContent = "資料累積中";
    } else {
      chart = sparkline(points, (i) => {
        if (i == null) return showLatest();
        strong.textContent = fmtRate(points[i][1]);
        sub.textContent = `${shortDate(points[i][0])}${points[i][0] === lastDate ? "（最新）" : ""}`;
      });
    }
    li.append(name, chart, value);
    list.append(li);
  }
  if (!list.children.length) list.innerHTML = `<li class="muted">尚無走勢資料。</li>`;
}

async function loadHistory() {
  try {
    const res = await fetch("../rates/history.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    history = await res.json();
  } catch {
    history = null;
  }
  renderTrends();
}

for (const b of document.querySelectorAll("[data-range]")) b.addEventListener("click", () => {
  range = Number(b.dataset.range);
  save();
  renderTrends();
});
loadHistory();

if ("serviceWorker" in navigator) {
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloaded) { reloaded = true; location.reload(); }
    });
  }
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
}
