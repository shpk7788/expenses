// Money in: salary, someone paying you back, refunds… Kept apart from spending so it never inflates "spent".
import { $, esc, norm, r2, money, today, addDays, dMed, dShort, dayLabel, plural, MONTHS, I } from "./util.js";
import { INCATS, incat, incomeCatFor } from "./cats.js";
import * as St from "./store.js";
import { sheet, toast, go, confirmBox, autocomplete } from "./ui.js";
import { top } from "./views.js";

/** Add or edit money in */
export function openIncome({ id, date } = {}) {
  const ex = id ? St.get(id) : null;
  const e = ex ? JSON.parse(JSON.stringify(ex)) : St.newIncome({ date: date || today() });
  let catId = e.cat || "other", catTouched = !!ex;
  const s = sheet({ title: ex ? "Edit money in" : "Money received", cls: "form-sheet income-sheet", body: `
    <div class="field"><div class="amount-in in"><span class="in-sign" aria-hidden="true">+₹</span>
      <input id="iAmt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="${esc(e.amount || "")}" aria-label="Amount received" enterkeyhint="next"></div></div>
    <div class="field"><label for="iWhat" class="sr">From</label><div><input id="iWhat" value="${esc(e.what)}" placeholder="From? e.g. Salary, Rahul, Amazon refund" autocapitalize="words" enterkeyhint="done"></div></div>
    <div class="field"><span>Type</span><div class="cat-quick" id="iCat">${INCATS.map(c => `<button type="button" class="chip" data-icat="${c.id}" aria-pressed="${c.id === catId}">${c.emoji} ${esc(c.name)}</button>`).join("")}</div></div>
    <div class="field"><span>Date</span><div class="chips wrap" id="iDates"><button type="button" class="chip" data-day="0">Today</button><button type="button" class="chip" data-day="-1">Yesterday</button>
      <label class="chip date-chip" id="iDateChip">${I.cal}<span id="iDateLbl">Other date</span><input id="iDate" type="date" value="${esc(e.date)}" aria-label="Pick a date"></label></div></div>
    <div class="field"><span>Repeats</span><div class="chips wrap" id="iRepeat">${[["", "Never"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]].map(([v, l]) => `<button type="button" class="chip" data-rep="${v}" aria-pressed="${(e.repeat?.every || "") === v}">${l}</button>`).join("")}</div></div>
    <label class="field"><span>Note <span class="muted">(optional)</span></span><input id="iNote" value="${esc(e.note || "")}" placeholder="e.g. paid back for Goa trip" autocapitalize="sentences"></label>
    ${ex ? `<button type="button" class="link" id="iToExp" style="justify-self:start">${I.repeat}This was actually spending</button>` : ""}
    <p class="err" id="iErr"></p>`,
    foot: `${ex ? `<button type="button" class="btn danger icon" id="iDel" aria-label="Delete">${I.trash}</button>` : ""}<button type="button" class="btn primary in-btn" id="iSave">${ex ? "Save" : "Add money in"}</button>` });
  const q = (sel) => s.el.querySelector(sel), amt = q("#iAmt"), what = q("#iWhat");
  const drawCat = () => q("#iCat").querySelectorAll("[data-icat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.icat === catId));
  q("#iCat").onclick = (ev) => { const b = ev.target.closest("[data-icat]"); if (!b) return; catId = b.dataset.icat; catTouched = true; drawCat(); };
  what.addEventListener("input", () => { if (!catTouched) { const g = incomeCatFor(what.value); if (g !== "other" || catId !== "person") { catId = g; drawCat(); } } });
  const pastFrom = [...new Set(St.incomes().map(x => x.what).filter(Boolean))];
  autocomplete(what, (v) => [{ title: "Money in before", opts: pastFrom.filter(n => norm(n).includes(norm(v))).slice(0, 6).map(name => ({ name, sub: incat(St.incomes().find(x => x.what === name)?.cat).name })) }], () => {
    const prev = St.incomes().find(x => x.what === what.value); if (prev && !catTouched) { catId = prev.cat; drawCat(); }
    if (parseFloat(amt.value) > 0) q("#iSave").click(); else what.blur();
  });
  amt.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); what.focus(); } });
  const lbl = () => { if (!ex) { const a = parseFloat(amt.value); q("#iSave").textContent = a > 0 ? `Add +${money(a)}` : "Add money in"; } };
  amt.addEventListener("input", lbl);
  const drawDates = () => {
    const d = q("#iDate").value || today(), t = today(), y = addDays(t, -1);
    q("#iDates").querySelectorAll("[data-day]").forEach(b => b.setAttribute("aria-pressed", (b.dataset.day === "0" ? t : y) === d));
    const other = d !== t && d !== y; q("#iDateChip").setAttribute("aria-pressed", other); q("#iDateLbl").textContent = other ? dMed(d) : "Other date";
  };
  q("#iDates").addEventListener("click", (ev) => { const b = ev.target.closest("[data-day]"); if (!b) return; q("#iDate").value = addDays(today(), +b.dataset.day); drawDates(); });
  q("#iDate").addEventListener("change", drawDates); drawDates();
  q("#iRepeat").onclick = (ev) => { const b = ev.target.closest("[data-rep]"); if (!b) return; q("#iRepeat").querySelectorAll("[data-rep]").forEach(x => x.setAttribute("aria-pressed", x === b)); };
  q("#iSave").onclick = () => {
    const a = parseFloat(amt.value), w = what.value.trim();
    if (!(a > 0)) { q("#iErr").textContent = "Enter the amount you received."; amt.focus(); return; }
    if (!w) { q("#iErr").textContent = "Add who or what it was from."; what.focus(); return; }
    const rep = q('[data-rep][aria-pressed="true"]')?.dataset.rep;
    const n = { ...e, amount: r2(a), what: w, cat: catId, date: q("#iDate").value || today(), note: q("#iNote").value.trim() || undefined, repeat: rep ? { ...(e.repeat || {}), every: rep } : undefined };
    Object.keys(n).forEach(k => n[k] === undefined && delete n[k]);
    St.save(n);
    if (n.repeat) St.runRecurring();
    navigator.vibrate?.(8);
    toast(ex ? "Saved" : `Added +${money(n.amount)} money in`);
    s.close();
  };
  q("#iDel")?.addEventListener("click", async () => {
    if (!await confirmBox({ title: "Delete this?", text: "You can undo right after.", ok: "Delete", danger: true })) return;
    const copy = St.remove(ex.id); s.close(); toast("Deleted", () => St.restore(copy));
  });
  q("#iToExp")?.addEventListener("click", () => { St.toExpense(ex.id); s.close(); toast("Moved to spending", () => St.toIncome(ex.id, ex.cat)); });
  setTimeout(() => amt.focus(), 60);
}

// ---------- #/income ----------
let checkShown = false;
const misreads = () => St.expenses().filter(e => e.src && !e.inChecked && /\bbank\b/i.test(e.what || "") && /\d{3,4}\s*$/.test(e.what || "") && /gpay|upi-app|phonepe|paytm/.test(e.src.from || ""));
/** Older imports read "Received from X … Paid to HDFC Bank 1234" as a payment to your own bank — let the person move them */
function checkMisread() {
  const list = misreads(); if (!list.length) return;
  const sel = new Set(list.map(e => e.id));
  const s = sheet({ title: "Money you received?", sub: "An older import counted these as spending. Untick any you really paid.", body: `<ul class="rows chk-list">${list.map(e => `<li class="erow sel" data-mid="${e.id}" role="checkbox" aria-checked="true" tabindex="0"><span class="ck">${I.check}</span><div class="mid"><b>${esc(e.what)}</b><small><span>${dayLabel(e.date)}</span></small></div><div class="end"><span class="amt">${money(e.amount)}</span></div></li>`).join("")}</ul>`,
    foot: `<button type="button" class="btn secondary" id="mKeep">All were spending</button><button type="button" class="btn primary" id="mMove">Move ${list.length}</button>` });
  const upd = () => { s.el.querySelector("#mMove").textContent = `Move ${sel.size}`; s.el.querySelector("#mMove").disabled = !sel.size; };
  s.body.addEventListener("click", (ev) => { const li = ev.target.closest("[data-mid]"); if (!li) return; const id = li.dataset.mid; sel.has(id) ? sel.delete(id) : sel.add(id); li.classList.toggle("sel", sel.has(id)); li.setAttribute("aria-checked", sel.has(id)); upd(); });
  s.el.querySelector("#mMove").onclick = () => {
    list.forEach(e => sel.has(e.id) ? St.toIncome(e.id, "other") : St.update(e.id, { inChecked: true }, { log: false }));
    s.close(); toast(`Moved ${plural(sel.size, "payment")} to money in`);
  };
  s.el.querySelector("#mKeep").onclick = () => { St.saveMany(list.map(e => ({ ...e, inChecked: true }))); s.close(); toast("Kept as spending"); };
}
export function incomeView(params) {
  if (params?.get("check") && !checkShown) { checkShown = true; setTimeout(checkMisread, 50); }
  if (!params?.get("check")) checkShown = false;
  const list = St.incomes().sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const m = today().slice(0, 7);
  const inM = list.filter(e => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0);
  const outM = St.expenses().filter(e => e.date.startsWith(m)).reduce((s, e) => s + St.mine(e), 0);
  const left = inM - outM;
  let html = "", curM = "", rows = [];
  const flush = () => { if (!rows.length) return; const [y, mo] = curM.split("-"); html += `<div class="mhead"><b>${MONTHS[+mo - 1]} ${y}</b><span>+${money(rows.reduce((s, e) => s + e.amount, 0))}</span></div><ul class="rows card in-rows">${rows.map(row).join("")}</ul>`; rows = []; };
  for (const e of list) { if (e.date.slice(0, 7) !== curM) { flush(); curM = e.date.slice(0, 7); } rows.push(e); }
  flush();
  $("view").innerHTML = top("Money in", { back: "#/home", right: `<button type="button" class="icon-btn bordered" data-in="add" aria-label="Add money received">${I.plus}</button>` }) + (list.length ? `
    <div class="sec-h" style="margin-top:4px">${MONTHS[new Date().getMonth()]} so far</div>
    <section class="card in-sum">
      <div><small>Received</small><b class="num">+${money(inM)}</b></div>
      <div><small>Spent</small><b class="num">${money(outM)}</b></div>
      <div><small>${left >= 0 ? "Left over" : "Short by"}</small><b class="num ${left >= 0 ? "good" : "bad"}">${money(Math.abs(left))}</b></div>
    </section>${html}`
    : `<div class="empty"><b>No money in yet</b><p>Add your salary, someone paying you back or a refund — Palli shows what's left after spending.</p><button type="button" class="btn primary" data-in="add">${I.plus}Add money received</button></div>`);
}
const row = (e) => { const c = incat(e.cat); return `<li class="erow in-row" data-in-id="${e.id}"><div class="cat-ico" style="background:${c.color}22">${c.emoji}</div>
  <div class="mid"><b>${esc(e.what)}</b><small>${(e.repeat || e.recOf) ? I.repeat : ""}<span>${esc(c.name)} · ${dayLabel(e.date)}${e.note ? ` · ${esc(e.note)}` : ""}</span></small></div>
  <div class="end"><span class="amt in-amt">+${money(e.amount)}</span></div></li>`; };
export function incomeClick(ev) {
  if (ev.target.closest('[data-in="add"]')) { openIncome(); return true; }
  const r = ev.target.closest("[data-in-id]"); if (r) { openIncome({ id: r.dataset.inId }); return true; }
  return false;
}
