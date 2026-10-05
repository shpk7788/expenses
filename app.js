(() => {
"use strict";
const VERSION = "5.1";

// ================= utilities =================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const r2 = (v) => Math.round(v * 100) / 100;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() :
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (v) => fmt.format(v || 0);
const moneyBig = (v) => (Math.abs(v) >= 1e5 ? fmt0 : fmt).format(v || 0);
function compact(v) {
  if (v >= 1e7) return "₹" + +(v / 1e7).toFixed(1) + "Cr";
  if (v >= 1e5) return "₹" + +(v / 1e5).toFixed(1) + "L";
  if (v >= 1e3) return "₹" + +(v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "k";
  return "₹" + Math.round(v);
}
const ICON = {
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};

// ---- dates (all local, "YYYY-MM-DD" strings) ----
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, daysIn(d.getFullYear(), d.getMonth()))); return ymd(d); };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const weekStart = (s) => { const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dLong = (s) => parse(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dShort = (s) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
function dayLabel(s) {
  const t = today();
  if (s === t) return "Today";
  if (s === addDays(t, -1)) return "Yesterday";
  const d = parse(s);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

// ================= categories & stores =================
const CATS = [
  ["food", "Food & dining", "🍔", "#f97316"], ["groceries", "Groceries", "🛒", "#22c55e"], ["shopping", "Shopping", "🛍️", "#a855f7"],
  ["transport", "Transport", "🚕", "#3b82f6"], ["fuel", "Fuel", "⛽", "#ef4444"], ["bills", "Bills & utilities", "💡", "#eab308"],
  ["entertainment", "Entertainment", "🎬", "#ec4899"], ["health", "Health", "💊", "#14b8a6"], ["travel", "Travel", "✈️", "#06b6d4"],
  ["personal", "Personal care", "💇", "#f43f5e"], ["home", "Home", "🏠", "#84cc16"], ["education", "Education", "📚", "#6366f1"],
  ["services", "Services", "🧰", "#64748b"], ["other", "Other", "🧾", "#94a3b8"],
];
const CAT = Object.fromEntries(CATS.map(([id, name, emoji, color]) => [id, { id, name, emoji, color }]));
const PAYS = ["UPI", "Card", "Cash", "Net banking", "Wallet"];
const STORE_CAT = {};
[["food", "Food delivery,Restaurant,Fast food,Cafe,Dessert,Bakery,Pastry,Confectionery,Chocolate,Tea,Coffee,Food court,Deli,Bar,Pub,Ice cream"],
 ["groceries", "Groceries,Dairy,Greengrocer,Butcher,Seafood,Supermarket,Convenience,General,Alcohol,Beverages,Health food,Frozen food,Spices"],
 ["fuel", "Fuel,Charging station,Car wash"], ["transport", "Transport,Bicycle rental,Car rental"],
 ["travel", "Travel,Hotel,Travel agency,Motel,Hostel,Guest house"], ["bills", "Bills & utilities,Gas"],
 ["entertainment", "Entertainment,Cinema,Video,Video games,Bowling alley,Amusement arcade"],
 ["health", "Pharmacy,Health,Fitness,Optician,Laboratory,Nutrition supplements,Medical supply,Clinic,Hospital,Dentist,Doctors,Sports centre,Hearing aids"],
 ["personal", "Personal care,Cosmetics,Hairdresser,Beauty,Perfumery,Laundry,Dry cleaning,Massage"],
 ["home", "Furniture,Houseware,Doityourself,Paint,Kitchen,Interior decoration,Appliance,Bed,Vacuum cleaner,Groundskeeping,Hardware,Garden centre,Lighting,Bathroom furnishing,Curtain,Flooring"],
 ["education", "Books,Stationery,Newsagent"], ["services", "Services"]]
  .forEach(([c, list]) => list.split(",").forEach(n => STORE_CAT[n] = c));
const STORE_IDX = (window.STORES || []).map(([name, cat, india]) => ({ name, cat, india, n: norm(name), words: name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) }));
const STORE_BY = new Map(STORE_IDX.map(s => [s.n, s]));
const FOOD_PLACE = new Set(["Restaurant", "Fast food", "Cafe", "Dessert", "Bakery", "Pastry", "Food court", "Confectionery", "Chocolate", "Deli", "Tea"]);
const DELIVERY = new Set(["swiggy", "zomato", "eatsure", "magicpin", "ubereats", "eatclub"]);
STORE_IDX.forEach(s => { if (s.cat === "Food delivery") DELIVERY.add(s.n); });
const isDelivery = (what) => DELIVERY.has(norm(what));
const KEYWORDS = [
  ["bills", /\b(rent|maintenance|electric|electricity|water|gas|wifi|wi-fi|internet|broadband|recharge|bill|emi|insurance|dth)\b/i],
  ["transport", /\b(uber|ola|auto|rickshaw|cab|taxi|metro|bus|train|parking|toll|rapido)\b/i],
  ["fuel", /\b(petrol|diesel|fuel|cng)\b/i],
  ["groceries", /\b(grocer|groceries|vegetables?|veggies|milk|fruits?|kirana|eggs)\b/i],
  ["food", /\b(lunch|dinner|breakfast|coffee|tea|chai|snacks?|food|biryani|pizza|burger|restaurant|cafe|dosa|meal)\b/i],
  ["entertainment", /\b(movie|cinema|netflix|concert|game|games|subscription)\b/i],
  ["health", /\b(doctor|medicine|medicines|pharma|pharmacy|hospital|gym|clinic|dental|lab test)\b/i],
  ["personal", /\b(salon|haircut|spa|parlour|parlor|laundry)\b/i],
  ["education", /\b(books?|course|tuition|school|college|fees|exam)\b/i],
  ["travel", /\b(flight|hotel|trip|holiday|vacation|airbnb)\b/i],
  ["shopping", /\b(clothes|shoes|shirt|dress|amazon|flipkart|gift)\b/i],
];
function catFor(what) {
  const s = STORE_BY.get(norm(what));
  if (s) return STORE_CAT[s.cat] || "shopping";
  for (const [c, re] of KEYWORDS) if (re.test(what)) return c;
  return "other";
}

// ================= state & storage =================
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const ns = () => (Sync.user ? `u:${Sync.user.id}` : "guest");
const K = (name, space = ns()) => `exp:${space}:${name}`;
let items = [], dirty = new Set(), cursor = null, lastSynced = 0;

(function migrate() {
  const old = LS.get("expenses.v1", null);
  if (old && !LS.get(K("items", "guest"), null)) {
    LS.set(K("items", "guest"), old.map(e => ({ ...e, cat: e.cat || catFor(e.what), updated: e.updated || e.created || Date.now() })));
  }
  if (old) LS.del("expenses.v1");
  LS.del("expenses.loc");
})();

function loadSpace() {
  items = LS.get(K("items"), []);
  items.forEach(e => { if (!e.cat) e.cat = catFor(e.what); if (!e.updated) e.updated = e.created || Date.now(); });
  dirty = new Set(LS.get(K("dirty"), []));
  cursor = LS.get(K("cursor"), null);
  lastSynced = LS.get(K("synced"), 0);
}
function persist() {
  if (!LS.set(K("items"), items)) toast("Couldn't save — storage is full. Export a backup.");
  LS.set(K("dirty"), [...dirty]); LS.set(K("cursor"), cursor); LS.set(K("synced"), lastSynced);
}
const live = () => items.filter(e => !e.deleted);
const byId = (id) => items.find(e => e.id === id);

function upsert(e) {
  e.updated = Date.now();
  const i = items.findIndex(x => x.id === e.id);
  if (i < 0) items.push(e); else items[i] = e;
  if (Sync.user) dirty.add(e.id);
  else if (e.deleted) items = items.filter(x => x.id !== e.id);
  persist(); renderAll(); scheduleSync();
}

// settings (budget): per account (synced via account metadata), guest keeps it locally
function settings() { return Sync.user ? (Sync.user.meta || {}) : LS.get(K("settings", "guest"), {}); }
async function saveSettings(patch) {
  if (Sync.user) {
    Sync.user.meta = { ...(Sync.user.meta || {}), ...patch };
    LS.set("exp:session", { ...LS.get("exp:session", {}), user: Sync.user });
    try { await Sync.saveMeta(Sync.user.meta); } catch {}
  } else LS.set(K("settings", "guest"), { ...settings(), ...patch });
}

// ================= sync engine =================
let syncing = false, syncAgain = false, syncState = "off", syncErr = "", syncTimer = null;
function setSyncState(s, err = "") {
  syncState = s; syncErr = err;
  const dot = $("syncDot"); dot.className = "dot" + (s === "ok" ? " ok" : s === "busy" ? " busy" : s === "err" ? " err" : "");
  if ($("acctDlg").open) renderAccount();
}
function scheduleSync(ms = 1200) { if (!Sync.user) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  if (!Sync.user || !Sync.configured) return;
  if (syncing) { syncAgain = true; return; }
  if (!navigator.onLine) { setSyncState("err", "You're offline. Changes will sync when you're back online."); return; }
  syncing = true; setSyncState("busy");
  const space = ns();
  try {
    const rows = await Sync.pull(cursor);
    if (ns() !== space) return;
    let changed = false;
    for (const r of rows) {
      const l = byId(r.id), remote = { ...r.data, id: r.id, updated: Number(r.updated), deleted: !!r.deleted };
      if (!l || remote.updated > (l.updated || 0)) {
        if (l) Object.keys(l).forEach(k => delete l[k]);
        l ? Object.assign(l, remote) : items.push(remote);
        dirty.delete(r.id); changed = true;
      }
      if (r.synced_at && (!cursor || r.synced_at > cursor)) cursor = r.synced_at;
    }
    const pending = [...dirty].map(byId).filter(Boolean);
    if (pending.length) {
      await Sync.push(pending.map(e => { const { deleted, ...data } = e; return { id: e.id, data, deleted: !!deleted, updated: e.updated }; }));
      pending.forEach(e => dirty.delete(e.id));
    }
    // forget synced tombstones older than 60 days
    const cutoff = Date.now() - 60 * 864e5;
    items = items.filter(e => !(e.deleted && !dirty.has(e.id) && e.updated < cutoff));
    lastSynced = Date.now(); persist();
    if (changed) renderAll();
    setSyncState("ok");
  } catch (err) {
    setSyncState(Sync.user ? "err" : "off", err.message || "Sync failed");
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}
window.addEventListener("online", () => scheduleSync(200));
document.addEventListener("visibilitychange", () => { if (!document.hidden) { scheduleSync(200); renderAll(); } });
setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
window.addEventListener("sync:loggedout", () => { switchSpace(); toast("You were logged out. Please log in again."); });

// ================= UI shell =================
let tab = LS.get("exp:tab", "list");
function showTab(t) {
  tab = t; LS.set("exp:tab", t);
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  ["list", "cal", "stats"].forEach(n => $("tab-" + n).hidden = n !== t);
  $("pageTitle").textContent = { list: "Expenses", cal: "Calendar", stats: "Insights" }[t];
  $("fab").hidden = t === "stats";
  renderAll(); window.scrollTo(0, 0);
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("fab").addEventListener("click", () => openAdd(tab === "cal" ? calSel : today()));

function renderAll() {
  renderAcctBtn();
  if (tab === "list") renderList(); else if (tab === "cal") renderCal(); else renderStats();
}
function renderAcctBtn() {
  const u = Sync.user;
  $("acctName").textContent = u ? u.username : "Log in";
  const av = $("acctAvatar"), dot = $("syncDot");
  av.innerHTML = u ? esc(u.username[0].toUpperCase()) : ICON.user; av.appendChild(dot);
  if (!u) dot.className = "dot";
}

let toastTimer = null, undoFn = null;
function toast(msg, undo) {
  $("toastMsg").textContent = msg; undoFn = undo || null; $("undoBtn").hidden = !undo;
  $("toast").classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").classList.remove("show"); undoFn = null; }, undo ? 5000 : 2500);
}
$("undoBtn").addEventListener("click", () => { undoFn?.(); undoFn = null; $("toast").classList.remove("show"); });

// close buttons + backdrop for all dialogs
document.querySelectorAll("dialog").forEach(d => {
  d.addEventListener("click", (ev) => { if (ev.target === d || ev.target.closest("[data-close]")) d.close(); });
});

// ---- expense row ----
function rowHtml(e) {
  const c = CAT[e.cat] || CAT.other, n = e.receipt?.items?.length || 0;
  const sub = [e.place, e.pay, e.note].filter(Boolean).map(esc).join(" · ");
  return `<li class="erow" data-id="${e.id}">
    <div class="cat-ico" style="background:${c.color}22" title="${esc(c.name)}">${c.emoji}</div>
    <div class="what"><b>${esc(e.what)}</b>${sub ? `<small>${sub}</small>` : ""}</div>
    <div class="amt">${money(e.amount)}</div>
    <button class="rcpt${n ? " has" : ""}" type="button" data-receipt="${e.id}" aria-label="${n ? `Receipt, ${n} items` : "Receipt"}" title="${n ? `Receipt · ${n} items` : "Receipt — add items"}">${ICON.receipt}</button>
  </li>`;
}
function onRowClick(ev) {
  const r = ev.target.closest("[data-receipt]");
  if (r) { ev.stopPropagation(); return openReceipt(r.dataset.receipt); }
  const row = ev.target.closest(".erow[data-id]");
  if (row) openEdit(row.dataset.id);
}
document.addEventListener("click", (ev) => { if (ev.target.closest("#list, #calDay, #stats") && ev.target.closest(".erow, [data-receipt]")) onRowClick(ev); });

// ================= EXPENSES TAB =================
let listLimit = 200;
$("search").addEventListener("input", () => { listLimit = 200; renderList(); });
function renderList() {
  const all = live(), t = today(), m = t.slice(0, 7);
  const monthTotal = all.filter(e => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0);
  $("heroLabel").textContent = `Spent in ${MONTHS[new Date().getMonth()]}`;
  $("heroTotal").textContent = moneyBig(monthTotal);
  $("heroToday").textContent = moneyBig(all.filter(e => e.date === t).reduce((s, e) => s + e.amount, 0));
  const budget = +settings().budget || 0;
  if (budget > 0) {
    const left = budget - monthTotal, pct = Math.min(100, monthTotal / budget * 100);
    const d = new Date(), daysLeft = daysIn(d.getFullYear(), d.getMonth()) - d.getDate() + 1;
    $("budgetBox").innerHTML = `<div class="bar${left < 0 ? " over" : ""}"><i style="width:${pct}%"></i></div>
      <div class="budget-line">${left >= 0
        ? `<span><b>${moneyBig(left)}</b> left of ${moneyBig(budget)}</span><span>≈ <b>${moneyBig(Math.floor(left / daysLeft))}</b>/day for ${daysLeft} day${daysLeft > 1 ? "s" : ""}</span>`
        : `<span style="color:var(--danger)"><b style="color:inherit">${moneyBig(-left)}</b> over your ${moneyBig(budget)} budget</span>`}</div>`;
  } else $("budgetBox").innerHTML = `<button type="button" class="link set-budget" data-act="budget">${ICON.plus}Set a monthly budget</button>`;

  $("search").hidden = all.length < 3;
  const q = $("search").value.trim().toLowerCase();
  const shown = all.filter(e => !q || [e.what, e.place, e.note, e.pay, CAT[e.cat]?.name, ...(e.receipt?.items || []).map(i => i.n)]
      .some(v => v && String(v).toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  if (!shown.length) {
    $("list").innerHTML = all.length ? `<div class="empty"><b>No matches</b>Try a different search.</div>`
      : `<div class="empty"><b>No expenses yet</b>Tap <b style="display:inline">Add</b> to log your first one, or scan a receipt.</div>`;
    return;
  }
  const page = shown.slice(0, listLimit);
  const monthTotals = {}; shown.forEach(e => { const k = e.date.slice(0, 7); monthTotals[k] = (monthTotals[k] || 0) + e.amount; });
  let html = "", curM = "", curD = "", dayRows = [];
  const flushDay = () => {
    if (!dayRows.length) return;
    const tot = dayRows.reduce((s, e) => s + e.amount, 0);
    html += `<div class="day"><div class="dhead"><span>${dayLabel(curD)}</span><span>${money(tot)}</span></div><ul class="rows">${dayRows.map(rowHtml).join("")}</ul></div>`;
    dayRows = [];
  };
  for (const e of page) {
    const mk = e.date.slice(0, 7);
    if (mk !== curM) { flushDay(); curM = mk; const [y, mm] = mk.split("-"); html += `<div class="mhead"><b>${MONTHS[+mm - 1]} ${y}</b><span>${money(monthTotals[mk])}</span></div>`; }
    if (e.date !== curD) { flushDay(); curD = e.date; }
    dayRows.push(e);
  }
  flushDay();
  if (shown.length > listLimit) html += `<button type="button" class="btn secondary more" data-act="more">Show older (${shown.length - listLimit} more)</button>`;
  $("list").innerHTML = html;
}
$("tab-list").addEventListener("click", (ev) => {
  const act = ev.target.closest("[data-act]")?.dataset.act;
  if (act === "more") { listLimit += 300; renderList(); }
  if (act === "budget") openAccount("budget");
});

// ================= CALENDAR TAB =================
let calSel = today(), calY = new Date().getFullYear(), calM = new Date().getMonth();
function dayTotals() {
  const m = new Map();
  live().forEach(e => { const v = m.get(e.date) || { t: 0, n: 0 }; v.t += e.amount; v.n++; m.set(e.date, v); });
  return m;
}
function renderCal() {
  const totals = dayTotals(), t = today();
  $("calTitleText").textContent = `${innerWidth < 400 ? MONTHS[calM].slice(0, 3) : MONTHS[calM]} ${calY}`;
  const first = new Date(calY, calM, 1).getDay(), n = daysIn(calY, calM);
  let max = 0, mTot = 0, mCount = 0;
  for (let d = 1; d <= n; d++) { const v = totals.get(`${calY}-${pad(calM + 1)}-${pad(d)}`); if (v) { max = Math.max(max, v.t); mTot += v.t; mCount += v.n; } }
  let html = "";
  for (let i = 0; i < first; i++) html += `<span class="cday out" aria-hidden="true"></span>`;
  for (let d = 1; d <= n; d++) {
    const key = `${calY}-${pad(calM + 1)}-${pad(d)}`, v = totals.get(key);
    const cls = ["cday", v && "has", key === t && "today", key === calSel && "sel", key > t && "future"].filter(Boolean).join(" ");
    const h = v && max ? Math.sqrt(v.t / max).toFixed(2) : 0;
    html += `<button type="button" class="${cls}" data-d="${key}" style="--h:${h}" aria-label="${dLong(key)}${v ? `, ${money(v.t)}` : ""}"><span>${d}</span>${v ? `<small>${compact(v.t)}</small>` : ""}</button>`;
  }
  $("calGrid").innerHTML = html;
  const isCur = calY === new Date().getFullYear() && calM === new Date().getMonth();
  const days = isCur ? new Date().getDate() : n;
  $("calSum").innerHTML = `<span>${MONTHS[calM].slice(0, 3)} total <b>${moneyBig(mTot)}</b></span><span>${mCount} expense${mCount === 1 ? "" : "s"} · avg <b>${compact(mTot / Math.max(1, days))}</b>/day</span>`;
  renderCalDay(totals);
}
function renderCalDay(totals = dayTotals()) {
  const list = live().filter(e => e.date === calSel).sort((a, b) => (b.created || 0) - (a.created || 0));
  const v = totals.get(calSel);
  $("calDay").innerHTML = `<div class="day">
    <div class="dhead" style="font-size:.9rem;padding-top:12px"><span style="color:var(--text);font-weight:600">${dayLabel(calSel)}${["Today", "Yesterday"].includes(dayLabel(calSel)) ? ` · ${dShort(calSel)}` : ""}</span><span>${v ? money(v.t) : ""}</span></div>
    ${list.length ? `<ul class="rows">${list.map(rowHtml).join("")}</ul>` : `<p class="empty" style="padding:14px">No expenses on this day.</p>`}
    <div style="padding:0 14px 12px"><button type="button" class="link" data-act="addday">${ICON.plus}Add expense on ${dShort(calSel)}</button></div>
  </div>`;
}
function calGo(y, m) { const d = new Date(y, m, 1); calY = d.getFullYear(); calM = d.getMonth(); renderCal(); }
$("calPrev").addEventListener("click", () => calGo(calY, calM - 1));
$("calNext").addEventListener("click", () => calGo(calY, calM + 1));
$("calToday").addEventListener("click", () => { calSel = today(); calGo(new Date().getFullYear(), new Date().getMonth()); });
$("calGrid").addEventListener("click", (ev) => { const b = ev.target.closest("[data-d]"); if (!b) return; calSel = b.dataset.d; renderCal(); $("calDay").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
$("calDay").addEventListener("click", (ev) => { if (ev.target.closest("[data-act=addday]")) openAdd(calSel); });
(() => { // swipe months
  let x0 = null, y0 = null;
  $("calGrid").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  $("calGrid").addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) calGo(calY, calM + (dx < 0 ? 1 : -1));
  });
})();
// month/year picker (any year)
let pickY = calY;
function renderPicker() { $("pyInput").value = pickY; renderPickerMonths(); }
function renderPickerMonths() {
  const totals = {}; live().forEach(e => { if (e.date.startsWith(pickY + "-")) { const m = +e.date.slice(5, 7) - 1; totals[m] = (totals[m] || 0) + e.amount; } });
  $("pyMonths").innerHTML = MONTHS.map((m, i) => `<button type="button" data-m="${i}" aria-current="${pickY === calY && i === calM}">${m.slice(0, 3)}${totals[i] ? `<small>${compact(totals[i])}</small>` : ""}</button>`).join("");
}
$("calTitle").addEventListener("click", () => { pickY = calY; $("pyDate").value = calSel; renderPicker(); $("pickDlg").showModal(); });
$("pyPrev").addEventListener("click", () => { pickY--; renderPicker(); });
$("pyNext").addEventListener("click", () => { pickY++; renderPicker(); });
// update on every keystroke (not on blur), so tapping a month right after typing a year works
$("pyInput").addEventListener("input", () => { const y = parseInt($("pyInput").value, 10); if (y > 0 && y < 10000) { pickY = y; renderPickerMonths(); } });
$("pyMonths").addEventListener("click", (ev) => { const b = ev.target.closest("[data-m]"); if (!b) return; $("pickDlg").close(); calGo(pickY, +b.dataset.m); });
$("pyDate").addEventListener("change", () => { const v = $("pyDate").value; if (!v) return; calSel = v; $("pickDlg").close(); calGo(+v.slice(0, 4), +v.slice(5, 7) - 1); });

// ================= INSIGHTS TAB =================
let pType = "month", pAnchor = today(), cFrom = addDays(today(), -29), cTo = today(), chartSel = null;
function range(type = pType, a = pAnchor) {
  if (type === "day") return [a, a];
  if (type === "week") { const s = weekStart(a); return [s, addDays(s, 6)]; }
  if (type === "month") { const d = parse(a); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
  if (type === "year") { const y = parse(a).getFullYear(); return [`${y}-01-01`, `${y}-12-31`]; }
  return cFrom <= cTo ? [cFrom, cTo] : [cTo, cFrom];
}
function prevRange() {
  if (pType === "day") return range("day", addDays(pAnchor, -1));
  if (pType === "week") return range("week", addDays(pAnchor, -7));
  if (pType === "month") return range("month", addMonths(range()[0], -1));
  if (pType === "year") return range("year", addMonths(range()[0], -12));
  const [f, t] = range(), len = diffDays(f, t) + 1; return [addDays(f, -len), addDays(f, -1)];
}
function periodLabel() {
  const [f, t] = range(), sameY = f.slice(0, 4) === t.slice(0, 4);
  if (pType === "day") return dLong(f);
  if (pType === "month") return `${MONTHS[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}`;
  if (pType === "year") return f.slice(0, 4);
  return `${parse(f).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameY ? {} : { year: "numeric" }) })} – ${parse(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}
function shift(dir) {
  chartSel = null;
  if (pType === "day") pAnchor = addDays(pAnchor, dir);
  else if (pType === "week") pAnchor = addDays(pAnchor, 7 * dir);
  else if (pType === "month") pAnchor = addMonths(range()[0], dir);
  else if (pType === "year") pAnchor = addMonths(range()[0], 12 * dir);
  else { const [f, t] = range(), len = diffDays(f, t) + 1; cFrom = addDays(f, len * dir); cTo = addDays(t, len * dir); }
  renderStats();
}
$("pPrev").addEventListener("click", () => shift(-1));
$("pNext").addEventListener("click", () => shift(1));
$("periodSeg").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-p]"); if (!b) return;
  pType = b.dataset.p; chartSel = null;
  if (pType !== "custom") pAnchor = today();
  renderStats();
});
$("cFrom").addEventListener("change", () => { if ($("cFrom").value) { cFrom = $("cFrom").value; chartSel = null; renderStats(); } });
$("cTo").addEventListener("change", () => { if ($("cTo").value) { cTo = $("cTo").value; chartSel = null; renderStats(); } });

function buckets(f, t) {
  const len = diffDays(f, t) + 1, out = [];
  if (pType === "year" || (pType === "custom" && len > 62 && len <= 800)) {
    let d = f.slice(0, 7) + "-01";
    while (d <= t) {
      const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1;
      out.push({ from: d < f ? f : d, to: ymd(new Date(y, m + 1, 0)) > t ? t : ymd(new Date(y, m + 1, 0)), label: MONTHS[m].slice(0, 3), long: `${MONTHS[m]} ${y}`, unit: "month" });
      d = ymd(new Date(y, m + 1, 1));
    }
  } else if (pType === "custom" && len > 800) {
    for (let y = +f.slice(0, 4); y <= +t.slice(0, 4); y++) out.push({ from: `${y}-01-01` < f ? f : `${y}-01-01`, to: `${y}-12-31` > t ? t : `${y}-12-31`, label: String(y), long: String(y), unit: "year" });
  } else {
    for (let i = 0; i < len; i++) {
      const d = addDays(f, i), dt = parse(d);
      out.push({ from: d, to: d, label: pType === "week" ? dt.toLocaleDateString("en-IN", { weekday: "short" }) : String(dt.getDate()), long: dLong(d), unit: "day" });
    }
  }
  return out;
}

function renderStats() {
  document.querySelectorAll("#periodSeg [data-p]").forEach(b => b.setAttribute("aria-selected", b.dataset.p === pType));
  $("customRange").hidden = pType !== "custom";
  if (pType === "custom") { $("cFrom").value = cFrom; $("cTo").value = cTo; }
  $("pLabel").textContent = periodLabel();
  const [f, t] = range(), [pf, pt] = prevRange(), all = live();
  const list = all.filter(e => e.date >= f && e.date <= t);
  const total = list.reduce((s, e) => s + e.amount, 0);
  const prevTotal = all.filter(e => e.date >= pf && e.date <= pt).reduce((s, e) => s + e.amount, 0);
  const tt = today(), elapsed = f > tt ? 0 : diffDays(f, t < tt ? t : tt) + 1;
  const avg = total / Math.max(1, elapsed || diffDays(f, t) + 1);
  const biggest = list.reduce((m, e) => (e.amount > (m?.amount || 0) ? e : m), null);
  let delta = "";
  if (prevTotal > 0) {
    const pc = Math.round((total - prevTotal) / prevTotal * 100);
    delta = `<span class="delta ${pc > 0 ? "up" : "down"}">${pc > 0 ? "▲" : pc < 0 ? "▼" : ""} ${Math.abs(pc)}%</span> <span class="muted small">vs previous ${pType === "custom" ? "period" : pType} (${moneyBig(prevTotal)})</span>`;
  } else if (total > 0) delta = `<span class="muted small">Nothing logged in the previous ${pType === "custom" ? "period" : pType}</span>`;

  let html = `<div class="card">
    <div class="label muted small">Total spent</div>
    <div class="big num" style="font-size:clamp(1.6rem,8vw,2.1rem);font-weight:700;line-height:1.15;white-space:nowrap">${moneyBig(total)}</div>
    <div style="margin-top:4px">${delta}</div>
    <div class="kpis">
      <div class="kpi"><span>Expenses</span><b>${list.length}</b></div>
      <div class="kpi"><span>${pType === "day" ? "Average" : "Per day"}</span><b>${pType === "day" ? (list.length ? compact(total / list.length) : "₹0") : compact(avg)}</b></div>
      <div class="kpi"><span>Biggest</span><b>${biggest ? compact(biggest.amount) : "₹0"}</b></div>
    </div></div>`;

  if (!list.length) {
    $("stats").innerHTML = html + `<div class="card empty"><b>Nothing logged</b>No expenses in this ${pType === "custom" ? "period" : pType}.</div>`;
    return;
  }
  if (pType !== "day") html += `<div class="card"><h3>Spending over time</h3><div id="chartBox"></div><div class="chart-tip" id="chartTip"></div></div>`;

  // categories
  const byCat = {}; list.forEach(e => byCat[e.cat || "other"] = (byCat[e.cat || "other"] || 0) + e.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), topC = cats[0][1];
  html += `<div class="card"><h3>By category</h3><div class="brk">${cats.map(([id, v]) => { const c = CAT[id] || CAT.other; return `
    <div class="brk-row"><div class="cat-ico" style="background:${c.color}22">${c.emoji}</div>
      <div style="min-width:0"><div class="t"><span>${esc(c.name)}</span><span>${Math.round(v / total * 100)}%</span></div>
      <div class="bar"><i style="width:${(v / topC * 100).toFixed(1)}%;background:${c.color}"></i></div></div>
      <div class="amt">${moneyBig(v)}</div></div>`; }).join("")}</div></div>`;

  // places
  const byPlace = new Map();
  list.forEach(e => { const k = e.place ? `${e.place}` : e.what, n = norm(k); const v = byPlace.get(n) || { name: k, via: e.place ? e.what : "", t: 0, c: 0 }; v.t += e.amount; v.c++; byPlace.set(n, v); });
  const places = [...byPlace.values()].sort((a, b) => b.t - a.t).slice(0, 6);
  html += `<div class="card"><h3>Top places</h3><ul class="list-plain">${places.map(p => `<li><span>${esc(p.name)}<small>${p.via ? `via ${esc(p.via)} · ` : ""}${p.c}×</small></span><b>${money(p.t)}</b></li>`).join("")}</ul></div>`;

  // items from receipts
  const byItem = new Map();
  list.forEach(e => (e.receipt?.items || []).forEach(i => { const n = norm(i.n); if (!n) return; const v = byItem.get(n) || { name: i.n, t: 0, q: 0 }; v.t += i.p || 0; v.q += i.q || 1; byItem.set(n, v); }));
  if (byItem.size) {
    const its = [...byItem.values()].sort((a, b) => b.t - a.t).slice(0, 6);
    html += `<div class="card"><h3>Top items</h3><ul class="list-plain">${its.map(i => `<li><span>${esc(i.name)}<small>× ${i.q}</small></span><b>${money(i.t)}</b></li>`).join("")}</ul></div>`;
  }
  // payment
  const byPay = {}; list.forEach(e => { if (e.pay) byPay[e.pay] = (byPay[e.pay] || 0) + e.amount; });
  if (Object.keys(byPay).length) {
    html += `<div class="card"><h3>Paid with</h3><ul class="list-plain">${Object.entries(byPay).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li><span>${esc(k)}<small>${Math.round(v / total * 100)}%</small></span><b>${money(v)}</b></li>`).join("")}</ul></div>`;
  }
  // expenses (all for a day, top 5 otherwise)
  const sorted = [...list].sort((a, b) => b.amount - a.amount);
  html += `<div class="day"><div class="dhead" style="padding-top:12px"><span style="font-weight:600">${pType === "day" ? "Expenses" : "Biggest expenses"}</span><span></span></div><ul class="rows">${(pType === "day" ? sorted : sorted.slice(0, 5)).map(rowHtml).join("")}</ul></div>`;
  $("stats").innerHTML = html;
  if (pType !== "day") drawChart(buckets(f, t), list);
}

function drawChart(bks, list) {
  const box = $("chartBox"); if (!box) return;
  bks.forEach(b => { b.v = 0; b.n = 0; });
  // bucket lookup
  for (const e of list) {
    let lo = 0, hi = bks.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (e.date < bks[mid].from) hi = mid - 1; else if (e.date > bks[mid].to) lo = mid + 1; else { bks[mid].v += e.amount; bks[mid].n++; break; } }
  }
  const W = Math.max(260, box.clientWidth), H = 170, padL = 0, padB = 20, padT = 14;
  const max = Math.max(...bks.map(b => b.v), 1), n = bks.length, slot = (W - padL) / n, bw = Math.max(2, Math.min(36, slot * 0.7));
  const nonzero = bks.filter(b => b.v > 0), avg = nonzero.length ? bks.reduce((s, b) => s + b.v, 0) / (bks[0].unit === "day" ? Math.max(1, bks.filter(b => b.from <= today()).length) : n) : 0;
  const every = n <= 12 ? 1 : n <= 31 ? (W < 380 ? 5 : 3) : Math.ceil(n / 8);
  const y = (v) => padT + (H - padB - padT) * (1 - v / max);
  let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending chart">`;
  bks.forEach((b, i) => {
    const x = padL + i * slot + (slot - bw) / 2, h = b.v ? Math.max(2, H - padB - y(b.v)) : 2;
    const cls = !b.v ? "b0" : `b${b.v === max ? " max" : ""}${chartSel === i ? " sel" : ""}`;
    s += `<rect class="${cls}" data-i="${i}" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 3).toFixed(1)}"/>`;
    s += `<rect data-i="${i}" x="${(padL + i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent" style="cursor:pointer"/>`;
    if (i % every === 0 || i === n - 1 && n <= 12) s += `<text x="${(padL + i * slot + slot / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  if (avg > 0 && nonzero.length > 1) s += `<line class="avg" x1="0" x2="${W}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}"/>`;
  s += `<text x="${W - 2}" y="10" text-anchor="end">max ${compact(max)}</text></svg>`;
  box.innerHTML = s;
  const tip = $("chartTip");
  const showTip = (i) => {
    const b = bks[i]; if (!b) return;
    tip.innerHTML = `<b>${esc(b.long)}</b>: ${money(b.v)} · ${b.n} expense${b.n === 1 ? "" : "s"}${b.unit === "day" ? ` · <button type="button" class="link" style="padding:0" data-go="${b.from}">Open day</button>` : b.unit === "month" ? ` · <button type="button" class="link" style="padding:0" data-gom="${b.from}">Open month</button>` : ""}`;
  };
  tip.innerHTML = avg > 0 && nonzero.length > 1 ? `<span>Dashed line = average ${compact(avg)} per ${bks[0].unit}. Tap a bar for details.</span>` : "Tap a bar for details.";
  if (chartSel != null) showTip(chartSel);
  box.onclick = (ev) => { const r = ev.target.closest("[data-i]"); if (!r) return; chartSel = +r.dataset.i; drawChart(bks, list); };
  tip.onclick = (ev) => {
    const d = ev.target.closest("[data-go]")?.dataset.go, m = ev.target.closest("[data-gom]")?.dataset.gom;
    if (d) { pType = "day"; pAnchor = d; chartSel = null; renderStats(); window.scrollTo(0, 0); }
    if (m) { pType = "month"; pAnchor = m; chartSel = null; renderStats(); window.scrollTo(0, 0); }
  };
}
let rzT; window.addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if (tab === "stats") renderStats(); if (tab === "cal") renderCal(); }, 150); });

// ================= ADD / EDIT SHEET =================
const addDlg = $("addDlg");
let editId = null, fCat = "other", catTouched = false, fPay = "", pendingReceipt = null;
function renderCatChips() {
  $("fCats").innerHTML = CATS.map(([id, name, emoji]) => `<button type="button" class="chip" data-cat="${id}" aria-pressed="${id === fCat}">${emoji} ${esc(name)}</button>`).join("");
}
function renderPayChips() {
  $("fPay").innerHTML = PAYS.map(p => `<button type="button" class="chip" data-pay="${esc(p)}" aria-pressed="${p === fPay}">${esc(p)}</button>`).join("");
}
$("fCats").addEventListener("click", (ev) => { const b = ev.target.closest("[data-cat]"); if (!b) return; fCat = b.dataset.cat; catTouched = true; renderCatChips(); });
$("fPay").addEventListener("click", (ev) => { const b = ev.target.closest("[data-pay]"); if (!b) return; fPay = fPay === b.dataset.pay ? "" : b.dataset.pay; renderPayChips(); });
function syncPlace() { $("placeField").hidden = !isDelivery($("fWhat").value); }
function autoCat() {
  if (catTouched) return;
  const w = $("fWhat").value.trim(); fCat = w ? catFor(w) : "other"; renderCatChips();
  const chip = $("fCats").querySelector('[aria-pressed="true"]'); chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function itemsLink() {
  const b = $("fItems");
  if (editId) { const n = byId(editId)?.receipt?.items?.length || 0; b.hidden = false; b.innerHTML = `${ICON.receipt}${n ? `Receipt · ${n} item${n === 1 ? "" : "s"}` : "Add receipt items"}`; }
  else if (pendingReceipt) { b.hidden = false; b.innerHTML = `${ICON.receipt}${pendingReceipt.items.length} items from the receipt will be saved`; }
  else b.hidden = true;
}
function openAdd(date) {
  editId = null; pendingReceipt = null; catTouched = false; fCat = "other"; fPay = LS.get("exp:lastPay", "");
  $("addTitle").textContent = "Add expense"; $("fSave").textContent = "Add expense"; $("fDelete").hidden = true;
  $("fWhat").value = ""; $("fPlace").value = ""; $("fAmount").value = ""; $("fNote").value = ""; $("fDate").value = date || today();
  setStatus(""); syncPlace(); renderCatChips(); renderPayChips(); itemsLink();
  addDlg.showModal(); $("addForm").querySelector(".sheet-body").scrollTop = 0;
  setTimeout(() => $("fWhat").focus(), 60);
}
function openEdit(id) {
  const e = byId(id); if (!e) return;
  editId = id; pendingReceipt = null; catTouched = true; fCat = e.cat || catFor(e.what); fPay = e.pay || "";
  $("addTitle").textContent = "Edit expense"; $("fSave").textContent = "Save changes"; $("fDelete").hidden = false;
  $("fWhat").value = e.what; $("fPlace").value = e.place || ""; $("fAmount").value = e.amount; $("fNote").value = e.note || ""; $("fDate").value = e.date;
  setStatus(""); syncPlace(); renderCatChips(); renderPayChips(); itemsLink();
  addDlg.showModal(); $("addForm").querySelector(".sheet-body").scrollTop = 0;
}
$("addForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const what = $("fWhat").value.trim(), amount = parseFloat($("fAmount").value);
  if (!what) { $("fWhat").focus(); return toast("Add what it was for"); }
  if (!(amount > 0)) { $("fAmount").focus(); return toast("Enter an amount"); }
  const base = editId ? { ...byId(editId) } : { id: newId(), created: Date.now() };
  const e = { ...base, what, amount: r2(amount), date: $("fDate").value || today(), cat: fCat };
  const place = isDelivery(what) ? $("fPlace").value.trim() : "";
  place ? e.place = place : delete e.place;
  fPay ? e.pay = fPay : delete e.pay;
  const note = $("fNote").value.trim(); note ? e.note = note : delete e.note;
  if (pendingReceipt) e.receipt = pendingReceipt;
  if (fPay) LS.set("exp:lastPay", fPay);
  const wasEdit = !!editId;
  addDlg.close(); upsert(e);
  if (tab === "cal") { calSel = e.date; calGo(+e.date.slice(0, 4), +e.date.slice(5, 7) - 1); }
  toast(wasEdit ? "Saved" : "Added");
});
$("fDelete").addEventListener("click", () => {
  const e = byId(editId); if (!e) return;
  const copy = { ...e };
  addDlg.close(); upsert({ ...e, deleted: true });
  toast("Deleted", () => upsert({ ...copy, deleted: false }));
});
$("fItems").addEventListener("click", () => { if (editId) openReceipt(editId); });

// ---------- autocomplete ----------
function highlight(name, q) {
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(name) : esc(name.slice(0, i)) + "<b>" + esc(name.slice(i, i + q.length)) + "</b>" + esc(name.slice(i + q.length));
}
function rankStores(q, filter, exclude) {
  const nq = norm(q), ql = q.toLowerCase().trim(), scored = [];
  if (!nq) return [];
  for (const s of STORE_IDX) {
    if (exclude.has(s.n) || (filter && !filter(s))) continue;
    const score = s.n === nq ? -1 : s.n.startsWith(nq) ? 0 : s.words.some(w => w.startsWith(ql) || w.startsWith(nq)) ? 1
      : nq.length >= 3 && s.words.some(w => w.includes(nq)) ? 2 : null;
    if (score === null) continue;
    scored.push([score * 2 + (s.india ? 0 : 1), s]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  return scored.slice(0, 7).map(([, s]) => ({ name: s.name, sub: s.cat }));
}
function rankHistory(q, field) {
  const nq = norm(q), counts = new Map();
  live().forEach(e => { const v = e[field]; if (!v) return; const k = norm(v); const c = counts.get(k); counts.set(k, { name: c?.name || v, n: (c?.n || 0) + 1 }); });
  const out = [...counts.entries()].filter(([k]) => k.includes(nq))
    .sort((a, b) => (b[0].startsWith(nq) - a[0].startsWith(nq)) || b[1].n - a[1].n)
    .slice(0, 4).map(([, v]) => ({ name: v.name, sub: v.n > 1 ? `${v.n}×` : "" }));
  return { out, taken: new Set(counts.keys()) };
}
function makeAc(input, box, source, onPick) {
  let opts = [], idx = -1;
  const close = () => { box.classList.remove("open"); input.setAttribute("aria-expanded", "false"); idx = -1; };
  const open = (q) => {
    if (!norm(q)) return close();
    const sections = source(q).filter(s => s.opts.length);
    opts = sections.flatMap(s => s.opts); idx = -1;
    if (!opts.length) return close();
    let i = 0;
    box.innerHTML = sections.map(s => `<div class="ac-sec">${esc(s.title)}</div>` + s.opts.map(o =>
      `<div class="ac-opt" role="option" data-i="${i++}"><span>${highlight(o.name, q)}</span><small>${esc(o.sub)}</small></div>`).join("")).join("");
    box.scrollTop = 0; box.classList.add("open"); input.setAttribute("aria-expanded", "true");
  };
  const pick = (i) => { const o = opts[i]; if (!o) return; input.value = o.name; close(); onPick(true); };
  input.addEventListener("input", () => open(input.value.trim()));
  input.addEventListener("focus", () => { if (input.value.trim()) open(input.value.trim()); });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !box.classList.contains("open")) { ev.preventDefault(); onPick(false); return; }
    if (!box.classList.contains("open")) return;
    const els = box.querySelectorAll(".ac-opt");
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      idx = (idx + (ev.key === "ArrowDown" ? 1 : -1) + els.length) % els.length;
      els.forEach((el, i) => el.classList.toggle("active", i === idx));
      els[idx].scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter") { ev.preventDefault(); if (idx >= 0) pick(idx); else { close(); onPick(false); } }
    else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
    else if (ev.key === "Tab") close();
  });
  box.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".ac-opt")) ev.preventDefault(); });
  box.addEventListener("click", (ev) => { const el = ev.target.closest(".ac-opt"); if (el) pick(+el.dataset.i); });
  input.addEventListener("blur", () => setTimeout(close, 150));
  return { close };
}
makeAc($("fWhat"), $("acWhat"), (q) => {
  const h = rankHistory(q, "what");
  return [{ title: "Your history", opts: h.out }, { title: "Stores", opts: rankStores(q, null, h.taken) }];
}, () => { syncPlace(); autoCat(); (isDelivery($("fWhat").value) ? $("fPlace") : $("fAmount")).focus(); });
makeAc($("fPlace"), $("acPlace"), (q) => {
  const h = rankHistory(q, "place");
  return [{ title: "Your restaurants", opts: h.out }, { title: "Restaurants", opts: rankStores(q, s => FOOD_PLACE.has(s.cat), h.taken) }];
}, () => $("fAmount").focus());
$("fWhat").addEventListener("input", () => { syncPlace(); autoCat(); });

// ---------- receipt scanning ----------
function setStatus(msg, ok) { const st = $("scanStatus"); st.textContent = msg; st.classList.toggle("ok", !!ok); }
let tessLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return tessLoading ||= new Promise((ok, fail) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    sc.onload = ok; sc.onerror = () => { tessLoading = null; sc.remove(); fail(new Error("Couldn't load the receipt reader. Check your internet connection and try again.")); };
    document.head.appendChild(sc);
  });
}
async function prepImage(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { src = new Image(); src.src = URL.createObjectURL(file); await src.decode(); }
  const w = src.width, h = src.height, scale = Math.min(1, 2000 / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) { let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; v = Math.max(0, Math.min(255, (v - 128) * 1.5 + 128)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(px, 0, 0); return c;
}
$("scanBtn").addEventListener("click", () => $("scanFile").click());
$("scanFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0]; ev.target.value = ""; if (!file) return;
  const btn = $("scanBtn"); btn.disabled = true; setStatus("Loading receipt reader…");
  try {
    const [, img] = await Promise.all([loadTesseract(), prepImage(file)]);
    const { data } = await Tesseract.recognize(img, "eng", { logger: m => { if (m.status === "recognizing text") setStatus(`Reading receipt… ${Math.round(m.progress * 100)}%`); } });
    const r = parseReceipt(data.text || ""), found = [];
    if (r.store) {
      if (isDelivery($("fWhat").value) && !isDelivery(r.store)) { $("fPlace").value = r.store; found.push("restaurant"); }
      else { $("fWhat").value = r.store; found.push("store"); }
    }
    if (r.amount) { $("fAmount").value = r.amount; found.push("amount"); }
    if (r.date) { $("fDate").value = r.date; found.push("date"); }
    syncPlace(); autoCat();
    pendingReceipt = (r.items.length || r.extras.length) ? { items: r.items, extras: r.extras } : null;
    if (pendingReceipt) found.push(`${r.items.length} item${r.items.length === 1 ? "" : "s"}`);
    itemsLink();
    setStatus(found.length ? `Found ${found.join(", ")}. Check, then tap ${editId ? "Save changes" : "Add expense"}.` : "Couldn't read this receipt. Try a flat, well-lit photo, or type it in.", !!found.length);
  } catch (err) { setStatus(err.message || "Something went wrong reading the receipt."); }
  finally { btn.disabled = false; }
});

// ================= RECEIPT DIALOG =================
const rDlg = $("rcptDlg");
let rId = null, rEditing = false;
function openReceipt(id) {
  const e = byId(id); if (!e) return;
  rId = id; rEditing = !(e.receipt?.items?.length || e.receipt?.extras?.length);
  drawReceipt(); rDlg.showModal(); $("rBody").scrollTop = 0;
  if (rEditing) setTimeout(() => $("rBody").querySelector("input")?.focus(), 60);
}
const sums = (list, extras) => { const sub = r2(list.reduce((s, i) => s + (i.p || 0), 0)), tax = r2(extras.reduce((s, i) => s + (i.p || 0), 0)); return { sub, tax, calc: r2(sub + tax) }; };
function totalsHtml(e, list, extras) {
  const { sub, tax, calc } = sums(list, extras), gap = r2(e.amount - calc), any = list.length || extras.length;
  let h = `<div class="totals">
    <div class="ri"><span>Items subtotal</span><span class="p">${money(sub)}</span></div>
    <div class="ri"><span>Tax &amp; charges</span><span class="p">${money(tax)}</span></div>`;
  if (any && Math.abs(gap) >= 0.5) h += `<div class="ri gap"><span>${gap > 0 ? "Not itemised" : "Over the total by"}</span><span class="p">${money(Math.abs(gap))}</span></div>`;
  h += `<div class="ri grand"><span>Total paid</span><span class="p">${money(e.amount)}</span></div></div>`;
  if (any && Math.abs(gap) >= 0.5) h += `<button type="button" class="fix" data-act="usecalc">Set total paid to ${money(calc)}</button>`;
  return h;
}
function drawReceipt() {
  const e = byId(rId); if (!e || e.deleted) return rDlg.close();
  const list = e.receipt?.items || [], extras = e.receipt?.extras || [];
  $("rTitle").textContent = e.place || e.what;
  $("rSub").textContent = (e.place ? `via ${e.what} · ` : "") + dLong(e.date);
  if (!rEditing) {
    $("rBody").innerHTML = `<div class="sec-title">Items</div><div class="rlist">${list.length ? list.map(i => `<div class="ri"><span class="n">${esc(i.n)}${i.q ? `<small>× ${i.q}</small>` : ""}</span><span class="p">${money(i.p)}</span></div>`).join("") : `<p class="none">No items added.</p>`}</div>
      <div class="sec-title">Tax &amp; charges</div><div class="rlist">${extras.length ? extras.map(i => `<div class="ri"><span class="n">${esc(i.n)}</span><span class="p">${money(i.p)}</span></div>`).join("") : `<p class="none">None.</p>`}</div>
      ${totalsHtml(e, list, extras)}`;
    $("rFoot").innerHTML = `<button type="button" class="btn secondary" data-close>Close</button><button type="button" class="btn primary" data-act="edit">Edit items</button>`;
    return;
  }
  $("rBody").innerHTML = `<div class="sec-title">Items</div>
    <div class="er-head"><span>Item</span><span style="text-align:center">Qty</span><span>Price</span><span></span></div>
    <div id="erItems">${(list.length ? list : [{ n: "", p: "" }]).map(itemRow).join("")}</div>
    <div><button type="button" class="link" data-act="additem">${ICON.plus}Add item</button></div>
    <div class="sec-title">Tax &amp; charges</div>
    <div id="erTax">${extras.map(taxRow).join("")}</div>
    <div><button type="button" class="link" data-act="addtax">${ICON.plus}Add tax or charge</button></div>
    <div id="erTotals"></div>`;
  $("rFoot").innerHTML = `<button type="button" class="btn secondary" data-act="cancel">Cancel</button><button type="button" class="btn primary" data-act="save">Save</button>`;
  liveTotals();
}
const itemRow = (i) => `<div class="er"><input class="nm" placeholder="Item name" value="${esc(i.n)}" autocapitalize="sentences">
  <input class="q" type="number" inputmode="numeric" min="1" step="1" placeholder="1" value="${i.q ?? ""}" aria-label="Quantity">
  <div class="money"><input class="pr" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${i.p ?? ""}" aria-label="Price"></div>
  <button type="button" class="rm" data-act="rm" aria-label="Remove">${ICON.x}</button></div>`;
const taxRow = (i) => `<div class="er tax"><input class="nm" placeholder="e.g. GST, delivery fee" value="${esc(i.n)}">
  <div class="money"><input class="pr" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${i.p ?? ""}" aria-label="Amount"></div>
  <button type="button" class="rm" data-act="rm" aria-label="Remove">${ICON.x}</button></div>`;
function readRows() {
  const list = [...$("erItems").querySelectorAll(".er")].map(r => {
    const n = r.querySelector(".nm").value.trim(), p = parseFloat(r.querySelector(".pr").value), q = parseInt(r.querySelector(".q").value, 10);
    if (!n && isNaN(p)) return null; const o = { n: n || "Item", p: r2(p || 0) }; if (q > 1) o.q = q; return o;
  }).filter(Boolean);
  const extras = [...$("erTax").querySelectorAll(".er")].map(r => {
    const n = r.querySelector(".nm").value.trim(), p = parseFloat(r.querySelector(".pr").value);
    if (!n && isNaN(p)) return null; return { n: n || "Charge", p: r2(p || 0) };
  }).filter(Boolean);
  return { list, extras };
}
function liveTotals() { const e = byId(rId); if (!e) return; const { list, extras } = readRows(); $("erTotals").innerHTML = totalsHtml(e, list, extras); }
$("rBody").addEventListener("input", (ev) => { if (rEditing && ev.target.matches(".pr")) liveTotals(); });
rDlg.addEventListener("click", (ev) => {
  const act = ev.target.closest("[data-act]")?.dataset.act; if (!act) return;
  const e = byId(rId); if (!e) return;
  if (act === "edit") { rEditing = true; drawReceipt(); }
  else if (act === "cancel") { if (e.receipt?.items?.length || e.receipt?.extras?.length) { rEditing = false; drawReceipt(); } else rDlg.close(); }
  else if (act === "additem") { $("erItems").insertAdjacentHTML("beforeend", itemRow({ n: "", p: "" })); $("erItems").lastElementChild.querySelector(".nm").focus(); }
  else if (act === "addtax") { $("erTax").insertAdjacentHTML("beforeend", taxRow({ n: "", p: "" })); $("erTax").lastElementChild.querySelector(".nm").focus(); }
  else if (act === "rm") { ev.target.closest(".er").remove(); liveTotals(); }
  else if (act === "usecalc") {
    const src = rEditing ? readRows() : { list: e.receipt?.items || [], extras: e.receipt?.extras || [] };
    upsert({ ...e, amount: sums(src.list, src.extras).calc });
    if (addDlg.open && editId === e.id) $("fAmount").value = byId(e.id).amount;
    rEditing ? liveTotals() : drawReceipt(); toast("Total updated");
  }
  else if (act === "save") {
    const { list, extras } = readRows(), n = { ...e };
    if (list.length || extras.length) n.receipt = { items: list, extras }; else delete n.receipt;
    upsert(n); itemsLink();
    if (n.receipt) { rEditing = false; drawReceipt(); } else rDlg.close();
    toast("Receipt saved");
  }
});

// ================= ACCOUNT =================
const aDlg = $("acctDlg");
let authMode = "login", authErr = "", authBusy = false, mergeOffer = 0;
$("acctBtn").addEventListener("click", () => openAccount());
function openAccount(focus) {
  authErr = ""; renderAccount(); aDlg.showModal();
  if (focus === "budget") setTimeout(() => { $("budgetIn")?.focus(); $("budgetIn")?.scrollIntoView({ block: "center" }); }, 60);
}
function syncLine() {
  if (syncState === "busy") return "Syncing…";
  if (syncState === "err") return syncErr || "Couldn't sync. Will retry.";
  if (!lastSynced) return dirty.size ? "Waiting to sync" : "Not synced yet";
  const s = Math.round((Date.now() - lastSynced) / 1000);
  return `Synced ${s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(lastSynced).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}`;
}
function renderAccount() {
  const u = Sync.user, b = $("acctBody");
  let h = "";
  if (!Sync.configured) {
    h += `<div class="note-box"><b>Sign-in isn't switched on yet.</b><br>Your expenses are saved on this device for now. Once the database is connected, you'll be able to log in from any device.</div>`;
  } else if (!u) {
    h += `<div class="seg" role="tablist"><button type="button" data-mode="login" aria-selected="${authMode === "login"}">Log in</button><button type="button" data-mode="signup" aria-selected="${authMode === "signup"}">Create account</button></div>
      <form id="authForm" style="display:grid;gap:12px" novalidate>
        <label class="field"><span>Username</span><input id="aUser" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. bobby"></label>
        <label class="field"><span>Password</span><input id="aPass" type="password" autocomplete="${authMode === "login" ? "current-password" : "new-password"}" placeholder="${authMode === "login" ? "Your password" : "At least 6 characters"}"></label>
        <p class="err" id="aErr">${esc(authErr)}</p>
        <button type="submit" class="btn primary block" ${authBusy ? "disabled" : ""}>${authBusy ? "Please wait…" : authMode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p class="muted small" style="margin:0">Log in with the same username and password on any device to see the same expenses.</p>`;
  } else {
    h += `<div class="acct-hero"><span class="avatar">${esc(u.username[0].toUpperCase())}</span><div style="min-width:0"><b>${esc(u.username)}</b><span class="muted small">${esc(syncLine())}</span></div></div>`;
    if (mergeOffer) h += `<div class="note-box"><b>${mergeOffer} expense${mergeOffer === 1 ? "" : "s"}</b> were added on this device before you logged in. Add them to <b>${esc(u.username)}</b>?
      <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn primary" style="flex:1;height:40px" data-act="merge">Add them</button><button type="button" class="btn secondary" style="flex:1;height:40px" data-act="nomerge">Not now</button></div></div>`;
    h += `<div style="display:flex;gap:8px"><button type="button" class="btn secondary" style="flex:1" data-act="syncnow">Sync now</button><button type="button" class="btn secondary" style="flex:1" data-act="logout">Log out</button></div>`;
  }
  const budget = +settings().budget || "";
  h += `<div class="card" style="margin:0"><h3>Monthly budget</h3>
      <div style="display:flex;gap:8px"><div class="money" style="flex:1"><input id="budgetIn" type="number" inputmode="decimal" min="0" step="100" placeholder="e.g. 30000" value="${budget}"></div><button type="button" class="btn primary" data-act="savebudget">Save</button></div>
      <p class="muted small" style="margin:8px 0 0">Shows how much you have left, and how much you can spend per day for the rest of the month.</p></div>
    <div class="settings">
      <button type="button" data-act="export">Export to CSV <span>Backup or spreadsheet</span></button>
      <button type="button" data-act="import">Import from CSV <span>Adds, skips duplicates</span></button>
    </div>
    <p class="ver">Expenses v${VERSION}</p>`;
  b.innerHTML = h;
  $("acctTitle").textContent = u ? "Account" : Sync.configured ? (authMode === "login" ? "Log in" : "Create account") : "Settings";
  $("authForm")?.addEventListener("submit", doAuth);
}
async function doAuth(ev) {
  ev.preventDefault(); if (authBusy) return;
  const user = $("aUser").value.trim(), pass = $("aPass").value;
  if (!user || !pass) { authErr = "Enter a username and password."; renderAccount(); return; }
  authBusy = true; authErr = ""; renderAccount(); $("aUser").value = user;
  try {
    authMode === "login" ? await Sync.signIn(user, pass) : await Sync.signUp(user, pass);
    authBusy = false;
    const guestLive = LS.get(K("items", "guest"), []).filter(e => !e.deleted).length;
    switchSpace();
    mergeOffer = guestLive;
    try { await Sync.loadMeta(); } catch {}
    renderAccount(); renderAll();
    toast(authMode === "login" ? `Welcome back, ${Sync.user.username}` : `Account created. Welcome, ${Sync.user.username}!`);
    await syncNow();
  } catch (err) {
    authBusy = false; authErr = err.message; renderAccount();
    $("aUser").value = user; $("aPass").focus();
  }
}
function switchSpace() { loadSpace(); setSyncState(Sync.user ? "idle" : "off"); renderAll(); }
$("acctBody").addEventListener("click", async (ev) => {
  const m = ev.target.closest("[data-mode]")?.dataset.mode;
  if (m) { authMode = m; authErr = ""; renderAccount(); $("aUser")?.focus(); return; }
  const act = ev.target.closest("[data-act]")?.dataset.act; if (!act) return;
  if (act === "syncnow") { await syncNow(); renderAccount(); }
  else if (act === "logout") {
    if (dirty.size) await syncNow();
    if (dirty.size && !confirm(`${dirty.size} change${dirty.size === 1 ? " hasn't" : "s haven't"} synced yet and will be lost on this device. Log out anyway?`)) return;
    const space = ns();
    ["items", "dirty", "cursor", "synced"].forEach(k => LS.del(K(k, space)));
    await Sync.signOut(); mergeOffer = 0; switchSpace(); renderAccount(); toast("Logged out");
  }
  else if (act === "merge") {
    const guest = LS.get(K("items", "guest"), []).filter(e => !e.deleted), have = new Set(items.map(e => e.id));
    guest.forEach(e => { const n = { ...e, updated: Date.now() }; if (have.has(n.id)) n.id = newId(); items.push(n); dirty.add(n.id); });
    ["items", "dirty", "cursor", "synced"].forEach(k => LS.del(K(k, "guest")));
    mergeOffer = 0; persist(); renderAll(); renderAccount(); toast(`Added ${guest.length} expense${guest.length === 1 ? "" : "s"}`); syncNow();
  }
  else if (act === "nomerge") { mergeOffer = 0; renderAccount(); }
  else if (act === "savebudget") {
    const v = parseFloat($("budgetIn").value);
    await saveSettings({ budget: v > 0 ? Math.round(v) : 0 }); renderAll(); toast(v > 0 ? "Budget saved" : "Budget removed"); aDlg.close();
  }
  else if (act === "export") exportCsv();
  else if (act === "import") $("importFile").click();
});

// ================= CSV =================
function exportCsv() {
  const all = live(); if (!all.length) return toast("Nothing to export yet");
  const rows = [["date", "what", "restaurant", "amount", "category", "paid_with", "note", "items", "tax_and_charges"],
    ...[...all].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, e.what, e.place || "", e.amount, CAT[e.cat]?.name || "", e.pay || "", e.note || "",
      (e.receipt?.items || []).map(i => `${i.n}${i.q ? " x" + i.q : ""}: ${i.p}`).join("; "),
      (e.receipt?.extras || []).map(i => `${i.n}: ${i.p}`).join("; ")])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `expenses-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$("importFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0]; ev.target.value = ""; if (!file) return;
  const rows = parseCSV(await file.text()), head = (rows[0] || []).map(h => h.trim().toLowerCase());
  const col = (name, d = -1) => { const i = head.indexOf(name); return i >= 0 ? i : d; };
  const ci = { date: col("date", 0), what: col("what", 1), amount: col("amount", 2), place: col("restaurant"), cat: col("category"), pay: col("paid_with"), note: col("note"), items: col("items", col("receipt_items")), tax: col("tax_and_charges") };
  const catByName = Object.fromEntries(CATS.map(([id, name]) => [name.toLowerCase(), id]));
  const parseList = (s) => (s || "").split(";").map(x => x.trim()).filter(Boolean).map(x => { const m = /^(.*?)(?:\s+x(\d+))?:\s*(-?[\d.]+)$/.exec(x); if (!m) return null; const o = { n: m[1], p: parseFloat(m[3]) }; if (m[2]) o.q = +m[2]; return o; }).filter(Boolean);
  const seen = new Set(live().map(e => `${e.date}|${norm(e.what)}|${e.amount}`));
  let added = 0;
  for (const r of rows.slice(1)) {
    const date = r[ci.date], what = (r[ci.what] || "").trim(), amt = parseFloat(r[ci.amount]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !what || !(amt > 0)) continue;
    const k = `${date}|${norm(what)}|${amt}`; if (seen.has(k)) continue; seen.add(k);
    const e = { id: newId(), date, what, amount: r2(amt), created: Date.now(), updated: Date.now() };
    e.cat = (ci.cat >= 0 && catByName[(r[ci.cat] || "").toLowerCase()]) || catFor(what);
    if (ci.place >= 0 && r[ci.place]) e.place = r[ci.place];
    if (ci.pay >= 0 && r[ci.pay]) e.pay = r[ci.pay];
    if (ci.note >= 0 && r[ci.note]) e.note = r[ci.note];
    const li = ci.items >= 0 ? parseList(r[ci.items]) : [], tx = ci.tax >= 0 ? parseList(r[ci.tax]) : [];
    if (li.length || tx.length) e.receipt = { items: li, extras: tx };
    items.push(e); if (Sync.user) dirty.add(e.id); added++;
  }
  persist(); renderAll(); scheduleSync(200);
  toast(`Imported ${added} expense${added === 1 ? "" : "s"}`);
});
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ================= boot =================
loadSpace();
setSyncState(Sync.user ? "idle" : "off");
showTab(["list", "cal", "stats"].includes(tab) ? tab : "list");
if (Sync.user) { syncNow(); Sync.loadMeta().then(() => renderAll()).catch(() => {}); }
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
window.__app = { syncNow, get items() { return items; }, get dirty() { return dirty; } }; // for debugging
})();
