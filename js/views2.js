// Reports, Splits, Account, Sign-in.
import { $, esc, norm, r2, money, moneyBig, today, dMed, dShort, dLong, plural, timeAgo, I, LS } from "./util.js";
import { CATS, cat, CURRENCIES, CUR_NAMES } from "./cats.js";
import * as St from "./store.js";
import { Api } from "./api.js";
import { sheet, toast, go, confirmBox, promptBox, pickList, groupedHtml, hydrateThumbs, rowHtml } from "./ui.js";
import { newReport, openSplit, openSettle, openCreate } from "./create.js";
import { top, exportCsv, editBudget } from "./views.js";
import { imgUrl } from "./media.js";

const STATUS = { open: "Open", submitted: "Submitted", reimbursed: "Reimbursed" };
const pill = (s) => `<span class="pill ${s}">${STATUS[s] || s}</span>`;

// =============== REPORTS ===============
let repFilter = "all";
export function reports() {
  const rs = St.reports(), shown = rs.filter(r => repFilter === "all" || r.status === repFilter);
  const unrep = St.expenses().filter(e => !e.reportId).length;
  $("view").innerHTML = top("Reports", { right: `<button class="btn primary sm" type="button" data-r="new">${I.plus}New</button>` }) + `
    <div class="seg" role="tablist" style="margin-bottom:12px">${[["all", "All"], ["open", "Open"], ["submitted", "Submitted"], ["reimbursed", "Reimbursed"]].map(([k, l]) => `<button type="button" role="tab" data-rf="${k}" aria-selected="${repFilter === k}">${l}</button>`).join("")}</div>
    ${shown.length ? `<div class="card" style="padding:0">${shown.map(r => {
      const ex = St.inReport(r.id), tot = ex.reduce((s, e) => s + e.amount, 0), claim = St.claimOf(r);
      const dates = ex.map(e => e.date).sort();
      return `<button type="button" class="rcard" data-go="#/report/${r.id}"><span class="ri-ico">${I.folder}</span>
        <span style="min-width:0"><b>${esc(r.name)}</b><small>${pill(r.status)}<span>${plural(ex.length, "expense")}${dates.length ? ` · ${dShort(dates[0])}${dates.length > 1 && dates.at(-1) !== dates[0] ? ` – ${dShort(dates.at(-1))}` : ""}` : ""}</span></small></span>
        <span class="end">${money(tot)}${claim && claim !== tot ? `<small style="display:block;font-weight:400" class="muted">${money(claim)} to claim</small>` : ""}</span></button>`; }).join("")}</div>`
      : `<div class="card empty"><b>${rs.length ? "No reports here" : "No reports yet"}</b>${rs.length ? "Try another filter." : "Group expenses into a report — a trip, a project, or things your office will pay back. Export it as a PDF or CSV."}<br>${rs.length ? "" : `<button class="btn primary" type="button" data-r="new">${I.plus}Create a report</button>`}</div>`}
    ${unrep ? `<p class="muted small" style="text-align:center">${plural(unrep, "expense")} not on any report. <a href="#/spend">Select some in Spend</a> to add them.</p>` : ""}`;
}
export function reportsClick(ev) {
  const rf = ev.target.closest("[data-rf]")?.dataset.rf; if (rf) { repFilter = rf; reports(); return true; }
  if (ev.target.closest("[data-r=new]")) { newReport().then(r => r && go(`#/report/${r.id}`)); return true; }
  return false;
}

export function report(id) {
  const r = St.get(id);
  if (!r || r.deleted) { $("view").innerHTML = top("Report", { back: "#/reports" }) + `<div class="card empty"><b>Report not found</b><br><button class="btn secondary" data-go="#/reports" type="button">All reports</button></div>`; return; }
  const ex = St.inReport(id).sort((a, b) => b.date.localeCompare(a.date)), tot = ex.reduce((s, e) => s + e.amount, 0), claim = St.claimOf(r);
  const dates = ex.map(e => e.date).sort(), next = { open: ["submitted", "Mark as submitted"], submitted: ["reimbursed", "Mark as reimbursed"], reimbursed: ["open", "Reopen"] }[r.status];
  const byCat = {}; ex.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
  $("view").innerHTML = top(r.name, { back: "#/reports", right: `<button class="icon-btn" type="button" data-rp="menu" aria-label="Report actions">${I.more}</button>` }) + `
    <section class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><div class="muted small">Total</div><div class="num" style="font-size:1.9rem;font-weight:750;line-height:1.15">${moneyBig(tot)}</div>
      <div class="muted small" style="margin-top:2px">${plural(ex.length, "expense")}${dates.length ? ` · ${dMed(dates[0])}${dates.at(-1) !== dates[0] ? ` – ${dMed(dates.at(-1))}` : ""}` : ""}</div></div>${pill(r.status)}</div>
      <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="kpi"><span>To claim</span><b>${money(claim)}</b></div><div class="kpi"><span>${r.status === "reimbursed" ? "Reimbursed on" : r.status === "submitted" ? "Submitted on" : "Created"}</span><b>${dMed(new Date(r.statusAt || r.created).toISOString().slice(0, 10))}</b></div></div>
      ${r.note ? `<p class="muted small" style="margin:12px 0 0">${esc(r.note)}</p>` : ""}
      <label class="inline-row" style="margin-top:14px"><span>Office / reimbursable<small>${r.business !== false ? "Not counted in your personal spending" : "Counted in your personal spending"}</small></span><span class="switch"><input type="checkbox" id="repBiz" ${r.business !== false ? "checked" : ""}><i></i></span></label>
      <button type="button" class="btn primary block sm" style="margin-top:14px" data-rp="status">${next[1]}</button>
      <div class="rep-actions"><button type="button" class="btn secondary sm" data-rp="add">${I.plus}Add</button><button type="button" class="btn secondary sm" data-rp="pdf">${I.download}PDF</button><button type="button" class="btn secondary sm" data-rp="csv">${I.download}CSV</button></div></section>
    ${ex.length && Object.keys(byCat).length > 1 ? `<div class="card"><h3>By category</h3><ul class="plain">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<li><span>${cat(c).emoji} ${esc(cat(c).name)}</span><b>${money(v)}</b></li>`).join("")}</ul></div>` : ""}
    ${ex.length ? groupedHtml(ex, { full: true }) : `<div class="card empty"><b>No expenses yet</b>Scan a receipt, type one in, or move in expenses you've already added.<br><button class="btn primary" type="button" data-rp="add">${I.plus}Add expense</button></div>`}`;
  hydrateThumbs($("view"));
}
export async function reportClick(ev, id) {
  const a = ev.target.closest("[data-rp]")?.dataset.rp; if (!a) return false;
  const r = St.get(id); if (!r) return true;
  if (a === "status") { const next = { open: "submitted", submitted: "reimbursed", reimbursed: "open" }[r.status]; St.save({ ...r, status: next, statusAt: Date.now() }); toast(`Marked as ${STATUS[next].toLowerCase()}`); }
  else if (a === "add") openCreate({ reportId: id, pickExisting: () => pickExpenses(id) });
  else if (a === "csv") exportCsv(St.inReport(id), r.name);
  else if (a === "pdf") printReport(id);
  else if (a === "menu") {
    const s = sheet({ title: r.name, body: `<div class="menu">
      <button type="button" data-m="rename"><span class="mi">${I.pen}</span><span><b>Rename</b></span></button>
      <button type="button" data-m="note"><span class="mi">${I.note}</span><span><b>${r.note ? "Edit description" : "Add description"}</b></span></button>
      <button type="button" data-m="del" class="danger"><span class="mi">${I.trash}</span><span><b>Delete report</b><small>Expenses stay — they're just removed from the report</small></span></button></div>` });
    s.body.addEventListener("click", async (x) => {
      const m = x.target.closest("[data-m]")?.dataset.m; if (!m) return; s.close();
      const { whenSettled } = await import("./ui.js");
      whenSettled(async () => {
        if (m === "rename") { const v = await promptBox({ title: "Rename report", value: r.name }); if (v && v.trim()) St.save({ ...St.get(id), name: v.trim() }); }
        if (m === "note") { const v = await promptBox({ title: "Description", value: r.note || "", placeholder: "e.g. Claim from finance by month end" }); if (v !== null) { const n = { ...St.get(id), note: v.trim() }; if (!n.note) delete n.note; St.save(n); } }
        if (m === "del") { if (!await confirmBox({ title: `Delete “${r.name}”?`, text: "The expenses stay in Spend.", ok: "Delete", danger: true })) return; const copy = St.remove(id); const ids = St.expenses().filter(e => e.reportId === id).map(e => e.id); go("#/reports"); toast("Report deleted", () => St.restore(copy)); }
      });
    });
  }
  return true;
}
function pickExpenses(rid) {
  const r = St.get(rid), list = St.expenses().sort((a, b) => (b.reportId === rid) - (a.reportId === rid) || (!!a.reportId - !!b.reportId) || b.date.localeCompare(a.date));
  const sel = new Set(list.filter(e => e.reportId === rid).map(e => e.id));
  const s = sheet({ title: `Expenses in “${r.name}”`, sub: "Tick the ones that belong on this report", body: list.length ? `<div class="searchbar" style="margin:0">${I.search}<input type="search" id="pkQ" placeholder="Search your expenses"></div><div class="selecting"><ul class="rows" id="pkL" style="padding:0">${list.map(e => rowHtml(e, { selected: sel, showDate: true }).replace("<small>", e.reportId && e.reportId !== rid && St.get(e.reportId) ? `<small><span class="pill">On ${esc(St.get(e.reportId).name)}</span>` : "<small>")).join("")}</ul></div>` : `<p class="muted">You haven't added any expenses yet. Close this and use Scan or New expense.</p>`,
    foot: `<button type="button" class="btn primary" id="pkOk">Save · ${sel.size} selected</button>` });
  hydrateThumbs(s.body);
  s.el.querySelector("#pkQ")?.addEventListener("input", (ev) => { const q = ev.target.value.toLowerCase(); s.body.querySelectorAll("#pkL .erow").forEach(li => li.hidden = q && !li.textContent.toLowerCase().includes(q)); });
  s.body.addEventListener("click", (e) => { const row = e.target.closest(".erow[data-id]"); if (!row) return; const id = row.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); row.classList.toggle("sel"); s.el.querySelector("#pkOk").textContent = `Save · ${sel.size} selected`; });
  s.el.querySelector("#pkOk").onclick = () => {
    let n = 0;
    list.forEach(e => { const want = sel.has(e.id); if (want !== (e.reportId === rid)) { St.update(e.id, { reportId: want ? rid : undefined }); n++; } });
    s.close(); if (n) toast("Report updated");
  };
}
async function printReport(id) {
  const r = St.get(id), ex = St.inReport(id).sort((a, b) => a.date.localeCompare(b.date)), tot = ex.reduce((s, e) => s + e.amount, 0), claim = ex.filter(e => e.reimb).reduce((s, e) => s + e.amount, 0);
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to export the PDF");
  const imgs = {}; for (const e of ex) if (e.img) { const b = await St.getImage(e.id); if (b) imgs[e.id] = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); }
  const who = Api.user?.username || St.prefs().name || "";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.name)} — expense report</title><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:28px}h1{font-size:22px;margin:0 0 4px}.m{color:#555;margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}td.r,th.r{text-align:right;white-space:nowrap}tfoot td{font-weight:700;border-bottom:0}.sm{color:#666;font-size:11px}.rc{page-break-inside:avoid;margin:18px 0}.rc img{max-width:100%;max-height:520px;border:1px solid #ddd}@media print{.np{display:none}body{margin:12mm}}</style></head><body>
  <button class="np" onclick="print()" style="float:right;padding:8px 14px;font:inherit">Print / Save as PDF</button>
  <h1>${esc(r.name)}</h1><p class="m">${who ? `${esc(who)} · ` : ""}${STATUS[r.status]} · ${ex.length} expenses · generated ${dMed(today())}${r.note ? `<br>${esc(r.note)}` : ""}</p>
  <table><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Description</th><th class="r">Amount</th><th class="r">Reimb.</th></tr></thead><tbody>
  ${ex.map(e => `<tr><td>${dMed(e.date)}</td><td>${esc(e.what)}${e.place ? `<div class="sm">${esc(e.place)}</div>` : ""}${e.orig ? `<div class="sm">${esc(e.orig.cur)} ${e.orig.amt} @ ${(+e.orig.rate).toFixed(2)}</div>` : ""}</td><td>${esc(cat(e.cat).name)}</td><td>${esc(e.note || "")}${e.receipt?.items?.length ? `<div class="sm">${e.receipt.items.map(i => esc(i.n)).join(", ")}</div>` : ""}</td><td class="r">${money(e.amount)}</td><td class="r">${e.reimb ? "Yes" : ""}</td></tr>`).join("")}
  </tbody><tfoot><tr><td colspan="4">Total</td><td class="r">${money(tot)}</td><td></td></tr><tr><td colspan="4">Reimbursable</td><td class="r">${money(claim)}</td><td></td></tr></tfoot></table>
  ${Object.keys(imgs).length ? `<h2 style="font-size:16px;margin-top:28px">Receipts</h2>${ex.filter(e => imgs[e.id]).map(e => `<div class="rc"><div class="sm">${dMed(e.date)} · ${esc(e.what)} · ${money(e.amount)}</div><img src="${imgs[e.id]}"></div>`).join("")}` : ""}
  <script>setTimeout(()=>print(),400)<\/script></body></html>`);
  w.document.close();
}

// =============== SPLITS ===============
export function splits() {
  const bals = St.balances(), owed = bals.filter(b => b.v > 0).reduce((s, b) => s + b.v, 0), owe = bals.filter(b => b.v < 0).reduce((s, b) => s - b.v, 0);
  const acts = [...St.expenses().filter(e => e.split).map(e => ({ t: e.date, c: e.created, html: rowHtml(e, { showDate: true }) })),
    ...St.settles().map(s => ({ t: s.date, c: s.created, html: `<li class="erow" data-settle="${s.id}"><div class="cat-ico" style="background:var(--good-soft);color:var(--good)">${I.check}</div><div class="mid"><b>${s.dir === "in" ? `${esc(s.with)} paid you` : `You paid ${esc(s.with)}`}</b><small><span>Settlement · ${dShort(s.date)}</span></small></div><div class="end"><span class="amt">${money(s.amount)}</span></div></li>` }))]
    .sort((a, b) => b.t.localeCompare(a.t) || (b.c || 0) - (a.c || 0));
  $("view").innerHTML = top("Splits", { back: "#/home", right: `<button class="btn primary sm" type="button" data-s="new">${I.plus}Split</button>` }) + `
    <section class="card"><div class="row2"><div><div class="muted small">You're owed</div><div class="num bal-pos" style="font-size:1.5rem;font-weight:750">${money(owed)}</div></div>
      <div><div class="muted small">You owe</div><div class="num bal-neg" style="font-size:1.5rem;font-weight:750">${money(owe)}</div></div></div></section>
    ${bals.length ? `<div class="sec-h">Balances</div><div class="card" style="padding:0">${bals.map(b => `<div class="rcard" style="cursor:default"><span class="ri-ico" style="font-weight:700">${esc(b.name[0].toUpperCase())}</span>
      <span style="min-width:0"><b>${esc(b.name)}</b><small>${b.v > 0 ? "owes you" : "you owe"}</small></span><span class="end" style="display:flex;align-items:center;gap:10px"><span class="${b.v > 0 ? "bal-pos" : "bal-neg"}">${money(Math.abs(b.v))}</span>
      <button type="button" class="btn secondary sm" data-settle-with="${esc(b.name)}" data-v="${b.v}">Settle</button></span></div>`).join("")}</div>`
      : `<div class="card empty"><b>All settled up</b>Split a bill to track who owes whom.<br><button class="btn primary" type="button" data-s="new">${I.split}Split a bill</button></div>`}
    ${acts.length ? `<div class="sec-h">Activity</div><div class="group"><ul class="rows">${acts.map(a => a.html).join("")}</ul></div>` : ""}`;
}
export async function splitsClick(ev) {
  if (ev.target.closest("[data-s=new]")) { openSplit(); return true; }
  const b = ev.target.closest("[data-settle-with]"); if (b) { openSettle(b.dataset.settleWith, +b.dataset.v); return true; }
  const st = ev.target.closest("[data-settle]");
  if (st) { const s = St.get(st.dataset.settle); if (s && await confirmBox({ title: "Delete this settlement?", text: `${s.dir === "in" ? `${s.with} paid you` : `You paid ${s.with}`} ${money(s.amount)}`, ok: "Delete", danger: true })) { const c = St.remove(s.id); toast("Settlement deleted", () => St.restore(c)); } return true; }
  return false;
}

// =============== ACCOUNT ===============
export function account() {
  const u = Api.user, P = St.prefs(), S = St.S;
  const syncTxt = !u ? "" : S.state === "busy" ? "Syncing…" : S.state === "err" || S.state === "offline" ? (S.err || "Couldn't sync — will retry") : S.lastSynced ? `Synced ${timeAgo(S.lastSynced)}` : "Not synced yet";
  const row = (k, ic, label, val, sub = "") => `<button type="button" class="set-row" data-set="${k}">${ic}<span>${label}${sub ? `<small>${sub}</small>` : ""}</span><span class="val"><span>${val}</span>${I.right}</span></button>`;
  const rules = Object.keys(P.rules || {}).length;
  $("view").innerHTML = top("Account") + `
    <section class="card"><div style="display:flex;gap:14px;align-items:center">
      <span class="logo" style="width:52px;height:52px;border-radius:50%;font-size:1.3rem">${u ? esc(u.username[0].toUpperCase()) : I.user2}</span>
      <div style="min-width:0;flex:1"><b style="font-size:1.15rem;display:block;overflow:hidden;text-overflow:ellipsis">${u ? esc(u.username) : "Not signed in"}</b>
      <span class="muted small">${u ? esc(syncTxt) : "Expenses are saved on this device only"}</span></div>
      ${u ? `<button type="button" class="icon-btn bordered" data-set="sync" aria-label="Sync now" title="Sync now">${I.sync}</button>` : ""}</div>
      ${!u && Api.configured ? `<button type="button" class="btn primary block" style="margin-top:14px" data-set="signin">Sign in or create an account</button><p class="muted small" style="margin:8px 0 0;text-align:center">Back up your expenses and use them on every device.</p>` : ""}
    </section>
    ${S.noBucket ? `<div class="note-box warn" style="margin-bottom:12px"><b>Receipt photos aren't backing up yet.</b> Your expenses sync fine, but photos stay on this device until receipt storage is set up in Supabase (run the storage part of <code>supabase/schema.sql</code>).</div>` : ""}
    <div class="sec-h">Preferences</div>
    <div class="card" style="padding:2px 14px"><div class="set-list">
      ${row("budget", I.wallet, "Monthly budget", P.budget ? "₹" + P.budget.toLocaleString("en-IN") : "Not set")}
      ${row("currency", I.globe, "Default currency", esc(P.currency), "Converted to ₹ automatically")}
      ${row("upi", I.upi, "Your UPI ID", esc(P.upi || "Not set"), "For split payment requests")}
      ${row("name", I.user2, "Your name", esc(P.name || (u?.username ?? "Not set")), "On UPI requests and PDFs")}
      ${row("rates", I.car, "Distance rates", `₹${P.rates.car} · ₹${P.rates.bike}`, "Car · two-wheeler, per km")}
      ${row("theme", I.sun, "Appearance", { system: "Automatic", light: "Light", dark: "Dark" }[P.theme] || "Automatic")}
      ${row("rules", I.tag, "Learned categories", rules ? plural(rules, "merchant") : "None", "Your category choices")}
    </div></div>
    <div class="sec-h">Your data</div>
    <div class="card" style="padding:2px 14px"><div class="set-list">
      ${row("splits", I.split, "Splits & balances", "")}
      ${row("export", I.download, "Export to CSV", "", plural(St.expenses().length, "expense"))}
      ${row("import", I.upload, "Import from CSV", "", "Adds rows, skips duplicates")}
      ${u ? `<button type="button" class="set-row danger" data-set="logout">${I.logout}<span>Sign out</span><span></span></button>` : ""}
    </div></div>
    <p class="ver">Expenses · v6.2</p>`;
}
export async function accountClick(ev) {
  const k = ev.target.closest("[data-set]")?.dataset.set; if (!k) return false;
  const P = St.prefs();
  if (k === "sync") { await St.syncNow(); toast(St.S.state === "ok" ? "Synced" : St.S.err || "Couldn't sync"); }
  else if (k === "signin") { LS.del("exp:guestMode"); window.dispatchEvent(new Event("app:auth")); }
  else if (k === "budget") editBudget();
  else if (k === "currency") { const v = await pickList({ title: "Default currency", value: P.currency, search: true, options: CURRENCIES.map(c => ({ value: c, label: c, sub: CUR_NAMES[c] })) }); if (v) St.setPrefs({ currency: v }); }
  else if (k === "upi") { const v = await promptBox({ title: "Your UPI ID", label: "e.g. name@okaxis", value: P.upi, placeholder: "yourname@bank" }); if (v !== null) { if (v.trim() && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(v.trim())) toast("That doesn't look like a UPI ID (name@bank)"); else St.setPrefs({ upi: v.trim() }); } }
  else if (k === "name") { const v = await promptBox({ title: "Your name", value: P.name || Api.user?.username || "" }); if (v !== null) St.setPrefs({ name: v.trim() }); }
  else if (k === "rates") {
    const s = sheet({ title: "Distance rates", sub: "Rupees per kilometre", body: `<div class="row2"><label class="field"><span>Car</span><div class="money"><input id="rCar" type="number" inputmode="decimal" step="0.5" min="0" value="${P.rates.car}"></div></label><label class="field"><span>Two-wheeler</span><div class="money"><input id="rBike" type="number" inputmode="decimal" step="0.5" min="0" value="${P.rates.bike}"></div></label></div>`,
      foot: `<button type="button" class="btn primary" id="rOk">Save</button>` });
    s.el.querySelector("#rOk").onclick = () => { St.setPrefs({ rates: { car: parseFloat(s.el.querySelector("#rCar").value) || 0, bike: parseFloat(s.el.querySelector("#rBike").value) || 0 } }); s.close(); toast("Rates saved"); };
  }
  else if (k === "theme") { const v = await pickList({ title: "Appearance", value: P.theme, options: [{ value: "system", label: "Automatic", sub: "Match your phone" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] }); if (v) St.setPrefs({ theme: v }); }
  else if (k === "rules") {
    if (!Object.keys(P.rules).length) return toast("When you change a merchant's category, it's remembered here"), true;
    if (await confirmBox({ title: "Forget learned categories?", text: `${plural(Object.keys(P.rules).length, "merchant")} will go back to automatic categories.`, ok: "Forget", danger: true })) { St.setPrefs({ rules: {} }); toast("Forgotten"); }
  }
  else if (k === "splits") go("#/splits");
  else if (k === "export") exportCsv(St.expenses(), "expenses");
  else if (k === "import") importCsv();
  else if (k === "logout") {
    if (St.S.dirty.size) await St.syncNow();
    if (St.S.dirty.size && !await confirmBox({ title: "Some changes haven't synced", text: `${plural(St.S.dirty.size, "change")} will be lost on this device. Sign out anyway?`, ok: "Sign out", danger: true })) return true;
    if (!St.S.dirty.size && !await confirmBox({ title: "Sign out?", text: "Your expenses stay safe in your account.", ok: "Sign out" })) return true;
    const { Img } = await import("./media.js");
    for (const e of St.S.items) if (e.img) await Img.del(e.id);
    St.wipeSpace(St.ns()); await Api.signOut(); LS.del("exp:guestMode");
    St.switchSpace(); window.dispatchEvent(new Event("app:auth")); toast("Signed out");
  }
  return true;
}
function importCsv() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".csv,text/csv";
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    const rows = parseCSV((await file.text()).replace(/^﻿/, "")), head = (rows[0] || []).map(h => h.trim().toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
    const ci = { date: col("date"), what: col("merchant", "what"), amount: col("amount_inr", "amount"), place: col("restaurant"), cat: col("category"), pay: col("paid_with"), note: col("description", "note"), tags: col("tags"), reimb: col("reimbursable"), items: col("items", "receipt_items"), tax: col("tax_and_charges") };
    if (ci.date < 0 || ci.what < 0 || ci.amount < 0) return toast("CSV needs date, merchant (or what) and amount columns");
    const catBy = Object.fromEntries(CATS.map(c => [c.name.toLowerCase(), c.id]));
    const list = (s) => (s || "").split(";").map(x => x.trim()).filter(Boolean).map(x => { const m = /^(.*?)(?:\s+x(\d+))?:\s*(-?[\d.]+)$/.exec(x); if (!m) return null; const o = { n: m[1], p: parseFloat(m[3]) }; if (m[2]) o.q = +m[2]; return o; }).filter(Boolean);
    const seen = new Set(St.expenses().map(e => `${e.date}|${norm(e.what)}|${e.amount}`)); let n = 0;
    for (const r of rows.slice(1)) {
      let date = (r[ci.date] || "").trim(); const m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(date); if (m) date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      const what = (r[ci.what] || "").trim(), amt = parseFloat(String(r[ci.amount] || "").replace(/[₹,\s]/g, ""));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !what || !(amt > 0)) continue;
      const k = `${date}|${norm(what)}|${r2(amt)}`; if (seen.has(k)) continue; seen.add(k);
      const e = St.newExpense({ date, what, amount: r2(amt), cat: (ci.cat >= 0 && catBy[(r[ci.cat] || "").toLowerCase()]) || (await import("./cats.js")).catFor(what, St.prefs().rules) });
      if (ci.place >= 0 && r[ci.place]) e.place = r[ci.place];
      if (ci.pay >= 0 && r[ci.pay]) e.pay = r[ci.pay];
      if (ci.note >= 0 && r[ci.note]) e.note = r[ci.note];
      if (ci.tags >= 0 && r[ci.tags]) e.tags = r[ci.tags].split(/[\s,]+/).filter(Boolean);
      if (ci.reimb >= 0 && /^y/i.test(r[ci.reimb] || "")) e.reimb = true;
      const li = ci.items >= 0 ? list(r[ci.items]) : [], tx = ci.tax >= 0 ? list(r[ci.tax]) : [];
      if (li.length || tx.length) e.receipt = { items: li, extras: tx };
      St.save(e); n++;
    }
    toast(`Imported ${plural(n, "expense")}`);
  };
  inp.click();
}
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

// =============== SIGN IN ===============
let authMode = "signin";
export function authScreen() {
  const el = $("auth");
  const signup = authMode === "signup";
  el.innerHTML = `<div class="auth-card">
    <div class="brand"><span class="logo">₹</span><div><h1>Expenses</h1><p>Scan receipts. Track spending. Split bills.</p></div></div>
    <div class="card" style="margin:0;padding:20px">
      <h2 style="font-size:1.2rem;margin-bottom:14px">${signup ? "Create your account" : "Sign in"}</h2>
      <form id="authForm" novalidate>
        <label class="field"><span>Username</span><input id="aUser" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. bobby" required></label>
        <label class="field"><span>Password</span><input id="aPass" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "At least 6 characters" : "Your password"}" required></label>
        <p class="err" id="aErr" role="alert"></p>
        <button type="submit" class="btn primary block" id="aGo">${signup ? "Create account" : "Sign in"}</button>
      </form>
    </div>
    <p class="alt">${signup ? "Already have an account?" : "New here?"} <button type="button" data-mode="${signup ? "signin" : "signup"}">${signup ? "Sign in" : "Create an account"}</button></p>
    ${signup ? `<ul class="perks"><li>${I.check}<span>Your expenses on every device — just sign in with the same username.</span></li><li>${I.check}<span>Only you can see your data.</span></li><li>${I.check}<span>Free. No email needed.</span></li></ul>` : ""}
    <p class="alt"><button type="button" data-mode="guest" style="color:var(--muted);font-weight:500">Continue without an account</button></p>
  </div>`;
  el.querySelector("#authForm").addEventListener("submit", doAuth);
  el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    if (b.dataset.mode === "guest") { LS.set("exp:guestMode", true); window.dispatchEvent(new Event("app:auth")); return; }
    authMode = b.dataset.mode; authScreen(); $("aUser").focus();
  });
}
async function doAuth(ev) {
  ev.preventDefault();
  const user = $("aUser").value.trim(), pass = $("aPass").value, btn = $("aGo"), err = $("aErr");
  if (!user || !pass) { err.textContent = "Enter your username and password."; (!user ? $("aUser") : $("aPass")).focus(); return; }
  btn.disabled = true; btn.textContent = "Please wait…"; err.textContent = "";
  try {
    const guest = St.guestCount();
    authMode === "signup" ? await Api.signUp(user, pass) : await Api.signIn(user, pass);
    St.switchSpace();
    try { await Api.loadMeta(); } catch {}
    St.applyTheme();
    LS.del("exp:guestMode");
    window.dispatchEvent(new CustomEvent("app:auth", { detail: { guest } }));
    St.syncNow();
  } catch (e) {
    err.textContent = e.message; btn.disabled = false; btn.textContent = authMode === "signup" ? "Create account" : "Sign in"; $("aPass").select();
  }
}

export function reportChange(ev, id) {
  if (ev.target.id !== "repBiz") return;
  const r = St.get(id); if (!r) return;
  St.save({ ...r, business: ev.target.checked });
  toast(ev.target.checked ? "Not counted in your spending anymore" : "Now counted in your spending");
}
