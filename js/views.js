// Home, Spend (list / calendar / insights), Expense detail.
import { $, esc, norm, r2, money, moneyBig, moneyHero, moneyIn, compact, today, addDays, addMonths, diffDays, parse, ymd, daysIn, weekStart, fyStart, monthStart, monthEnd,
  MONTHS, dLong, dMed, dShort, dayLabel, timeAgo, plural, I, pad, LOGO } from "./util.js";
import { CATS, cat, PAYS } from "./cats.js";
import * as St from "./store.js";
import { Api } from "./api.js";
import { sheet, toast, go, confirmBox, pickList, pickCategory, rowHtml, groupedHtml, hydrateThumbs, viewImage } from "./ui.js";
import { openCreate, openForm, openSplit, startScan, openItems, newReport } from "./create.js";
import { imgUrl } from "./media.js";

const syncPill = () => {
  if (!Api.user) return `<button class="sync-pill" data-go="#/account" type="button"><i></i>Not signed in</button>`;
  const s = St.S.state, txt = s === "busy" ? "Syncing" : s === "err" || s === "offline" ? "Sync issue" : "Synced";
  return `<button class="sync-pill ${s === "ok" || s === "idle" ? "ok" : s === "busy" ? "busy" : s === "err" || s === "offline" ? "err" : ""}" data-go="#/account" type="button"><i></i>${txt}</button>`;
};
export const top = (title, { back, right = "" } = {}) => `<header class="top">${back ? `<button class="icon-btn back" type="button" data-back="${back}" aria-label="Back">${I.back}</button>` : ""}<h1>${esc(title)}</h1>${right}</header>`;

// =============== HOME ===============
export function home() {
  const all = St.expenses(), t = today(), P = St.prefs(), per = St.period();
  const inP = (e) => per.inRange(e.date);
  const month = all.filter(inP).reduce((s, e) => s + St.mine(e), 0);
  const todayTot = all.filter(e => e.date === t).reduce((s, e) => s + St.mine(e), 0);
  const monthTot = all.filter(e => e.date.startsWith(t.slice(0, 7))).reduce((s, e) => s + St.mine(e), 0);
  const inMonth = St.incomes().filter(inP).reduce((s, e) => s + e.amount, 0);
  const officeMonth = all.filter(e => inP(e) && St.isOffice(e)).reduce((s, e) => s + St.spendOf(e), 0);
  const daysLeft = Math.max(1, per.daysLeft);
  let budget = "";
  if (P.budget > 0) {
    const left = P.budget - month, pct = Math.min(100, month / P.budget * 100);
    budget = `<div class="hbar${left < 0 ? " over" : pct > 85 ? " warn" : ""}" role="progressbar" aria-label="Budget used ${per.name}" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="--w:${pct}%"></i></div>
      <div class="hero-foot">${left >= 0 ? `<span><b>${moneyBig(left)}</b> left of ${moneyBig(P.budget)}</span>${per.kind !== "day" && daysLeft > 1 ? `<span><b>${moneyBig(Math.floor(left / daysLeft))}</b>/day for ${plural(daysLeft, "day")}</span>` : ""}`
        : `<span><b>${moneyBig(-left)}</b> over your ${moneyBig(P.budget)} budget</span>`}</div>`;
  }
  // per-category budgets
  const catSpent = {}; all.filter(inP).forEach(e => catSpent[e.cat] = (catSpent[e.cat] || 0) + St.mine(e));
  const cb = Object.entries(P.catBudgets || {}).filter(([, v]) => v > 0);
  const budgetRows = cb.map(([id, lim]) => ({ id, lim, spent: catSpent[id] || 0, pct: (catSpent[id] || 0) / lim * 100 })).sort((a, b) => b.pct - a.pct);
  // to-dos
  const todo = [];
  const scanning = all.filter(e => e.status === "scanning").length, review = all.filter(e => e.status === "review" || e.status === "failed").length;
  const dupes = St.duplicates(), bals = St.balances();
  if (scanning) todo.push({ ic: I.scan, cls: "acc", t: `Reading ${plural(scanning, "receipt")}…`, s: "Details fill in automatically", go: "#/spend?f=review" });
  if (review) todo.push({ ic: I.receipt, t: `${plural(review, "scanned expense")} to review`, s: "Check what we read from the photo", go: "#/spend?f=review" });
  if (dupes.size) todo.push({ ic: I.copy, t: `${plural(dupes.size, "possible duplicate")}`, s: "Same amount and date — keep or delete", go: "#/spend?f=dupes" });
  const owed = bals.filter(b => b.v > 0).reduce((s, b) => s + b.v, 0), owe = bals.filter(b => b.v < 0).reduce((s, b) => s - b.v, 0);
  if (owed || owe) todo.push({ ic: I.split, cls: "acc", t: owed ? `Friends owe you ${money(owed)}` : `You owe ${money(owe)}`, s: owed && owe ? `You owe ${money(owe)}` : "Settle up or send a UPI request", go: "#/splits" });
  for (const r of St.reports().filter(r => r.status !== "reimbursed")) {
    const claim = St.claimOf(r);
    if (claim > 0) todo.push({ ic: I.folder, cls: r.status === "submitted" ? "good" : "", t: r.status === "submitted" ? `Waiting on ${money(claim)}` : `${money(claim)} to claim`, s: `Report · ${r.name}`, go: `#/report/${r.id}` });
  }
  for (const b of budgetRows) {
    if (b.pct > 100) todo.push({ ic: I.alert, cls: "bad", t: `${cat(b.id).name} is ${money(b.spent - b.lim)} over budget`, s: `${money(b.spent)} of ${money(b.lim)} ${per.name}`, go: "#/spend?v=insights" });
    else if (b.pct >= 85) todo.push({ ic: I.alert, t: `${cat(b.id).name}: ${Math.round(b.pct)}% of budget used`, s: `${money(b.lim - b.spent)} left for ${plural(daysLeft, "day")}`, go: "#/spend?v=insights" });
  }
  const asks = all.filter(e => e.ask).length;
  if (asks) todo.unshift({ ic: I.split, cls: "acc", t: `${plural(asks, "payment")} to people`, s: "What were they for? Sort them in a few taps", go: "#/people" });
  const misread = all.filter(e => e.src && !e.inChecked && /\bbank\b/i.test(e.what || "") && /\d{3,4}\s*$/.test(e.what || "") && /gpay|upi-app|phonepe|paytm/.test(e.src.from || "")).length;
  if (misread) todo.unshift({ ic: I.arrowIn, cls: "acc", t: `${plural(misread, "import")} may be money you received`, s: "Counted as spending by an older import — check them", go: "#/income?check=1" });
  if (St.S.inbox.length) todo.unshift({ ic: I.bell, cls: "acc", t: `${plural(St.S.inbox.length, "new bank alert")}`, s: "Tap to review and add them", go: "#/import?inbox=1" });
  for (const r of all.filter(e => e.repeat)) { const d = St.nextDue(r), n = d && diffDays(t, d); if (n != null && n <= 3) todo.push({ ic: I.repeat, t: `${r.what} · ${money(r.amount)} ${n === 1 ? "tomorrow" : n === 0 ? "today" : `in ${n} days`}`, s: `Repeats ${St.REPEATS[r.repeat.every].toLowerCase()} — added automatically on ${dShort(d)}`, go: `#/expense/${r.id}` }); }
  if (St.S.noBucket) todo.push({ ic: I.image, t: "Receipt photos aren't backing up", s: "One more setup step — tap to see how", go: "#/account" });
  const recent = [...all].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0)).slice(0, 5);
  const hi = Api.user ? `Hi, ${esc(Api.user.username)}` : "Home";

  $("view").innerHTML = top(hi, { right: syncPill() }) + `
    <section class="hero-card" aria-label="${esc(per.label)}"><span class="hero-gecko" aria-hidden="true">${LOGO}</span>
      <div class="hero-top"><span>${esc(per.label)}</span><span class="hero-pill">${per.kind === "day" ? `${MONTHS[new Date().getMonth()].slice(0, 3)} <b>${moneyBig(monthTot)}</b>` : `Today <b>${moneyBig(todayTot)}</b>`}</span></div>
      <div class="hero-big num" data-count="${month}">${moneyHero(month)}</div>
      ${budget}
      ${inMonth ? `<button type="button" class="hero-in" data-go="#/income"><span>Received <b>+${moneyBig(inMonth)}</b></span><span>${inMonth >= month ? `<b>${moneyBig(inMonth - month)}</b> left` : `<b>${moneyBig(month - inMonth)}</b> over`}</span>${I.right}</button>` : ""}
      ${officeMonth ? `<button type="button" class="hero-office" data-go="#/reports"><span>Office &amp; reimbursable · not counted</span><b>${moneyBig(officeMonth)}</b></button>` : ""}
    </section>
    <div class="quick flow">
      <button type="button" class="flow-btn out" data-q="manual"><span class="fi">${I.arrowOut}</span><span><b>Spent</b><small>Money out</small></span></button>
      <button type="button" class="flow-btn in" data-q="income"><span class="fi">${I.arrowIn}</span><span><b>Received</b><small>Money in</small></span></button>
    </div>
    <div class="sec-h">To-do</div>
    <div class="todo">${todo.length ? todo.map(x => `<button type="button" data-go="${x.go}"><span class="ti ${x.cls || ""}">${x.ic}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><span class="chev">${I.right}</span></button>`).join("")
      : `<button type="button" style="cursor:default" tabindex="-1"><span class="ti good">${I.check}</span><span><b>You're all caught up</b><small>Nothing needs your attention</small></span><span></span></button>`}</div>
    ${budgetRows.length ? `<div class="sec-h">Budgets ${esc(per.name)}<button type="button" data-act="budget">Edit</button></div><div class="card"><div class="brk">${budgetRows.map(b => { const c = cat(b.id), left = b.lim - b.spent; return `
      <div class="brk-row"><div class="cat-ico" style="background:${c.color}22">${c.emoji}</div><div style="min-width:0"><div class="t"><span>${esc(c.name)}</span><span class="${b.pct > 100 ? "bal-neg" : ""}">${left >= 0 ? `${moneyBig(left)} left` : `${moneyBig(-left)} over`}</span></div>
      <div class="bar ${b.pct > 100 ? "over" : b.pct >= 85 ? "warn" : ""}"><i style="--w:${Math.min(100, b.pct).toFixed(1)}%"></i></div><div class="sub">${moneyBig(b.spent)} of ${moneyBig(b.lim)}</div></div></div>`; }).join("")}</div></div>` : ""}
    <div class="sec-h">Recent<button type="button" data-go="#/spend">See all</button></div>
    ${recent.length ? `<div class="group"><ul class="rows">${recent.map(e => rowHtml(e, { dupes, showDate: true })).join("")}</ul></div>`
      : `<div class="card empty"><b>Nothing here yet</b>Tap Spent when you pay for something, or import a bank or Google Pay statement.<br><button type="button" class="btn secondary" data-go="#/import">${I.upload}Import a statement</button></div>`}`;
  hydrateThumbs($("view"));
}
export function homeClick(ev) {
  const q = ev.target.closest("[data-q]")?.dataset.q;
  if (q === "income") import("./income.js").then(m => m.openIncome());
  if (q === "scan") startScan(); else if (q === "manual") openForm(); else if (q === "distance") openForm({ type: "distance" }); else if (q === "split") openSplit();
  if (ev.target.closest("[data-act=budget]")) editBudget();
}
/** Budgets: one overall monthly limit + optional limits per category */
export async function editBudget() {
  const P = St.prefs(), per = St.period(), spent = {};
  St.expenses().filter(e => per.inRange(e.date)).forEach(e => spent[e.cat] = (spent[e.cat] || 0) + St.mine(e));
  const { CATS: list } = await import("./cats.js");
  const order = [...list].sort((a, b) => (spent[b.id] || 0) - (spent[a.id] || 0));
  const s = sheet({ title: "Budgets", sub: `Limits ${per.per}. Leave blank for no limit.`, body: `
    <button type="button" class="per-row" id="bPer"><span>Budget period</span><b>${esc(St.PERIODS[per.kind] || "Monthly")}${per.kind === "cycle" || per.kind === "custom" ? ` · ${dShort(per.from)} – ${dShort(per.to)}` : ""}</b>${I.right}</button>
    <label class="field"><span>Total ${per.per}</span><div class="money"><input id="bAll" type="number" inputmode="numeric" min="0" step="500" value="${P.budget || ""}" placeholder="e.g. 40000"></div></label>
    <div class="sec-h" style="margin:4px 0 -4px">By category</div>
    <div class="bud-list">${order.map(c => `<label class="bud-row"><span class="cat-ico" style="background:${c.color}22">${c.emoji}</span><span class="bud-n">${esc(c.name)}<small>${spent[c.id] ? `${moneyBig(spent[c.id])} so far` : "Nothing yet"}</small></span>
      <span class="money"><input type="number" inputmode="numeric" min="0" step="100" data-cb="${c.id}" value="${(P.catBudgets || {})[c.id] || ""}" placeholder="—" aria-label="${esc(c.name)} budget"></span></label>`).join("")}</div>
    <p class="muted small" id="bSum" style="margin:0"></p>`,
    foot: `<button type="button" class="btn primary" id="bOk">Save budgets</button>` });
  const sum = () => { const t = [...s.el.querySelectorAll("[data-cb]")].reduce((a, i) => a + (parseFloat(i.value) || 0), 0), all = parseFloat(s.el.querySelector("#bAll").value) || 0;
    s.el.querySelector("#bSum").textContent = t ? `Category budgets add up to ${moneyBig(t)}${all && t > all ? ` — more than your ${moneyBig(all)} total` : ""}.` : ""; };
  s.body.addEventListener("input", sum); sum();
  s.el.querySelector("#bPer").onclick = async () => { s.close(); const { whenSettled } = await import("./ui.js"); whenSettled(async () => { if (await pickPeriod()) editBudget(); }); };
  s.el.querySelector("#bOk").onclick = () => {
    const cbs = {}; s.el.querySelectorAll("[data-cb]").forEach(i => { const v = Math.round(parseFloat(i.value)); if (v > 0) cbs[i.dataset.cb] = v; });
    const all = Math.round(parseFloat(s.el.querySelector("#bAll").value)) || 0;
    St.setPrefs({ budget: all > 0 ? all : 0, catBudgets: cbs }); s.close(); toast("Budgets saved");
  };
}

/** Settings: what time frame the Home card and budgets use */
export async function pickPeriod() {
  const P = St.prefs(), cur = P.period?.kind || "month";
  const v = await pickList({ title: "Budget period", value: cur, options: [
    { value: "day", label: "Daily", sub: "Today's spending vs a daily budget" }, { value: "week", label: "Weekly", sub: "Monday to Sunday" },
    { value: "month", label: "Monthly", sub: "1st to end of month (default)" }, { value: "year", label: "Yearly", sub: "January to December" },
    { value: "cycle", label: "Pay cycle", sub: "A month that starts on your payday, e.g. 25th to 24th" }, { value: "custom", label: "Custom dates", sub: "Any start and end date, e.g. a trip" }] });
  if (!v) return false;
  if (v === "cycle") {
    const { promptBox } = await import("./ui.js");
    const d = await promptBox({ title: "Pay cycle starts on", label: "Day of the month (1–28)", value: String(P.period?.start || 1), type: "number", inputmode: "numeric" });
    if (d === null) return false;
    const n = Math.round(+d); if (!(n >= 1 && n <= 28)) { toast("Pick a day from 1 to 28"); return false; }
    St.setPrefs({ period: { kind: "cycle", start: n } });
  } else if (v === "custom") {
    const r = await pickDates(P.period?.kind === "custom" ? P.period : { from: today(), to: addDays(today(), 13) });
    if (!r) return false;
    St.setPrefs({ period: { kind: "custom", ...r } });
  } else St.setPrefs({ period: { kind: v } });
  toast(`Budget period: ${St.period().label.replace(/^Spent /, "")}`);
  return true;
}
function pickDates({ from, to }) {
  return new Promise(res => {
    let val = null;
    const s = sheet({ title: "Custom dates", body: `<div class="row2"><label class="field"><span>From</span><input type="date" id="pdFrom" value="${esc(from)}"></label><label class="field"><span>To</span><input type="date" id="pdTo" value="${esc(to)}"></label></div><p class="err" id="pdErr"></p>`,
      foot: `<button type="button" class="btn primary" id="pdOk">Use these dates</button>`, onClose: () => res(val) });
    s.el.querySelector("#pdOk").onclick = () => { const f = s.el.querySelector("#pdFrom").value, t = s.el.querySelector("#pdTo").value; if (!f || !t || f > t) { s.el.querySelector("#pdErr").textContent = "The end date must be on or after the start date."; return; } val = { from: f, to: t }; s.close(); };
  });
}

// =============== SPEND ===============
const F0 = () => ({ q: "", date: { p: "all" }, cats: [], pays: [], min: "", max: "", receipt: "any", reimb: false, report: "any", types: [], status: "any", tag: "" });
const SP = { mode: "list", f: F0(), limit: 150, selecting: false, sel: new Set() };
const DATE_OPTS = [["all", "Any time"], ["month", "This month"], ["last", "Last month"], ["30", "Last 30 days"], ["fy", "This financial year"], ["lastfy", "Last financial year"], ["year", "This year"], ["custom", "Custom range"]];
function dateRange(d) {
  const t = today();
  switch (d.p) {
    case "month": return [monthStart(t), monthEnd(t)];
    case "last": { const s = addMonths(monthStart(t), -1); return [s, monthEnd(s)]; }
    case "30": return [addDays(t, -29), t];
    case "fy": { const s = fyStart(t); return [s, `${+s.slice(0, 4) + 1}-03-31`]; }
    case "lastfy": { const s = fyStart(t), y = +s.slice(0, 4) - 1; return [`${y}-04-01`, `${y + 1}-03-31`]; }
    case "year": return [`${t.slice(0, 4)}-01-01`, `${t.slice(0, 4)}-12-31`];
    case "custom": return [d.from || "0000-01-01", d.to || "9999-12-31"];
    default: return null;
  }
}
function applyFilters(list, f, dupes) {
  const r = dateRange(f.date), q = f.q.trim().toLowerCase(), min = parseFloat(f.min), max = parseFloat(f.max);
  return list.filter(e => {
    if (r && (e.date < r[0] || e.date > r[1])) return false;
    if (f.cats.length && !f.cats.includes(e.cat)) return false;
    if (f.pays.length && !f.pays.includes(e.pay)) return false;
    const a = St.spendOf(e);
    if (!isNaN(min) && a < min) return false;
    if (!isNaN(max) && a > max) return false;
    if (f.receipt === "yes" && !(e.img || e.receipt?.items?.length)) return false;
    if (f.receipt === "no" && (e.img || e.receipt?.items?.length)) return false;
    if (f.reimb && !e.reimb) return false;
    if (f.report === "none" && e.reportId) return false;
    if (f.report !== "any" && f.report !== "none" && e.reportId !== f.report) return false;
    if (f.types.length && !f.types.includes(e.type || "manual")) return false;
    if (f.status === "review" && !["review", "failed", "scanning"].includes(e.status)) return false;
    if (f.status === "dupes" && !dupes.has(e.id)) return false;
    if (f.tag && !(e.tags || []).some(t => norm(t) === norm(f.tag))) return false;
    if (q && ![e.what, e.place, e.note, e.pay, cat(e.cat).name, ...(e.tags || []), ...(e.receipt?.items || []).map(i => i.n), ...(e.split?.shares || []).map(s => s.name), String(e.amount)]
      .some(v => v && String(v).toLowerCase().includes(q))) return false;
    return true;
  });
}
const activeCount = (f) => [f.date.p !== "all", f.cats.length, f.pays.length, f.min !== "" || f.max !== "", f.receipt !== "any", f.reimb, f.report !== "any", f.types.length, f.status !== "any", f.tag].filter(Boolean).length;
export function spendParams(params) {
  SP.mode = params.get("v") || (params.get("f") || params.get("tag") ? "list" : SP.mode);
  if (!params.get("f") && !params.get("tag")) { SP.f.status = "any"; SP.f.tag = ""; } // shortcut filters don't stick around
  const f = params.get("f");
  if (f === "review" || f === "dupes") { SP.f = F0(); SP.f.status = f; SP.mode = "list"; }
  if (params.get("tag")) { SP.f = F0(); SP.f.tag = params.get("tag"); SP.mode = "list"; }
}
export function spend() {
  const seg = `<div class="seg" role="tablist" style="margin-bottom:12px">${[["list", "List", I.list], ["cal", "Calendar", I.cal], ["insights", "Insights", I.chart]].map(([k, l, ic]) => `<button type="button" role="tab" data-mode="${k}" aria-selected="${SP.mode === k}">${ic}${l}</button>`).join("")}</div>`;
  const right = SP.mode === "list" ? `<button class="icon-btn" type="button" data-act="select" aria-label="${SP.selecting ? "Done selecting" : "Select expenses"}" title="Select">${SP.selecting ? I.x : I.check}</button><button class="icon-btn" type="button" data-act="export" aria-label="Export these to CSV" title="Export CSV">${I.download}</button>` : "";
  let body = "";
  if (SP.mode === "cal") body = calHtml(); else if (SP.mode === "insights") body = insightsHtml(); else body = listHtml();
  $("view").innerHTML = top("Spend", { right }) + seg + body;
  if (SP.mode === "insights") drawChartLater();
  hydrateThumbs($("view"));
  renderBulk();
}
function listHtml() {
  const dupes = St.duplicates(), f = SP.f;
  const res = applyFilters(St.expenses(), f, dupes).sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  SP.lastRes = res;
  const tot = res.reduce((s, e) => s + St.mine(e), 0), off = res.reduce((s, e) => s + (St.isOffice(e) ? St.spendOf(e) : 0), 0);
  const dl = DATE_OPTS.find(o => o[0] === f.date.p)?.[1] || "Date";
  const dateLbl = f.date.p === "custom" ? `${f.date.from ? dShort(f.date.from) : "…"} – ${f.date.to ? dShort(f.date.to) : "…"}` : dl;
  const chip = (k, label, on) => `<button type="button" class="chip${on ? " on" : ""}" data-f="${k}">${esc(label)}${I.down}</button>`;
  const more = [f.receipt !== "any", f.reimb, f.report !== "any", f.types.length, f.status !== "any", f.tag].filter(Boolean).length;
  const statusLbl = f.status === "review" ? "Needs review" : f.status === "dupes" ? "Possible duplicates" : "";
  return `<div class="searchbar">${I.search}<input type="search" id="q" placeholder="Search merchant, item, note, tag, friend…" value="${esc(f.q)}" aria-label="Search expenses"></div>
    <div class="chips filters">
      ${chip("date", f.date.p === "all" ? "Date" : dateLbl, f.date.p !== "all")}
      ${chip("cat", f.cats.length ? (f.cats.length === 1 ? cat(f.cats[0]).name : `${f.cats.length} categories`) : "Category", f.cats.length)}
      ${chip("pay", f.pays.length ? f.pays.join(", ") : "Paid with", f.pays.length)}
      ${chip("amt", f.min !== "" || f.max !== "" ? `${f.min !== "" ? compact(+f.min) : "₹0"} – ${f.max !== "" ? compact(+f.max) : "any"}` : "Amount", f.min !== "" || f.max !== "")}
      ${chip("more", statusLbl || (f.tag ? `#${f.tag}` : more ? `More (${more})` : "More"), more)}
      ${activeCount(f) || f.q ? `<button type="button" class="chip" data-f="clear">${I.x}Clear</button>` : ""}
    </div>
    <div class="res-h"><span><b>${plural(res.length, "expense")}</b>${res.length ? ` · ${money(tot)}` : ""}${off ? ` <span class="office-note">+ ${money(off)} office</span>` : ""}</span>${SP.selecting ? `<button type="button" class="link" data-act="selall">${SP.sel.size === res.length && res.length ? "Select none" : "Select all"}</button>` : ""}</div>
    <div id="list" class="${SP.selecting ? "selecting" : ""}">${res.length ? groupedHtml(res.slice(0, SP.limit), { dupes, selected: SP.sel })
      + (res.length > SP.limit ? `<button type="button" class="btn secondary block" data-act="more">Show ${Math.min(300, res.length - SP.limit)} more</button>` : "")
      : St.expenses().length ? `<div class="card empty"><b>No matches</b>Try a different search or clear the filters.</div>`
      : `<div class="card empty"><b>No expenses yet</b>Tap + to scan a receipt or add one.</div>`}</div>`;
}
function renderBulk() {
  let bar = $("bulkbar");
  if (!(SP.mode === "list" && SP.selecting && location.hash.startsWith("#/spend"))) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "bulkbar"; bar.className = "bulkbar"; document.body.appendChild(bar); bar.addEventListener("click", bulkAction); }
  const sel = [...SP.sel].map(St.get).filter(Boolean), tot = sel.reduce((s, e) => s + St.spendOf(e), 0);
  bar.innerHTML = `<div class="cnt"><b>${sel.length} selected</b>${money(tot)}</div>
    <button type="button" data-b="cat" aria-label="Change category" title="Category">${I.tag}</button>
    <button type="button" data-b="report" aria-label="Add to report" title="Add to report">${I.folder}</button>
    <button type="button" data-b="moneyin" aria-label="These were money in" title="Money in">${I.arrowIn}</button>
    <button type="button" data-b="export" aria-label="Export selected" title="Export CSV">${I.download}</button>
    <button type="button" data-b="delete" aria-label="Delete selected" title="Delete">${I.trash}</button>
    <button type="button" data-b="done" aria-label="Done" title="Done">${I.x}</button>`;
}
async function bulkAction(ev) {
  const b = ev.target.closest("[data-b]")?.dataset.b; if (!b) return;
  const ids = [...SP.sel].filter(id => St.get(id));
  if (b === "done") { SP.selecting = false; SP.sel.clear(); spend(); return; }
  if (!ids.length) return toast("Select some expenses first");
  if (b === "cat") {
    const v = await pickCategory({ title: `Category for ${plural(ids.length, "expense")}` });
    if (v) { St.saveMany(ids.map(id => ({ ...St.get(id), cat: v }))); toast(`Moved ${plural(ids.length, "expense")} to ${cat(v).name}`); }
  } else if (b === "report") {
    const rs = St.activeReports();
    const v = await pickList({ title: "Add to report", options: [...rs.map(r => ({ value: r.id, label: r.name, sub: plural(St.inReport(r.id).length, "expense") })), { value: "__new", label: "+ New report" }, { value: "__none", label: "Remove from report" }] });
    if (!v) return;
    let rid = v; if (v === "__new") { const r = await newReport(); if (!r) return; rid = r.id; }
    St.saveMany(ids.map(id => { const n = { ...St.get(id) }; if (rid === "__none") delete n.reportId; else n.reportId = rid; return n; }));
    toast(rid === "__none" ? "Removed from report" : `Added ${plural(ids.length, "expense")} to ${St.get(rid).name}`);
  } else if (b === "moneyin") {
    const ok = ids.filter(id => !St.get(id).split);
    if (!await confirmBox({ title: `Move ${plural(ok.length, "payment")} to money in?`, text: "Use this for money you received that was counted as spending. They'll leave your spending totals.", ok: "Move to money in" })) return;
    const { incomeCatFor } = await import("./cats.js");
    ok.forEach(id => { const e = St.get(id); St.toIncome(id, incomeCatFor(`${e.what} ${e.note || ""}`, !!e.toPerson)); });
    SP.selecting = false; SP.sel.clear(); spend();
    toast(`Moved ${plural(ok.length, "payment")} to money in`, () => ok.forEach(id => St.toExpense(id)));
  } else if (b === "export") exportCsv(ids.map(St.get), "selected");
  else if (b === "delete") {
    if (!await confirmBox({ title: `Delete ${plural(ids.length, "expense")}?`, text: "You can undo this right after.", ok: "Delete", danger: true })) return;
    const copies = ids.map(id => JSON.parse(JSON.stringify(St.get(id)))); St.saveMany(copies.map(c => ({ ...c, deleted: true }))); SP.sel.clear(); SP.selecting = false;
    toast(`Deleted ${plural(copies.length, "expense")}`, () => St.saveMany(copies.map(c => ({ ...c, deleted: false }))));
  }
  spend();
}
// filter sheets
async function filterSheet(k) {
  const f = SP.f;
  if (k === "clear") { SP.f = F0(); SP.limit = 150; return spend(); }
  if (k === "date") {
    const s = sheet({ title: "Date", body: `<div class="set-list">${DATE_OPTS.map(([v, l]) => {
      const r = v !== "custom" && v !== "all" ? dateRange({ p: v }) : null;
      return `<button type="button" class="set-row" data-v="${v}" style="grid-template-columns:minmax(0,1fr) auto"><span>${l}${r ? `<small>${dMed(r[0])} – ${dMed(r[1])}</small>` : ""}</span><span class="val" style="color:var(--accent)">${f.date.p === v ? I.check : ""}</span></button>`; }).join("")}</div>
      <div class="row2" id="dCustom" ${f.date.p === "custom" ? "" : "hidden"}><label class="field"><span>From</span><input type="date" id="dFrom" value="${esc(f.date.from || "")}"></label><label class="field"><span>To</span><input type="date" id="dTo" value="${esc(f.date.to || "")}"></label></div>`,
      foot: `<button type="button" class="btn primary" id="dApply">Apply</button>` });
    let p = f.date.p;
    s.body.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; p = b.dataset.v; s.body.querySelectorAll("[data-v] .val").forEach(x => x.innerHTML = ""); b.querySelector(".val").innerHTML = I.check; s.el.querySelector("#dCustom").hidden = p !== "custom"; if (p !== "custom") apply(); });
    const apply = () => { SP.f.date = p === "custom" ? { p, from: s.el.querySelector("#dFrom").value, to: s.el.querySelector("#dTo").value } : { p }; s.close(); spend(); };
    s.el.querySelector("#dApply").onclick = apply;
  } else if (k === "cat" || k === "pay") {
    const opts = k === "cat" ? CATS.map(c => ({ v: c.id, l: `${c.emoji}  ${c.name}` })) : PAYS.map(p => ({ v: p, l: p }));
    const cur = new Set(k === "cat" ? f.cats : f.pays);
    const s = sheet({ title: k === "cat" ? "Categories" : "Paid with", body: `<div class="chips wrap">${opts.map(o => `<button type="button" class="chip" data-v="${esc(o.v)}" aria-pressed="${cur.has(o.v)}">${esc(o.l)}</button>`).join("")}</div>`,
      foot: `<button type="button" class="btn secondary" id="fcClr">Clear</button><button type="button" class="btn primary" id="fcOk">Apply</button>` });
    s.body.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; cur.has(b.dataset.v) ? cur.delete(b.dataset.v) : cur.add(b.dataset.v); b.setAttribute("aria-pressed", cur.has(b.dataset.v)); });
    s.el.querySelector("#fcClr").onclick = () => { cur.clear(); s.body.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", "false")); };
    s.el.querySelector("#fcOk").onclick = () => { if (k === "cat") SP.f.cats = [...cur]; else SP.f.pays = [...cur]; s.close(); spend(); };
  } else if (k === "amt") {
    const s = sheet({ title: "Amount", body: `<div class="row2"><label class="field"><span>Minimum</span><div class="money"><input id="aMin" type="number" inputmode="decimal" min="0" value="${esc(f.min)}" placeholder="0"></div></label>
      <label class="field"><span>Maximum</span><div class="money"><input id="aMax" type="number" inputmode="decimal" min="0" value="${esc(f.max)}" placeholder="Any"></div></label></div>`,
      foot: `<button type="button" class="btn secondary" id="aClr">Clear</button><button type="button" class="btn primary" id="aOk">Apply</button>` });
    s.el.querySelector("#aClr").onclick = () => { SP.f.min = ""; SP.f.max = ""; s.close(); spend(); };
    s.el.querySelector("#aOk").onclick = () => { SP.f.min = s.el.querySelector("#aMin").value; SP.f.max = s.el.querySelector("#aMax").value; s.close(); spend(); };
  } else if (k === "more") {
    const rs = St.reports();
    const tags = [...new Set(St.expenses().flatMap(e => e.tags || []))].sort();
    const s = sheet({ title: "More filters", body: `
      <label class="field"><span>Status</span><select id="mStatus"><option value="any">Any</option><option value="review">Needs review (scanned)</option><option value="dupes">Possible duplicates</option></select></label>
      <label class="field"><span>Receipt</span><select id="mRec"><option value="any">Any</option><option value="yes">Has receipt photo or items</option><option value="no">No receipt</option></select></label>
      <label class="field"><span>Report</span><select id="mRep"><option value="any">Any</option><option value="none">Not on a report</option>${rs.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></label>
      ${tags.length ? `<label class="field"><span>Tag</span><select id="mTag"><option value="">Any</option>${tags.map(t => `<option value="${esc(t)}">#${esc(t)}</option>`).join("")}</select></label>` : ""}
      <div class="field"><span>Type</span><div class="chips wrap" id="mTypes">${[["manual", "Manual"], ["scan", "Scanned"], ["distance", "Distance"], ["split", "Split"]].map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${f.types.includes(v)}">${l}</button>`).join("")}</div></div>
      <label class="inline-row"><span>Reimbursable only</span><span class="switch"><input type="checkbox" id="mReimb" ${f.reimb ? "checked" : ""}><i></i></span></label>`,
      foot: `<button type="button" class="btn primary" id="mOk">Apply</button>` });
    const $$ = (q) => s.el.querySelector(q);
    $$("#mStatus").value = f.status; $$("#mRec").value = f.receipt; $$("#mRep").value = f.report; if ($$("#mTag")) $$("#mTag").value = f.tag;
    const types = new Set(f.types);
    $$("#mTypes").onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; types.has(b.dataset.v) ? types.delete(b.dataset.v) : types.add(b.dataset.v); b.setAttribute("aria-pressed", types.has(b.dataset.v)); };
    $$("#mOk").onclick = () => { Object.assign(SP.f, { status: $$("#mStatus").value, receipt: $$("#mRec").value, report: $$("#mRep").value, tag: $$("#mTag")?.value || "", types: [...types], reimb: $$("#mReimb").checked }); s.close(); spend(); };
  }
}
let pressT = null, pressed = false;
export function spendClick(ev) {
  const mode = ev.target.closest("[data-mode]")?.dataset.mode;
  if (mode) { SP.mode = mode; SP.selecting = false; SP.sel.clear(); history.replaceState(null, "", "#/spend" + (mode === "list" ? "" : `?v=${mode}`)); spend(); return true; }
  const f = ev.target.closest("[data-f]")?.dataset.f; if (f) { filterSheet(f); return true; }
  const act = ev.target.closest("[data-act]")?.dataset.act;
  if (act === "select") { SP.selecting = !SP.selecting; SP.sel.clear(); spend(); return true; }
  if (act === "selall") { const all = SP.lastRes || []; SP.sel = SP.sel.size === all.length ? new Set() : new Set(all.map(e => e.id)); spend(); return true; }
  if (act === "more") { SP.limit += 300; spend(); return true; }
  if (act === "export") { exportCsv(SP.lastRes || St.expenses(), "spend"); return true; }
  if (pressed) { pressed = false; if (ev.target.closest(".erow[data-id]")) return true; }
  if (SP.mode === "list" && SP.selecting) {
    const row = ev.target.closest(".erow[data-id]");
    if (row) { const id = row.dataset.id; SP.sel.has(id) ? SP.sel.delete(id) : SP.sel.add(id); row.classList.toggle("sel"); renderBulk(); return true; }
  }
  if (SP.mode === "cal") return calClick(ev);
  if (SP.mode === "insights") return insClick(ev);
  return false;
}
let qT = null;
export function spendInput(ev) {
  if (ev.target.id !== "q" || ev.isComposing) return;
  SP.f.q = ev.target.value; SP.limit = 150;
  clearTimeout(qT); qT = setTimeout(refreshList, 120);
}
document.addEventListener("compositionend", (ev) => { if (ev.target.id === "q") { SP.f.q = ev.target.value; refreshList(); } });
/** Re-render results without touching the search box (keeps keyboard + predictive text intact) */
function refreshList() {
  if (!location.hash.startsWith("#/spend") || SP.mode !== "list") return;
  const tmp = document.createElement("div"); tmp.innerHTML = listHtml();
  for (const sel of [".filters", ".res-h", "#list"]) { const a = document.querySelector("#view " + sel), b = tmp.querySelector(sel); if (a && b) a.replaceWith(b); }
  hydrateThumbs($("view"));
}
// long-press to start selecting (mobile)
document.addEventListener("pointerdown", (ev) => {
  if (!location.hash.startsWith("#/spend") || SP.mode !== "list" || SP.selecting) return;
  pressed = false;
  const row = ev.target.closest("#list .erow[data-id]"); if (!row) return;
  clearTimeout(pressT);
  pressT = setTimeout(() => { pressed = true; SP.selecting = true; SP.sel = new Set([row.dataset.id]); spend(); navigator.vibrate?.(15); }, 550);
});
["pointerup", "pointercancel", "pointermove"].forEach(t => document.addEventListener(t, (e) => { if (t === "pointermove" && Math.abs(e.movementY) + Math.abs(e.movementX) < 4) return; clearTimeout(pressT); }));
export const leaveSpend = () => { SP.selecting = false; SP.sel.clear(); $("bulkbar")?.remove(); };

// ---- calendar ----
const CAL = { sel: today(), y: new Date().getFullYear(), m: new Date().getMonth() };
export function calendarGoto(d) { CAL.sel = d; CAL.y = +d.slice(0, 4); CAL.m = +d.slice(5, 7) - 1; }
function calHtml() {
  const totals = new Map(), t = today();
  St.expenses().forEach(e => { if (St.isOffice(e)) return; const v = totals.get(e.date) || { t: 0, n: 0 }; v.t += St.spendOf(e); v.n++; totals.set(e.date, v); });
  const first = new Date(CAL.y, CAL.m, 1).getDay(), n = daysIn(CAL.y, CAL.m);
  let max = 0, mTot = 0, mCount = 0;
  for (let d = 1; d <= n; d++) { const v = totals.get(`${CAL.y}-${pad(CAL.m + 1)}-${pad(d)}`); if (v) { max = Math.max(max, v.t); mTot += v.t; mCount += v.n; } }
  let grid = "";
  for (let i = 0; i < first; i++) grid += `<span class="cday out" aria-hidden="true"></span>`;
  for (let d = 1; d <= n; d++) {
    const key = `${CAL.y}-${pad(CAL.m + 1)}-${pad(d)}`, v = totals.get(key);
    const cls = ["cday", v && "has", key === t && "today", key === CAL.sel && "sel", key > t && "future"].filter(Boolean).join(" ");
    grid += `<button type="button" class="${cls}" data-d="${key}" style="--h:${v && max ? Math.sqrt(v.t / max).toFixed(2) : 0}" aria-label="${dLong(key)}${v ? `, ${money(v.t)}` : ""}"><span>${d}</span>${v ? `<small>${compact(v.t)}</small>` : ""}</button>`;
  }
  const isCur = CAL.y === new Date().getFullYear() && CAL.m === new Date().getMonth();
  const dayList = St.expenses().filter(e => e.date === CAL.sel).sort((a, b) => (b.created || 0) - (a.created || 0)), dv = totals.get(CAL.sel), dl = dayLabel(CAL.sel);
  const short = innerWidth < 400;
  return `<div class="card"><div class="cal-head">
      <button class="cal-title" type="button" data-c="pick" aria-label="Pick month and year">${short ? MONTHS[CAL.m].slice(0, 3) : MONTHS[CAL.m]} ${CAL.y}${I.down}</button>
      <div class="cal-nav"><button class="today-btn" type="button" data-c="today">Today</button>
      <button class="icon-btn" type="button" data-c="prev" aria-label="Previous month">${I.left}</button><button class="icon-btn" type="button" data-c="next" aria-label="Next month">${I.right}</button></div></div>
    <div class="cal-week"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="cal-grid" id="calGrid">${grid}</div>
    <div class="cal-sum"><span>${MONTHS[CAL.m].slice(0, 3)} total <b>${moneyBig(mTot)}</b></span><span>${plural(mCount, "expense")} · avg <b>${compact(mTot / Math.max(1, isCur ? new Date().getDate() : n))}</b>/day</span></div></div>
    <div class="group" id="calDay"><div class="ghead" style="font-size:.9rem;padding-top:12px"><span style="color:var(--text);font-weight:600">${dl}${["Today", "Yesterday"].includes(dl) ? ` · ${dShort(CAL.sel)}` : ""}</span><span>${dv ? money(dv.t) : ""}</span></div>
    ${dayList.length ? `<ul class="rows">${dayList.map(e => rowHtml(e)).join("")}</ul>` : `<p class="empty" style="padding:14px">No expenses on this day.</p>`}
    <div style="padding:0 14px 12px"><button type="button" class="link" data-c="add">${I.plus}Add expense on ${dShort(CAL.sel)}</button></div></div>`;
}
function calGo(y, m) { const d = new Date(y, m, 1); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); spend(); }
function calClick(ev) {
  const c = ev.target.closest("[data-c]")?.dataset.c, d = ev.target.closest("[data-d]")?.dataset.d;
  if (d) { CAL.sel = d; spend(); $("calDay")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); return true; }
  if (c === "prev") calGo(CAL.y, CAL.m - 1); else if (c === "next") calGo(CAL.y, CAL.m + 1);
  else if (c === "today") { CAL.sel = today(); calGo(new Date().getFullYear(), new Date().getMonth()); }
  else if (c === "add") openCreate({ date: CAL.sel });
  else if (c === "pick") monthPicker();
  return !!c;
}
let swipeX = null, swipeY = null;
document.addEventListener("touchstart", (e) => { if (!e.target.closest("#calGrid")) return; swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (swipeX == null) return; const dx = e.changedTouches[0].clientX - swipeX, dy = e.changedTouches[0].clientY - swipeY; swipeX = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) calGo(CAL.y, CAL.m + (dx < 0 ? 1 : -1));
});
function monthPicker() {
  let y = CAL.y;
  const months = () => { const tot = {}; St.expenses().forEach(e => { if (e.date.startsWith(y + "-")) { const m = +e.date.slice(5, 7) - 1; tot[m] = (tot[m] || 0) + St.mine(e); } });
    return MONTHS.map((m, i) => `<button type="button" data-m="${i}" aria-current="${y === CAL.y && i === CAL.m}">${m.slice(0, 3)}${tot[i] ? `<small>${compact(tot[i])}</small>` : ""}</button>`).join(""); };
  const s = sheet({ title: "Go to", center: true, body: `<div class="picker-year"><button class="icon-btn bordered" type="button" data-y="-1" aria-label="Previous year">${I.left}</button>
    <input id="pyIn" type="number" inputmode="numeric" aria-label="Year" value="${y}"><button class="icon-btn bordered" type="button" data-y="1" aria-label="Next year">${I.right}</button></div>
    <div class="picker-months" id="pyM">${months()}</div><label class="field"><span>Or jump to a date</span><input type="date" id="pyD" value="${CAL.sel}"></label>` });
  const redraw = () => { s.el.querySelector("#pyM").innerHTML = months(); };
  s.body.addEventListener("click", (e) => {
    const dy = e.target.closest("[data-y]")?.dataset.y; if (dy) { y += +dy; s.el.querySelector("#pyIn").value = y; redraw(); }
    const m = e.target.closest("[data-m]")?.dataset.m; if (m != null) { s.close(); CAL.y = y; CAL.m = +m; spend(); }
  });
  s.el.querySelector("#pyIn").addEventListener("input", (e) => { const v = parseInt(e.target.value, 10); if (v > 0 && v < 10000) { y = v; redraw(); } });
  s.el.querySelector("#pyD").addEventListener("change", (e) => { const v = e.target.value; if (!v) return; s.close(); calendarGoto(v); spend(); });
}

// ---- insights ----
const IN = { p: "month", a: today(), from: addDays(today(), -29), to: today(), sel: null, office: false };
function inRange(p = IN.p, a = IN.a) {
  if (p === "day") return [a, a];
  if (p === "week") { const s = weekStart(a); return [s, addDays(s, 6)]; }
  if (p === "month") return [monthStart(a), monthEnd(a)];
  if (p === "year") { const y = a.slice(0, 4); return [`${y}-01-01`, `${y}-12-31`]; }
  if (p === "fy") { const s = fyStart(a); return [s, `${+s.slice(0, 4) + 1}-03-31`]; }
  return IN.from <= IN.to ? [IN.from, IN.to] : [IN.to, IN.from];
}
function inPrev() {
  const [f, t] = inRange();
  if (IN.p === "day") return inRange("day", addDays(IN.a, -1));
  if (IN.p === "week") return inRange("week", addDays(IN.a, -7));
  if (IN.p === "month") return inRange("month", addMonths(f, -1));
  if (IN.p === "year" || IN.p === "fy") return inRange(IN.p, addMonths(f, -12));
  const len = diffDays(f, t) + 1; return [addDays(f, -len), addDays(f, -1)];
}
function inLabel() {
  const [f, t] = inRange(), sameY = f.slice(0, 4) === t.slice(0, 4);
  if (IN.p === "day") return dLong(f);
  if (IN.p === "month") return `${MONTHS[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}`;
  if (IN.p === "year") return f.slice(0, 4);
  if (IN.p === "fy") return `FY ${f.slice(0, 4)}–${String(+f.slice(0, 4) + 1).slice(2)}`;
  return `${parse(f).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameY ? {} : { year: "numeric" }) })} – ${dMed(t)}`;
}
function inShift(dir) {
  IN.sel = null;
  const [f, t] = inRange();
  if (IN.p === "day") IN.a = addDays(IN.a, dir); else if (IN.p === "week") IN.a = addDays(IN.a, 7 * dir); else if (IN.p === "month") IN.a = addMonths(f, dir);
  else if (IN.p === "year" || IN.p === "fy") IN.a = addMonths(f, 12 * dir);
  else { const len = diffDays(f, t) + 1; IN.from = addDays(f, len * dir); IN.to = addDays(t, len * dir); }
  spend();
}
function buckets(f, t) {
  const len = diffDays(f, t) + 1, out = [];
  if (IN.p === "year" || IN.p === "fy" || (IN.p === "custom" && len > 62 && len <= 800)) {
    let d = monthStart(f);
    while (d <= t) { const me = monthEnd(d); out.push({ from: d < f ? f : d, to: me > t ? t : me, label: MONTHS[+d.slice(5, 7) - 1].slice(0, 3), long: `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`, unit: "month" }); d = addMonths(d, 1); }
  } else if (IN.p === "custom" && len > 800) {
    for (let y = +f.slice(0, 4); y <= +t.slice(0, 4); y++) out.push({ from: `${y}-01-01` < f ? f : `${y}-01-01`, to: `${y}-12-31` > t ? t : `${y}-12-31`, label: String(y), long: String(y), unit: "year" });
  } else for (let i = 0; i < len; i++) { const d = addDays(f, i); out.push({ from: d, to: d, label: IN.p === "week" ? parse(d).toLocaleDateString("en-IN", { weekday: "short" }) : String(+d.slice(8)), long: dLong(d), unit: "day" }); }
  return out;
}
function insightsHtml() {
  const [f, t] = inRange(), [pf, pt] = inPrev(), all = St.expenses().filter(e => IN.office || !St.isOffice(e));
  const officeN = St.expenses().filter(e => St.isOffice(e) && e.date >= f && e.date <= t).length;
  const list = all.filter(e => e.date >= f && e.date <= t), total = list.reduce((s, e) => s + St.spendOf(e), 0);
  const prevTot = all.filter(e => e.date >= pf && e.date <= pt).reduce((s, e) => s + St.spendOf(e), 0);
  const tt = today(), elapsed = f > tt ? 0 : diffDays(f, t < tt ? t : tt) + 1, avg = total / Math.max(1, elapsed || diffDays(f, t) + 1);
  const big = list.reduce((m, e) => St.spendOf(e) > (m ? St.spendOf(m) : 0) ? e : m, null);
  const unit = IN.p === "custom" ? "period" : IN.p === "fy" ? "financial year" : IN.p;
  let delta = "";
  if (prevTot > 0) { const pc = Math.round((total - prevTot) / prevTot * 100); delta = `<span class="delta ${pc > 0 ? "up" : "down"}">${pc > 0 ? "▲" : pc < 0 ? "▼" : ""} ${Math.abs(pc)}%</span> <span class="muted small">vs previous ${unit} (${moneyBig(prevTot)})</span>`; }
  else if (total > 0) delta = `<span class="muted small">Nothing logged in the previous ${unit}</span>`;
  let h = `<div class="chips" style="margin-bottom:4px">${[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["fy", "Financial year"], ["custom", "Custom"]].map(([k, l]) => `<button type="button" class="chip" data-p="${k}" aria-pressed="${IN.p === k}">${l}</button>`).join("")}</div>
    ${officeN || IN.office ? `<label class="inline-row" style="margin:10px 2px 0"><span class="small">Include office &amp; reimbursable<small>${plural(officeN, "expense")} in this period</small></span><span class="switch"><input type="checkbox" id="inOffice" ${IN.office ? "checked" : ""}><i></i></span></label>` : ""}
    <div class="period"><button class="icon-btn bordered" type="button" data-i="prev" aria-label="Previous">${I.left}</button><b>${inLabel()}</b><button class="icon-btn bordered" type="button" data-i="next" aria-label="Next">${I.right}</button></div>
    ${IN.p === "custom" ? `<div class="row2" style="margin-bottom:12px"><label class="field"><span>From</span><input type="date" id="inFrom" value="${IN.from}"></label><label class="field"><span>To</span><input type="date" id="inTo" value="${IN.to}"></label></div>` : ""}
    <div class="card"><div class="muted small">${IN.office ? "Total spent (incl. office)" : "Your spending"}</div><div class="num" style="font-size:clamp(1.6rem,8vw,2.1rem);font-weight:750;line-height:1.15;white-space:nowrap">${moneyBig(total)}</div><div style="margin-top:4px">${delta}</div>
    <div class="kpis"><div class="kpi"><span>Expenses</span><b>${list.length}</b></div><div class="kpi"><span>${IN.p === "day" ? "Average" : "Per day"}</span><b>${IN.p === "day" ? (list.length ? compact(total / list.length) : "₹0") : compact(avg)}</b></div><div class="kpi"><span>Biggest</span><b>${big ? compact(St.spendOf(big)) : "₹0"}</b></div></div></div>`;
  if (!list.length) return h + `<div class="card empty"><b>Nothing logged</b>No expenses in this ${unit}.</div>`;
  if (IN.p !== "day") h += `<div class="card"><h3>Spending over time</h3><div id="chartBox"></div><div class="chart-tip" id="chartTip"></div></div>`;
  const byCat = {}; list.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + St.spendOf(e));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  h += `<div class="card"><h3>By category</h3><div class="brk">${cats.map(([id, v]) => { const c = cat(id); return `<div class="brk-row"><div class="cat-ico" style="background:${c.color}22">${c.emoji}</div>
    <div style="min-width:0"><div class="t"><span>${esc(c.name)}</span><span>${total ? Math.round(v / total * 100) : 0}%</span></div><div class="bar"><i style="width:${(v / cats[0][1] * 100).toFixed(1)}%;background:${c.color}"></i></div></div><div class="amt">${moneyBig(v)}</div></div>`; }).join("")}</div></div>`;
  const byP = new Map(); list.forEach(e => { const k = e.place || e.what || "Untitled", n = norm(k); const v = byP.get(n) || { name: k, via: e.place ? e.what : "", t: 0, c: 0 }; v.t += St.spendOf(e); v.c++; byP.set(n, v); });
  h += `<div class="card"><h3>Top places</h3><ul class="plain">${[...byP.values()].sort((a, b) => b.t - a.t).slice(0, 6).map(p => `<li><span>${esc(p.name)}<small>${p.via ? `via ${esc(p.via)} · ` : ""}${p.c}×</small></span><b>${money(p.t)}</b></li>`).join("")}</ul></div>`;
  const byI = new Map(); list.forEach(e => (e.receipt?.items || []).forEach(i => { const n = norm(i.n); if (!n) return; const v = byI.get(n) || { name: i.n, t: 0, q: 0 }; v.t += i.p || 0; v.q += i.q || 1; byI.set(n, v); }));
  if (byI.size) h += `<div class="card"><h3>Top items from receipts</h3><ul class="plain">${[...byI.values()].sort((a, b) => b.t - a.t).slice(0, 6).map(i => `<li><span>${esc(i.name)}<small>× ${i.q}</small></span><b>${money(i.t)}</b></li>`).join("")}</ul></div>`;
  const byPay = {}; list.forEach(e => { if (e.pay) byPay[e.pay] = (byPay[e.pay] || 0) + St.spendOf(e); });
  if (Object.keys(byPay).length) h += `<div class="card"><h3>Paid with</h3><ul class="plain">${Object.entries(byPay).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li><span>${esc(k)}<small>${Math.round(v / total * 100)}%</small></span><b>${money(v)}</b></li>`).join("")}</ul></div>`;
  const sorted = [...list].sort((a, b) => St.spendOf(b) - St.spendOf(a));
  h += `<div class="group"><div class="ghead" style="padding-top:12px"><span style="font-weight:600">${IN.p === "day" ? "Expenses" : "Biggest expenses"}</span></div><ul class="rows">${(IN.p === "day" ? sorted : sorted.slice(0, 5)).map(e => rowHtml(e, { showDate: IN.p !== "day" })).join("")}</ul></div>`;
  IN._list = list; IN._b = IN.p === "day" ? null : buckets(f, t);
  return h;
}
function drawChartLater() { requestAnimationFrame(() => IN._b && drawChart(IN._b, IN._list)); }
function drawChart(bks, list) {
  const box = $("chartBox"); if (!box) return;
  bks.forEach(b => { b.v = 0; b.n = 0; });
  for (const e of list) { let lo = 0, hi = bks.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (e.date < bks[m].from) hi = m - 1; else if (e.date > bks[m].to) lo = m + 1; else { bks[m].v += St.spendOf(e); bks[m].n++; break; } } }
  const W = Math.max(240, box.clientWidth), H = 170, padB = 20, padT = 16, n = bks.length, slot = W / n, bw = Math.max(2, Math.min(36, slot * .7));
  const max = Math.max(...bks.map(b => b.v), 1), nz = bks.filter(b => b.v > 0);
  const avg = nz.length ? bks.reduce((s, b) => s + b.v, 0) / (bks[0].unit === "day" ? Math.max(1, bks.filter(b => b.from <= today()).length) : n) : 0;
  const every = n <= 12 ? 1 : n <= 31 ? (W < 380 ? 5 : 3) : Math.ceil(n / 8), y = (v) => padT + (H - padB - padT) * (1 - v / max);
  let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending chart">`;
  bks.forEach((b, i) => {
    const x = i * slot + (slot - bw) / 2, h = b.v ? Math.max(2, H - padB - y(b.v)) : 2;
    s += `<rect class="${!b.v ? "b0" : `b${b.v === max ? " max" : ""}${IN.sel === i ? " sel" : ""}`}" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 3).toFixed(1)}"/>`;
    s += `<rect data-bar="${i}" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent" style="cursor:pointer"/>`;
    if (i % every === 0) s += `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  if (avg > 0 && nz.length > 1) s += `<line class="avg" x1="0" x2="${W}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}"/>`;
  box.innerHTML = s + `<text x="${W - 2}" y="11" text-anchor="end">max ${compact(max)}</text></svg>`;
  const tip = $("chartTip"), b = bks[IN.sel];
  tip.innerHTML = b ? `<b>${esc(b.long)}</b>: ${money(b.v)} · ${plural(b.n, "expense")} · <button type="button" class="link" style="padding:0" data-open="${b.unit}:${b.from}">Open</button>`
    : avg > 0 && nz.length > 1 ? `Dashed line = average ${compact(avg)} per ${bks[0].unit}. Tap a bar for details.` : "Tap a bar for details.";
}
function insClick(ev) {
  const p = ev.target.closest("[data-p]")?.dataset.p; if (p) { IN.p = p; IN.sel = null; if (p !== "custom") IN.a = today(); spend(); return true; }
  const i = ev.target.closest("[data-i]")?.dataset.i; if (i) { inShift(i === "next" ? 1 : -1); return true; }
  const bar = ev.target.closest("[data-bar]")?.dataset.bar; if (bar != null) { IN.sel = +bar; drawChart(IN._b, IN._list); return true; }
  const o = ev.target.closest("[data-open]")?.dataset.open;
  if (o) { const [u, d] = o.split(":"); IN.p = u === "day" ? "day" : u === "month" ? "month" : "year"; IN.a = d; IN.sel = null; spend(); scrollTo(0, 0); return true; }
  return false;
}
export function insChange(ev) {
  if (ev.target.id === "inOffice") { IN.office = ev.target.checked; IN.sel = null; spend(); }
  if (ev.target.id === "inFrom" && ev.target.value) { IN.from = ev.target.value; IN.sel = null; spend(); }
  if (ev.target.id === "inTo" && ev.target.value) { IN.to = ev.target.value; IN.sel = null; spend(); }
}
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if (location.hash.startsWith("#/spend") && SP.mode !== "list") spend(); }, 150); });

// =============== CSV ===============
export function exportCsv(list, name = "expenses") {
  list = list.filter(Boolean);
  if (!list.length) return toast("Nothing to export");
  const rows = [["date", "merchant", "restaurant", "amount_inr", "your_share", "original_amount", "currency", "category", "paid_with", "description", "tags", "report", "office_or_reimbursable", "type", "distance_km", "split_with", "items", "tax_and_charges"],
    ...[...list].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, e.what, e.place || "", e.amount, St.spendOf(e), e.orig?.amt ?? "", e.orig?.cur || "INR", cat(e.cat).name, e.pay || "", e.note || "",
      (e.tags || []).join(", "), St.reportOf(e)?.name || "", St.isOffice(e) ? "yes" : "", e.type || "manual", e.distance?.km ?? "",
      e.split ? e.split.shares.filter(s => !s.me).map(s => `${s.name}: ${s.amt}`).join("; ") + (e.split.paidBy !== "me" ? ` (paid by ${e.split.paidBy})` : "") : "",
      (e.receipt?.items || []).map(i => `${i.n}${i.q ? " x" + i.q : ""}: ${i.p}`).join("; "), (e.receipt?.extras || []).map(i => `${i.n}: ${i.p}`).join("; ")])];
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = "\ufeff" + rows.map(r => r.map(cell).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast(`Exported ${plural(list.length, "expense")}`);
}

// =============== EXPENSE DETAIL ===============
export async function detail(id) {
  const e = St.get(id);
  if (!e || e.deleted) { $("view").innerHTML = top("Expense", { back: "#/spend" }) + `<div class="card empty"><b>Expense not found</b>It may have been deleted.<br><button class="btn secondary" data-go="#/spend" type="button">Back to Spend</button></div>`; return; }
  const c = cat(e.cat), dupes = St.duplicates(), dupOf = (dupes.get(e.id) || []).map(St.get).filter(Boolean), rep = St.reportOf(e), mine = St.spendOf(e);
  const flags = [];
  if (e.status === "scanning") flags.push(`<span class="pill">Scanning…</span>`);
  if (St.isOffice(e)) flags.push(`<span class="pill open">${e.reimb ? "Reimbursable" : "Office"} · not in your spending</span>`);
  if (rep) flags.push(`<span class="pill">${I.folder}${esc(rep.name)}</span>`);
  const tpl = e.recOf && St.get(e.recOf);
  if (tpl && !tpl.deleted && tpl.repeat) flags.push(`<button type="button" class="pill open" data-go="#/expense/${tpl.id}">${I.repeat}Repeats ${St.REPEATS[tpl.repeat.every].toLowerCase()}</button>`);
  (e.tags || []).forEach(t => flags.push(`<button type="button" class="pill" data-go="#/spend?tag=${encodeURIComponent(t)}">#${esc(t)}</button>`));
  const fr = (key, ic, label, val, ph) => `<button type="button" class="frow" data-edit="${key}">${ic}<span><small>${label}</small><b class="${val ? "" : "ph"}">${val || ph}</b></span><span class="chev">${I.right}</span></button>`;
  const items = e.receipt?.items || [], extras = e.receipt?.extras || [], base = e.split ? e.split.total : e.amount;
  const sub = r2(items.reduce((s, i) => s + i.p, 0)), tax = r2(extras.reduce((s, i) => s + i.p, 0)), gap = r2(base - sub - tax);
  const comments = [...(e.comments || [])].sort((a, b) => a.t - b.t);
  $("view").innerHTML = top(e.type === "distance" ? "Distance" : e.split ? "Split expense" : "Expense", { back: "#/spend",
    right: `<button class="icon-btn" type="button" data-d="menu" aria-label="More actions">${I.more}</button>` }) + `
    <section class="card"><div class="d-hero"><div class="cat-ico" style="background:${c.color}22">${c.emoji}</div>
      <div class="amt num">${e.status === "scanning" ? "…" : money(mine)}</div>
      <div class="sub">${esc(e.what || "Untitled")}${e.place ? ` · ${esc(e.place)}` : ""} · ${dMed(e.date)}</div>
      ${e.orig ? `<div class="sub">${moneyIn(e.orig.amt, e.orig.cur)} at ₹${+(+e.orig.rate).toFixed(4)} per ${esc(e.orig.cur)}</div>` : ""}
      ${e.split ? `<div class="sub">Your share of ${money(e.split.total)}</div>` : ""}
      ${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}</div></section>
    ${e.status === "review" || e.status === "failed" ? `<div class="note-box warn" style="margin-bottom:12px">${e.status === "review" ? `<b>Check the details read from your receipt.</b> Fix anything that's off, then confirm.` : `<b>We couldn't read this receipt.</b> Add the amount and merchant yourself.`}
      <div style="display:flex;gap:8px;margin-top:10px">${e.status === "review" ? `<button type="button" class="btn primary sm" data-d="ok">${I.check}Looks good</button>` : ""}<button type="button" class="btn secondary sm" data-edit="amount">Edit details</button></div></div>` : ""}
    ${dupOf.length ? `<div class="note-box warn" style="margin-bottom:12px"><b>Possible duplicate</b> of ${dupOf.map(d => `<a href="#/expense/${d.id}">${esc(d.what || "an expense")} · ${money(St.spendOf(d))} · ${dShort(d.date)}</a>`).join(", ")}
      <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn secondary sm" data-d="notdup">Not a duplicate</button><button type="button" class="btn danger sm" data-d="delete">Delete this one</button></div></div>` : ""}
    <div class="sec-h">Receipt</div>
    <div class="card" id="rcpt">${e.img ? `<img class="rimg" id="rImg" alt="Receipt photo" hidden><p class="muted small" id="rImgMsg" style="margin:0">Loading photo…</p>
      <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn secondary sm" data-d="photo">${I.camera}Replace</button><button type="button" class="btn secondary sm" data-d="rmphoto">${I.trash}Remove</button></div>`
      : `<button type="button" class="rimg-empty" data-d="photo">${I.camera}<span>Add a receipt photo</span></button>`}</div>
    <div class="sec-h">Details</div>
    <div class="card" style="padding:4px 14px"><div class="flist">
      ${fr("amount", I.wallet, e.split ? "Total bill" : "Amount", e.split ? money(e.split.total) : e.orig ? `${moneyIn(e.orig.amt, e.orig.cur)} (${money(e.amount)})` : money(e.amount), "Add amount")}
      ${fr("what", I.receipt, e.type === "distance" ? "Description" : "Merchant", esc(e.what), "Add merchant")}
      ${e.place ? fr("what", I.receipt, "Restaurant", esc(e.place), "") : ""}
      ${fr("date", I.cal, "Date", dLong(e.date), "")}
      ${fr("cat", I.tag, "Category", `${c.emoji} ${esc(c.name)}`, "")}
      ${e.split ? "" : fr("pay", I.wallet, "Paid with", esc(e.pay || ""), "Not set")}
      ${fr("note", I.note, "Description", esc(e.note || ""), "Add a description")}
      ${fr("tags", I.tag, "Tags", (e.tags || []).map(t => "#" + esc(t)).join(" "), "Add tags")}
      ${fr("report", I.folder, "Report", esc(rep?.name || ""), "Not on a report")}
      ${e.split || e.recOf ? "" : fr("repeat", I.repeat, "Repeats", e.repeat ? `${St.REPEATS[e.repeat.every]}${St.nextDue(e) ? ` · next ${dShort(St.nextDue(e))}` : ""}` : "", "Never")}
      ${e.type === "distance" && e.distance ? fr("amount", I.car, "Trip", `${esc(e.distance.from || "?")} → ${esc(e.distance.to || "?")} · ${+e.distance.km}${e.distance.round ? " × 2" : ""} km × ₹${+e.distance.rate}`, "") : ""}
      <label class="frow" style="cursor:pointer">${I.check}<span><small>Reimbursable</small><b>${e.reimb ? "Yes — not counted in your spending" : "No"}</b></span><span class="switch"><input type="checkbox" data-d="reimb" ${e.reimb ? "checked" : ""} aria-label="Reimbursable"><i></i></span></label>
    </div></div>
    ${e.split ? `<div class="sec-h">Split<button type="button" data-d="editsplit">Edit</button></div><div class="card"><ul class="plain">${e.split.shares.map(s => `<li><span>${s.me ? "You" : esc(s.name)}${(s.me ? "me" : s.name) === e.split.paidBy || (s.me && e.split.paidBy === "me") ? `<small>paid ${money(e.split.total)}</small>` : ""}</span><b>${money(s.amt)}</b></li>`).join("")}</ul></div>` : ""}
    <div class="sec-h">Itemised receipt<button type="button" data-d="items">${items.length || extras.length ? "Edit" : "Add items"}</button></div>
    <div class="card">${items.length || extras.length ? `${items.map(i => `<div class="ri"><span class="n">${esc(i.n)}${i.q ? `<small>× ${i.q}</small>` : ""}</span><span class="p">${money(i.p)}</span></div>`).join("")}
      ${extras.length ? `<div class="sec-h" style="margin:12px 0 2px">Tax &amp; charges</div>${extras.map(i => `<div class="ri"><span class="n">${esc(i.n)}</span><span class="p">${money(i.p)}</span></div>`).join("")}` : ""}
      <div class="totals"><div class="ri"><span>Items subtotal</span><span class="p">${money(sub)}</span></div><div class="ri"><span>Tax &amp; charges</span><span class="p">${money(tax)}</span></div>
      ${Math.abs(gap) >= .5 ? `<div class="ri gap"><span>${gap > 0 ? "Not itemised" : "More than the total by"}</span><span class="p">${money(Math.abs(gap))}</span></div>` : ""}
      <div class="ri grand"><span>Total</span><span class="p">${money(base)}</span></div></div>`
      : `<p class="muted small" style="margin:0">No items yet. Add what you bought, plus GST, delivery fees or discounts, to see the full breakdown.</p>`}</div>
    <div class="sec-h">Notes &amp; history</div>
    <div class="card"><div class="thread">${comments.length ? comments.map(m => `<div class="msg${m.sys ? " sys" : ""}"><span class="av${m.sys ? " sys" : ""}">${m.sys ? I.pen : esc((Api.user?.username || "Y")[0].toUpperCase())}</span><div><span class="tx">${esc(m.text)}</span><small>${timeAgo(m.t)}</small></div></div>`).join("")
      : `<p class="muted small" style="margin:0">Changes you make are recorded here. Add a note for anything worth remembering.</p>`}
      <div class="msg sys"><span class="av sys">${I.plus}</span><div><span class="tx">Created${e.type === "scan" ? " from a scanned receipt" : ""}</span><small>${e.created ? timeAgo(e.created) : ""}</small></div></div></div>
      <form class="composer" id="cmt"><input id="cmtIn" placeholder="Add a note…" autocomplete="off" aria-label="Add a note"><button class="btn primary" type="submit">Add</button></form></div>`;
  if (e.img) {
    const u = await imgUrl(e.id) || await St.getImage(e.id).then(b => b && imgUrl(e.id));
    if (!location.hash.includes(id)) return; // user moved on while the photo loaded
    const im = $("rImg"), msg = $("rImgMsg");
    if (im && u) { im.src = u; im.hidden = false; msg?.remove(); im.onclick = () => viewImage(u); }
    else if (msg) msg.textContent = Api.user ? "Photo is on another device and hasn't been backed up yet." : "Photo not found on this device.";
  }
}
export async function detailClick(ev, id) {
  const e = St.get(id); if (!e) return false;
  const ed = ev.target.closest("[data-edit]")?.dataset.edit;
  if (ed) { await editField(id, ed); return true; }
  return detailAction(ev, id, e);
}
async function editField(id, ed) {
  const e = St.get(id); if (!e) return;
  {
    if (e.split && ["amount", "what", "date"].includes(ed)) { openSplit({ id }); return true; }
    if (ed === "cat") { const v = await pickCategory({ value: e.cat }); if (v && v !== e.cat) { St.update(id, { cat: v }); St.learn(e.what, v); } return true; }
    if (ed === "pay") { const v = await pickList({ title: "Paid with", value: e.pay || "", options: [{ value: "", label: "Not set" }, ...PAYS.map(p => ({ value: p, label: p }))] }); if (v !== null) St.update(id, { pay: v || undefined }); return true; }
    if (ed === "repeat") {
      const v = await pickList({ title: "Repeats", value: e.repeat?.every || "", options: [{ value: "", label: "Never" }, { value: "week", label: "Every week" }, { value: "month", label: "Every month", sub: "Rent, subscriptions, fees" }, { value: "year", label: "Every year", sub: "Insurance, memberships" }] });
      if (v === null) return true;
      St.update(id, { repeat: v ? { ...(e.repeat || {}), every: v } : undefined }, { log: false });
      if (v) { const n = St.runRecurring(); toast(n ? `Repeats ${St.REPEATS[v].toLowerCase()} · added ${plural(n, "past entry", "past entries")}` : `Repeats ${St.REPEATS[v].toLowerCase()} — next on ${dShort(St.nextDue(St.get(id)))}`); }
      else toast("Stopped repeating — past entries are kept");
      return true;
    }
    if (ed === "report") {
      const rs = St.reports().filter(r => r.status !== "reimbursed" || r.id === e.reportId);
      const v = await pickList({ title: "Report", value: e.reportId || "", options: [{ value: "", label: "Not on a report" }, ...rs.map(r => ({ value: r.id, label: r.name })), { value: "__new", label: "+ New report" }] });
      if (v === null) return true;
      if (v === "__new") { const r = await newReport(); if (r) St.update(id, { reportId: r.id }); } else St.update(id, { reportId: v || undefined });
      return true;
    }
    if (ed === "note" || ed === "tags") {
      const { promptBox } = await import("./ui.js");
      const v = await promptBox({ title: ed === "note" ? "Description" : "Tags", label: ed === "tags" ? "Separate with commas" : "", value: ed === "note" ? e.note || "" : (e.tags || []).join(", "), placeholder: ed === "tags" ? "e.g. work, goa-trip" : "What was this for?" });
      if (v === null) return true;
      if (ed === "note") St.update(id, { note: v.trim() || undefined });
      else { const t = v.split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean); St.update(id, { tags: t.length ? t : undefined }, { log: false }); }
      return true;
    }
    openForm({ id, focus: ed }); return true;
  }
}
async function detailAction(ev, id, e) {
  const d = ev.target.closest("[data-d]")?.dataset.d; if (!d) return false;
  if (d === "ok") { St.update(id, { status: undefined }, { log: false }); toast("Confirmed"); }
  else if (d === "notdup") { const others = St.duplicates().get(id) || []; St.update(id, { notDup: [...new Set([...(e.notDup || []), ...others])] }, { log: false }); toast("Marked as not a duplicate"); }
  else if (d === "delete") { const copy = St.remove(id); go("#/spend"); toast("Expense deleted", () => St.restore(copy)); }
  else if (d === "photo") startScan({ attachTo: id });
  else if (d === "rmphoto") { if (await confirmBox({ title: "Remove the receipt photo?", ok: "Remove", danger: true })) { await St.detachImage(id); toast("Photo removed"); } }
  else if (d === "items") openItems(id);
  else if (d === "editsplit") openSplit({ id });
  else if (d === "menu") {
    const s = sheet({ title: "Expense", body: `<div class="menu">
      <button type="button" data-m="edit"><span class="mi">${I.pen}</span><span><b>Edit</b><small>Change any detail</small></span></button>
      ${e.split ? "" : `<button type="button" data-m="moneyin"><span class="mi">${I.arrowIn}</span><span><b>This was money in</b><small>Received, not spent — moves it out of spending</small></span></button>`}
      <button type="button" data-m="dup"><span class="mi">${I.copy}</span><span><b>Duplicate</b><small>Make a copy dated today</small></span></button>
      <button type="button" data-m="report"><span class="mi">${I.folder}</span><span><b>Move to report</b><small>${esc(St.reportOf(e)?.name || "Not on a report")}</small></span></button>
      <button type="button" data-m="del" class="danger"><span class="mi">${I.trash}</span><span><b>Delete</b><small>You can undo right after</small></span></button></div>` });
    s.body.addEventListener("click", (x) => {
      const m = x.target.closest("[data-m]")?.dataset.m; if (!m) return; s.close();
      import("./ui.js").then(({ whenSettled }) => whenSettled(() => {
        if (m === "edit") openForm({ id });
        else if (m === "dup") { const n = JSON.parse(JSON.stringify(e)); Object.assign(n, { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), date: today(), created: Date.now(), comments: [], status: undefined, img: undefined, imgV: undefined, notDup: [e.id] }); Object.keys(n).forEach(k => n[k] === undefined && delete n[k]); St.save(n); go(`#/expense/${n.id}`); toast("Duplicated"); }
        else if (m === "report") editField(id, "report");
        else if (m === "moneyin") import("./cats.js").then(({ incomeCatFor }) => { St.toIncome(id, incomeCatFor(`${e.what} ${e.note || ""}`, !!e.toPerson)); go("#/income"); toast("Moved to money in", () => St.toExpense(id)); });
        else if (m === "del") { const copy = St.remove(id); go("#/spend"); toast("Expense deleted", () => St.restore(copy)); }
      }));
    });
  }
  return true;
}
export function detailChange(ev, id) {
  if (ev.target.dataset.d === "reimb") St.update(id, { reimb: ev.target.checked || undefined }, { log: false });
}
export function detailSubmit(ev, id) {
  if (ev.target.id !== "cmt") return;
  ev.preventDefault();
  const v = $("cmtIn").value.trim(); if (!v) return;
  $("cmtIn").value = ""; $("cmtIn").blur();
  const e = St.get(id); St.update(id, { comments: [...(e.comments || []), { t: Date.now(), text: v }] }, { log: false });
}
