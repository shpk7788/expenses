// Creating & editing: + menu, expense form (manual/distance/edit), scanning, splits.
import { $, esc, norm, r2, uuid, money, moneyIn, today, addDays, dMed, I, plural } from "./util.js";
import { CATS, cat, catFor, PAYS, CURRENCIES, CUR_NAMES, AUTO_FX, isDelivery, rankStores, FOOD_PLACE } from "./cats.js";
import * as St from "./store.js";
import { sheet, toast, autocomplete, pickList, pickCategory, go, confirmBox, promptBox, whenSettled } from "./ui.js";
import { Api } from "./api.js";
import { compress, fxRate } from "./media.js";

// ---------- + menu ----------
export function openCreate(ctx = {}) {
  const rep = ctx.reportId && St.get(ctx.reportId);
  const s = sheet({ title: rep ? `Add to “${rep.name}”` : "Create", body: `<div class="menu">
    <button type="button" data-a="scan"><span class="mi">${I.scan}</span><span><b>Scan receipts</b><small>Snap one or more — details fill in automatically</small></span></button>
    <button type="button" data-a="manual"><span class="mi">${I.pen}</span><span><b>Manual expense</b><small>Type in the amount and merchant</small></span></button>
    <button type="button" data-a="distance"><span class="mi">${I.car}</span><span><b>Distance</b><small>Kilometres × your rate per km</small></span></button>
    <button type="button" data-a="split"><span class="mi">${I.split}</span><span><b>Split with friends</b><small>Track who owes whom</small></span></button>
    ${rep ? "" : `<button type="button" data-a="import"><span class="mi">${I.upload}</span><span><b>Import statement or SMS</b><small>Bank, Google Pay or PhonePe — sorted for you</small></span></button>`}
    ${rep ? `<button type="button" data-a="existing"><span class="mi">${I.folder}</span><span><b>Pick expenses you've already added</b><small>Move them into this report</small></span></button>`
      : `<button type="button" data-a="report"><span class="mi">${I.folder}</span><span><b>New report</b><small>Group expenses, e.g. office or a trip</small></span></button>`}
  </div>` });
  s.el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
    if (a === "scan") { startScan(ctx); s.close(); return; } // file picker must open within the tap (iOS)
    s.close();
    whenSettled(() => {
      if (a === "scan") startScan(ctx);
      else if (a === "manual") openForm({ date: ctx.date, reportId: ctx.reportId });
      else if (a === "distance") openForm({ type: "distance", date: ctx.date, reportId: ctx.reportId });
      else if (a === "split") openSplit({ date: ctx.date, reportId: ctx.reportId });
      else if (a === "existing") ctx.pickExisting?.();
      else if (a === "import") go("#/import");
      else if (a === "report") newReport().then(r => r && go(`#/report/${r.id}`));
    });
  });
}

export function newReport() {
  return new Promise(res => {
    let out = null;
    const s = sheet({ title: "New report", center: true, body: `
      <label class="field"><span>Report name</span><input id="nrName" placeholder="e.g. Office expenses, Goa trip" autocapitalize="sentences"></label>
      <label class="inline-row"><span>Office / reimbursable<small>Expenses on this report won't count in your personal spending</small></span><span class="switch"><input type="checkbox" id="nrBiz" checked><i></i></span></label>`,
      foot: `<button class="btn secondary" data-x>Cancel</button><button class="btn primary" id="nrOk">Create</button>`, onClose: () => res(out) });
    const name = s.el.querySelector("#nrName"); setTimeout(() => name.focus(), 50);
    const go_ = () => {
      const n = name.value.trim(); if (!n) { name.focus(); return; }
      out = St.save({ id: uuid(), kind: "report", name: n, status: "open", business: s.el.querySelector("#nrBiz").checked, created: Date.now() });
      toast(`Report “${n}” created`); s.close();
    };
    s.el.querySelector("#nrOk").onclick = go_;
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go_(); } });
  });
}
/** Most-used categories (for one-tap chips) */
function topCats(n = 5) {
  const c = {}; St.expenses().forEach(e => c[e.cat] = (c[e.cat] || 0) + 1);
  const ids = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter(k => k !== "other");
  for (const d of ["food", "groceries", "transport", "shopping", "bills", "fuel"]) if (ids.length < n && !ids.includes(d)) ids.push(d);
  return ids.slice(0, n);
}

// ---------- merchant suggestions ----------
function historySource(field) {
  return (q) => {
    const nq = norm(q), counts = new Map();
    St.expenses().forEach(e => { const v = e[field]; if (!v) return; const k = norm(v), c = counts.get(k); counts.set(k, { name: c?.name || v, n: (c?.n || 0) + 1 }); });
    const out = [...counts.entries()].filter(([k]) => k.includes(nq)).sort((a, b) => (b[0].startsWith(nq) - a[0].startsWith(nq)) || b[1].n - a[1].n)
      .slice(0, 4).map(([, v]) => ({ name: v.name, sub: v.n > 1 ? `${v.n}×` : "" }));
    return { out, taken: new Set(counts.keys()) };
  };
}
const whatSource = (q) => { const h = historySource("what")(q); return [{ title: "Your history", opts: h.out }, { title: "Stores", opts: rankStores(q, { exclude: h.taken }) }]; };
const placeSource = (q) => { const h = historySource("place")(q); return [{ title: "Your restaurants", opts: h.out }, { title: "Restaurants", opts: rankStores(q, { filter: s => FOOD_PLACE.has(s.label), exclude: h.taken }) }]; };
const friends = () => { const set = new Map(); St.expenses().forEach(e => e.split?.shares.forEach(s => { if (!s.me) set.set(norm(s.name), s.name); })); St.settles().forEach(s => set.set(norm(s.with), s.with)); return [...set.values()]; };

// ---------- expense form (create + edit) ----------
export function openForm({ id, type = "manual", date, focus, reportId } = {}) {
  const ex = id ? St.get(id) : null;
  if (ex?.split) return openSplit({ id });
  const P = St.prefs();
  const e = ex ? JSON.parse(JSON.stringify(ex)) : St.newExpense({ type, date: date || today(), reportId, pay: localStorage.getItem("exp:lastPay") || undefined });
  if (!e.reportId) delete e.reportId;
  if (!e.pay) delete e.pay;
  const isDist = e.type === "distance";
  let cur = e.orig?.cur || (ex ? "INR" : P.currency || "INR"), rate = e.orig?.rate || null, catTouched = !!ex, catId = e.cat || "other";
  const dist = e.distance || { from: "", to: "", km: "", vehicle: "car", rate: P.rates.car };
  const reportsOpen = St.reports().filter(r => r.status !== "reimbursed" || r.id === e.reportId);
  const title = ex ? (isDist ? "Edit distance" : "Edit expense") : isDist ? "Distance" : "Manual expense";
  const amtVal = e.orig ? e.orig.amt : (e.amount || "");

  const s = sheet({ title, body: `
    ${isDist ? `
      <div class="row2"><label class="field"><span>From</span><input id="dFrom" value="${esc(dist.from)}" placeholder="e.g. Home"></label>
      <label class="field"><span>To</span><input id="dTo" value="${esc(dist.to)}" placeholder="e.g. Office"></label></div>
      <div class="row3"><label class="field"><span>Distance (km)</span><input id="dKm" type="number" inputmode="decimal" step="0.1" min="0" value="${esc(dist.km)}" placeholder="0"></label>
      <label class="field"><span>Vehicle</span><select id="dVeh"><option value="car">Car</option><option value="bike">Two-wheeler</option><option value="custom">Custom</option></select></label>
      <label class="field"><span>₹ per km</span><input id="dRate" type="number" inputmode="decimal" step="0.5" min="0" value="${esc(dist.rate)}"></label></div>
      <label class="inline-row"><span>Round trip<small>Doubles the distance</small></span><span class="switch"><input type="checkbox" id="dRound" ${dist.round ? "checked" : ""}><i></i></span></label>` : ""}
    <div class="field"><div class="amount-in"><button type="button" class="cur-btn" id="fCur">${esc(cur)}${I.down}</button>
      <input id="fAmt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="${esc(amtVal)}" aria-label="Amount" enterkeyhint="next"></div>
      <div class="conv" id="fConv" hidden></div></div>
    <div class="field"><label for="fWhat" class="sr">${isDist ? "Description" : "Merchant"}</label><div><input id="fWhat" value="${esc(e.what)}" placeholder="${isDist ? "What was the trip for?" : "Where? e.g. Swiggy, DMart, Rent"}" autocapitalize="words" enterkeyhint="done"></div></div>
    <div class="field" id="fPlaceF" hidden><label for="fPlace">Which restaurant?</label><div><input id="fPlace" value="${esc(e.place || "")}" placeholder="e.g. Meghana Foods" autocapitalize="words"></div></div>
    <div class="field"><span>Category</span><div class="cat-quick" id="fCat"></div></div>
    <div class="field"><span>Date</span><div class="chips wrap" id="fDates"><button type="button" class="chip" data-day="0">Today</button><button type="button" class="chip" data-day="-1">Yesterday</button>
      <label class="chip date-chip" id="fDateChip">${I.cal}<span id="fDateLbl">Other date</span><input id="fDate" type="date" value="${esc(e.date)}" aria-label="Pick a date"></label></div></div>
    <button type="button" class="more-toggle" id="fMore" aria-expanded="false"><span>More details</span><small id="fMoreSum"></small>${I.down}</button>
    <div id="fMoreBox" class="more-box" hidden>
    <div class="field"><span>Paid with</span><div class="chips wrap" id="fPay">${PAYS.map(p => `<button type="button" class="chip" data-pay="${esc(p)}" aria-pressed="${e.pay === p}">${esc(p)}</button>`).join("")}</div></div>
    ${e.split ? "" : `<div class="field"><span>Repeats</span><div class="chips wrap" id="fRepeat">${[["", "Never"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]].map(([v, l]) => `<button type="button" class="chip" data-rep="${v}" aria-pressed="${(e.repeat?.every || "") === v}">${l}</button>`).join("")}</div></div>`}
    <label class="field"><span>Description <span class="muted">(optional)</span></span><input id="fNote" value="${esc(e.note || "")}" placeholder="e.g. dinner with Arjun" autocapitalize="sentences"></label>
    <label class="field"><span>Tags <span class="muted">(optional, comma separated)</span></span><input id="fTags" value="${esc((e.tags || []).join(", "))}" placeholder="e.g. work, goa-trip" autocapitalize="none"></label>
    <label class="field"><span>Report</span><select id="fRep"><option value="">None</option>${reportsOpen.map(r => `<option value="${r.id}" ${r.id === e.reportId ? "selected" : ""}>${esc(r.name)}</option>`).join("")}<option value="__new">+ New report…</option></select></label>
    <label class="inline-row"><span>Reimbursable<small>Someone pays you back — not counted in your spending</small></span><span class="switch"><input type="checkbox" id="fReimb" ${e.reimb ? "checked" : ""}><i></i></span></label>
    </div>
    <p class="err" id="fErr"></p>`,
    foot: `${ex ? `<button type="button" class="btn danger icon" id="fDel" aria-label="Delete">${I.trash}</button>` : ""}<button type="button" class="btn primary" id="fSave">${ex ? "Save" : "Add expense"}</button>` , cls: "form-sheet" });
  const $$ = (sel) => s.el.querySelector(sel);
  const amt = $$("#fAmt"), what = $$("#fWhat"), place = $$("#fPlace");

  const quick = topCats();
  const drawCat = () => {
    const ids = quick.includes(catId) ? quick : [catId, ...quick.slice(0, 4)];
    $$("#fCat").innerHTML = ids.map(id => { const c = cat(id); return `<button type="button" class="chip" data-cat="${id}" aria-pressed="${id === catId}">${c.emoji} ${esc(c.name)}</button>`; }).join("")
      + `<button type="button" class="chip" data-cat="__all">More…</button>`;
  };
  const syncPlace = () => { $$("#fPlaceF").hidden = !isDelivery(what.value); };
  const autoCat = () => { if (!catTouched) { catId = what.value.trim() ? catFor(what.value, St.prefs().rules) : (isDist ? "transport" : "other"); drawCat(); } };
  if (!ex && isDist) catId = "transport";
  drawCat(); syncPlace();

  // fast entry: Enter on amount → merchant; picking/Enter on merchant → done (or restaurant)
  autocomplete(what, whatSource, (picked) => { syncPlace(); autoCat(); if (isDelivery(what.value) && !place.value) place.focus(); else if (!picked && parseFloat(amt.value) > 0) $$("#fSave").click(); else what.blur(); });
  autocomplete(place, placeSource, (picked) => { if (!picked && parseFloat(amt.value) > 0) $$("#fSave").click(); else place.blur(); });
  amt.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); what.focus(); } });
  // date chips
  const drawDates = () => {
    const d = $$("#fDate").value || today(), t = today(), y = addDays(t, -1);
    $$("#fDates").querySelectorAll("[data-day]").forEach(b => b.setAttribute("aria-pressed", (b.dataset.day === "0" ? t : y) === d));
    const other = d !== t && d !== y; $$("#fDateChip").setAttribute("aria-pressed", other); $$("#fDateLbl").textContent = other ? dMed(d) : "Other date";
  };
  $$("#fDates").addEventListener("click", (ev) => { const b = ev.target.closest("[data-day]"); if (!b) return; $$("#fDate").value = addDays(today(), +b.dataset.day); $$("#fDate").dispatchEvent(new Event("change")); });
  $$("#fDate").addEventListener("change", drawDates); drawDates();
  // more details
  const moreSum = () => { const bits = [s.el.querySelector('[data-pay][aria-pressed="true"]')?.dataset.pay, { week: "weekly", month: "monthly", year: "yearly" }[s.el.querySelector('[data-rep][aria-pressed="true"]')?.dataset.rep], $$("#fNote").value && "note", $$("#fTags").value && "tags", $$("#fRep").value && $$("#fRep").value !== "__new" && $$("#fRep").selectedOptions[0]?.text, $$("#fReimb").checked && "reimbursable"].filter(Boolean); $$("#fMoreSum").textContent = bits.join(" · "); };
  const setMore = (open) => { $$("#fMoreBox").hidden = !open; $$("#fMore").setAttribute("aria-expanded", open); };
  $$("#fMore").onclick = () => setMore($$("#fMoreBox").hidden);
  s.body.addEventListener("change", moreSum); s.body.addEventListener("click", (ev) => { if (ev.target.closest("[data-pay]")) setTimeout(moreSum); });
  moreSum(); if (ex && (e.note || e.tags?.length || e.reportId || e.reimb)) setMore(true);
  const saveLbl = () => { if (!ex) { const a = parseFloat(amt.value); $$("#fSave").textContent = a > 0 && cur === "INR" ? `Add ${money(a)}` : "Add expense"; } };
  amt.addEventListener("input", saveLbl); saveLbl();
  what.addEventListener("input", () => { syncPlace(); autoCat(); });
  $$("#fCat").onclick = async (ev) => {
    const b = ev.target.closest("[data-cat]"); if (!b) return;
    const v = b.dataset.cat === "__all" ? await pickCategory({ value: catId }) : b.dataset.cat;
    if (v) { catId = v; catTouched = true; drawCat(); }
  };
  $$("#fPay").onclick = (ev) => { const b = ev.target.closest("[data-pay]"); if (!b) return; const on = b.getAttribute("aria-pressed") !== "true"; s.el.querySelectorAll("[data-pay]").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", on); };
  const rp = $$("#fRepeat"); if (rp) rp.onclick = (ev) => { const b = ev.target.closest("[data-rep]"); if (!b) return; rp.querySelectorAll("[data-rep]").forEach(x => x.setAttribute("aria-pressed", x === b)); moreSum(); };
  $$("#fRep").onchange = async (ev) => {
    if (ev.target.value !== "__new") return;
    const r = await newReport();
    const sel = $$("#fRep");
    if (r) { sel.add(new Option(r.name, r.id), sel.options[sel.options.length - 1]); sel.value = r.id; }
    else sel.value = e.reportId || "";
  };

  // currency
  const conv = $$("#fConv");
  const drawConv = async (fetchRate) => {
    if (cur === "INR") { conv.hidden = true; return; }
    conv.hidden = false;
    if (fetchRate || !rate) {
      conv.innerHTML = `<span>Getting the ${esc(cur)} → ₹ rate…</span>`;
      const r = AUTO_FX.has(cur) ? await fxRate(cur, $$("#fDate").value || today()) : null;
      if (r) rate = r;
    }
    const a = parseFloat(amt.value) || 0;
    conv.innerHTML = `<span>≈ <b>${money(a * (rate || 0))}</b> at</span><input id="fRate" type="number" inputmode="decimal" step="0.0001" min="0" value="${rate ? +(+rate).toFixed(4) : ""}" placeholder="rate" aria-label="Exchange rate to rupees"><span>₹ per ${esc(cur)}${!rate ? " — enter the rate" : ""}</span>`;
    $$("#fRate").oninput = (ev) => { rate = parseFloat(ev.target.value) || null; conv.querySelector("b").textContent = money((parseFloat(amt.value) || 0) * (rate || 0)); };
  };
  amt.addEventListener("input", () => { const b = conv.querySelector("b"); if (b) b.textContent = money((parseFloat(amt.value) || 0) * (rate || 0)); });
  $$("#fDate").addEventListener("change", () => { if (cur !== "INR" && AUTO_FX.has(cur)) drawConv(true); });
  $$("#fCur").onclick = async () => {
    const v = await pickList({ title: "Currency", value: cur, search: true, options: CURRENCIES.map(c => ({ value: c, label: c, sub: CUR_NAMES[c] + (c !== "INR" && !AUTO_FX.has(c) ? " · enter rate yourself" : "") })) });
    if (v && v !== cur) { cur = v; rate = null; $$("#fCur").innerHTML = `${esc(cur)}${I.down}`; drawConv(true); }
  };
  if (cur !== "INR") drawConv(false);

  // distance
  if (isDist) {
    $$("#dVeh").value = dist.vehicle || "car";
    const recalc = () => {
      let km = parseFloat($$("#dKm").value) || 0; if ($$("#dRound").checked) km *= 2;
      const r = parseFloat($$("#dRate").value) || 0;
      amt.value = km && r ? r2(km * r) : "";
    };
    $$("#dVeh").onchange = () => { const v = $$("#dVeh").value; if (v !== "custom") $$("#dRate").value = St.prefs().rates[v]; recalc(); };
    ["#dKm", "#dRate"].forEach(sel => $$(sel).addEventListener("input", recalc)); $$("#dRound").onchange = recalc;
    $$("#dRate").addEventListener("input", () => { $$("#dVeh").value = "custom"; });
  }

  const err = (m) => { $$("#fErr").textContent = m; };
  $$("#fSave").onclick = () => {
    const a = parseFloat(amt.value), w = what.value.trim();
    if (!(a > 0)) { err("Enter an amount."); amt.focus(); s.el.querySelector(".amount-in").classList.remove("shake"); void amt.offsetWidth; s.el.querySelector(".amount-in").classList.add("shake"); return; }
    if (!w && !isDist) { err("Add a merchant or what it was for."); what.focus(); return; }
    if (cur !== "INR" && !(rate > 0)) { err(`Enter the ${cur} → ₹ exchange rate.`); $$("#fRate")?.focus(); return; }
    navigator.vibrate?.(8);
    const payBtn = s.el.querySelector('[data-pay][aria-pressed="true"]');
    const tags = $$("#fTags").value.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
    const patch = {
      amount: cur === "INR" ? r2(a) : r2(a * rate), orig: cur === "INR" ? undefined : { amt: r2(a), cur, rate: +rate },
      what: w || (isDist ? `${$$("#dFrom").value.trim() || "Trip"}${$$("#dTo").value.trim() ? " → " + $$("#dTo").value.trim() : ""}` : ""),
      place: isDelivery(w) ? place.value.trim() || undefined : undefined,
      date: $$("#fDate").value || today(), cat: catId, pay: payBtn?.dataset.pay || undefined,
      note: $$("#fNote").value.trim() || undefined, tags: tags.length ? tags : undefined,
      reportId: $$("#fRep").value && $$("#fRep").value !== "__new" ? $$("#fRep").value : undefined,
      reimb: $$("#fReimb").checked || undefined,
    };
    const rep = s.el.querySelector('[data-rep][aria-pressed="true"]')?.dataset.rep;
    if (!e.split && !e.recOf) patch.repeat = rep ? { ...(e.repeat || {}), every: rep } : undefined;
    if (isDist) patch.distance = { from: $$("#dFrom").value.trim(), to: $$("#dTo").value.trim(), km: parseFloat($$("#dKm").value) || 0, vehicle: $$("#dVeh").value, rate: parseFloat($$("#dRate").value) || 0, round: $$("#dRound").checked || undefined };
    if (ex && ex.status && patch.amount) patch.status = undefined; // reviewed
    if (catTouched) St.learn(patch.what, catId);
    if (payBtn) localStorage.setItem("exp:lastPay", payBtn.dataset.pay);
    if (ex) { St.update(ex.id, patch); toast("Saved"); }
    else { const n = { ...e, ...patch }; Object.keys(n).forEach(k => n[k] === undefined && delete n[k]); St.save(n); toast(n.repeat ? `Added · repeats ${St.REPEATS[n.repeat.every].toLowerCase()}` : "Expense added"); }
    if (patch.repeat) St.runRecurring();
    s.close();
  };
  $$("#fDel")?.addEventListener("click", async () => {
    if (!await confirmBox({ title: "Delete this expense?", text: "You can undo this right after.", ok: "Delete", danger: true })) return;
    const copy = St.remove(ex.id); s.close(); toast("Expense deleted", () => St.restore(copy));
    if (location.hash.startsWith("#/expense/")) go("#/spend");
  });
  setTimeout(() => { (focus === "what" ? what : focus === "date" ? $$("#fDate") : focus ? amt : (ex ? amt : isDist ? $$("#dKm") : amt)).focus(); }, 60);
}

// ---------- scanning (non-blocking, queue) ----------
let scanInput = null;
export function startScan(ctx = {}) {
  if (!scanInput) {
    scanInput = document.createElement("input"); scanInput.type = "file"; scanInput.accept = "image/*"; scanInput.multiple = true; scanInput.hidden = true;
    document.body.appendChild(scanInput);
  }
  scanInput.onchange = async () => {
    const files = [...scanInput.files]; scanInput.value = ""; if (!files.length) return;
    if (ctx.attachTo) { await attachPhoto(ctx.attachTo, files[0]); return; }
    for (const f of files) await scanFile(f, ctx);
    toast(files.length > 1 ? `Scanning ${files.length} receipts — they'll fill in shortly` : "Scanning receipt — it'll fill in shortly");
  };
  scanInput.click();
}
async function scanFile(file, ctx) {
  const e = St.save(St.newExpense({ type: "scan", status: "scanning", date: ctx.date || today(), what: "", amount: 0, cat: "other", reportId: ctx.reportId }));
  try { const { blob } = await compress(file); await St.attachImage(e.id, blob); queue.push({ id: e.id, blob, mode: "new" }); }
  catch { St.update(e.id, { status: "failed" }, { log: false }); }
  runQueue();
}
export async function attachPhoto(id, file) {
  const { blob } = await compress(file);
  await St.attachImage(id, blob);
  toast("Receipt photo added");
  const e = St.get(id);
  if (!e?.receipt?.items?.length) { queue.push({ id, blob, mode: "items" }); runQueue(); }
}
const queue = []; let running = false, tessP = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return tessP ||= new Promise((ok, fail) => {
    const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    sc.onload = ok; sc.onerror = () => { tessP = null; sc.remove(); fail(new Error("offline")); };
    document.head.appendChild(sc);
  });
}
async function ocrPrep(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) { let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; v = Math.max(0, Math.min(255, (v - 128) * 1.5 + 128)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(px, 0, 0); return c;
}
async function runQueue() {
  if (running) return; running = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await loadTesseract();
      const { data } = await Tesseract.recognize(await ocrPrep(job.blob), "eng");
      const r = window.parseReceipt(data.text || "");
      const e = St.get(job.id); if (!e || e.deleted) continue;
      const receipt = (r.items.length || r.extras.length) ? { items: r.items, extras: r.extras } : undefined;
      if (job.mode === "items" || e.status !== "scanning") { if (receipt && !e.receipt?.items?.length) { St.update(e.id, { receipt }, { log: false }); if (job.mode === "items") toast(`Read ${plural(r.items.length, "item")} from the receipt`); } continue; }
      const patch = { status: r.amount ? "review" : "failed", receipt };
      if (r.store && !e.what) { patch.what = r.store; patch.cat = catFor(r.store, St.prefs().rules); }
      if (r.amount && !e.amount) patch.amount = r.amount;
      if (r.date) patch.date = r.date;
      St.update(e.id, patch, { log: false });
    } catch (err) {
      const e = St.get(job.id);
      if (e && e.status === "scanning") St.update(e.id, { status: "failed" }, { log: false });
      if (err.message === "offline") toast("Couldn't load the receipt reader — check your connection. Your photos are saved.");
    }
  }
  running = false;
}
// resume scans that were interrupted (app closed mid-scan)
export async function resumeScans() {
  const { Img } = await import("./media.js");
  for (const e of St.expenses().filter(x => x.status === "scanning")) {
    const b = await Img.get(e.id);
    if (b) queue.push({ id: e.id, blob: b, mode: "new" }); else St.update(e.id, { status: "failed" }, { log: false });
  }
  runQueue();
}

// ---------- receipt items editor ----------
export function openItems(id) {
  const e = St.get(id); if (!e) return;
  const list = e.receipt?.items || [], extras = e.receipt?.extras || [];
  const itemRow = (i) => `<div class="er"><input class="nm" placeholder="Item name" value="${esc(i.n)}" autocapitalize="sentences">
    <input class="q" type="number" inputmode="numeric" min="1" step="1" placeholder="1" value="${i.q ?? ""}" aria-label="Quantity">
    <div class="money"><input class="pr" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${i.p ?? ""}" aria-label="Price"></div>
    <button type="button" class="rm" data-rm aria-label="Remove">${I.x}</button></div>`;
  const taxRow = (i) => `<div class="er tax"><input class="nm" placeholder="e.g. GST, delivery fee, discount" value="${esc(i.n)}">
    <div class="money"><input class="pr" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${i.p ?? ""}" aria-label="Amount"></div>
    <button type="button" class="rm" data-rm aria-label="Remove">${I.x}</button></div>`;
  const total = e.split ? e.split.total : e.amount;
  const s = sheet({ title: "Itemised receipt", sub: e.what, body: `
    <div class="sec-h" style="margin:0">Items</div>
    <div class="er-head"><span>Item</span><span style="text-align:center">Qty</span><span>Price</span><span></span></div>
    <div id="erI">${(list.length ? list : [{ n: "", p: "" }]).map(itemRow).join("")}</div>
    <div><button type="button" class="link" data-add="i">${I.plus}Add item</button></div>
    <div class="sec-h" style="margin:4px 0 0">Tax &amp; charges</div>
    <div id="erT">${extras.map(taxRow).join("")}</div>
    <div><button type="button" class="link" data-add="t">${I.plus}Add tax, fee or discount</button></div>
    <div id="erTot"></div>`,
    foot: `<button type="button" class="btn secondary" data-x>Cancel</button><button type="button" class="btn primary" id="erSave">Save</button>` });
  const read = () => {
    const rows = (sel, tax) => [...s.el.querySelectorAll(`${sel} .er`)].map(r => {
      const n = r.querySelector(".nm").value.trim(), p = parseFloat(r.querySelector(".pr").value), q = tax ? 0 : parseInt(r.querySelector(".q").value, 10);
      if (!n && isNaN(p)) return null; const o = { n: n || (tax ? "Charge" : "Item"), p: r2(/discount/i.test(n) && p > 0 ? -p : (p || 0)) }; if (q > 1) o.q = q; return o;
    }).filter(Boolean);
    return { items: rows("#erI"), extras: rows("#erT", true) };
  };
  const draw = () => {
    const { items, extras } = read(), sub = r2(items.reduce((a, i) => a + i.p, 0)), tax = r2(extras.reduce((a, i) => a + i.p, 0)), calc = r2(sub + tax), gap = r2(total - calc);
    s.el.querySelector("#erTot").innerHTML = `<div class="totals"><div class="ri"><span>Items subtotal</span><span class="p">${money(sub)}</span></div>
      <div class="ri"><span>Tax &amp; charges</span><span class="p">${money(tax)}</span></div>
      ${Math.abs(gap) >= 0.5 && (items.length || extras.length) ? `<div class="ri gap"><span>${gap > 0 ? "Not itemised yet" : "More than the total by"}</span><span class="p">${money(Math.abs(gap))}</span></div>` : ""}
      <div class="ri grand"><span>Expense total</span><span class="p">${money(total)}</span></div></div>
      ${Math.abs(gap) >= 0.5 && (items.length || extras.length) && !e.split ? `<button type="button" class="fix" id="erUse">Change expense total to ${money(calc)}</button>` : ""}`;
    s.el.querySelector("#erUse")?.addEventListener("click", () => { useCalc = calc; s.el.querySelector("#erSave").click(); });
  };
  let useCalc = null;
  s.body.addEventListener("input", (ev) => { if (ev.target.matches(".pr, .nm")) draw(); });
  s.body.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-rm]")) { ev.target.closest(".er").remove(); draw(); }
    const add = ev.target.closest("[data-add]")?.dataset.add;
    if (add) { const box = s.el.querySelector(add === "i" ? "#erI" : "#erT"); box.insertAdjacentHTML("beforeend", add === "i" ? itemRow({ n: "", p: "" }) : taxRow({ n: "", p: "" })); box.lastElementChild.querySelector(".nm").focus(); }
  });
  s.el.querySelector("#erSave").onclick = () => {
    const r = read(), patch = { receipt: (r.items.length || r.extras.length) ? r : undefined };
    if (useCalc != null) patch.amount = useCalc;
    St.update(id, patch, { log: useCalc != null }); s.close(); toast("Receipt saved");
  };
  draw();
}

// ---------- splits ----------
export function openSplit({ id, date, reportId } = {}) {
  const ex = id ? St.get(id) : null;
  const sp = ex?.split || { total: "", paidBy: "me", method: "equal", shares: [{ me: true, name: "You", amt: 0 }, { name: "", amt: 0 }] };
  const known = friends();
  const s = sheet({ title: ex ? "Edit split" : "Split with friends", body: `
    <div class="field"><span>Total bill</span><div class="amount-in"><span class="cur-btn" style="cursor:default">INR</span><input id="sTot" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="${esc(sp.total)}" aria-label="Total bill"></div></div>
    <div class="field"><label for="sWhat">What for?</label><div><input id="sWhat" value="${esc(ex?.what || "")}" placeholder="e.g. Dinner at Toit, Goa villa" autocapitalize="words"></div></div>
    <div class="row2"><label class="field"><span>Date</span><input id="sDate" type="date" value="${esc(ex?.date || date || today())}"></label>
      <label class="field"><span>Paid by</span><select id="sPaid"></select></label></div>
    <div class="field"><span>Split</span><div class="seg" id="sMeth"><button type="button" data-m="equal">Equally</button><button type="button" data-m="exact">Exact amounts</button></div></div>
    <div class="field"><span>People</span><div id="sPeople" style="display:grid;gap:8px"></div>
      <div><button type="button" class="link" id="sAdd">${I.plus}Add person</button></div>
      ${known.length ? `<div class="chips wrap" id="sKnown">${known.map(n => `<button type="button" class="chip" data-n="${esc(n)}">${I.plus}${esc(n)}</button>`).join("")}</div>` : ""}</div>
    <div class="note-box" id="sSum"></div><p class="err" id="sErr"></p>`,
    foot: `${ex ? `<button type="button" class="btn danger icon" id="sDel" aria-label="Delete">${I.trash}</button>` : ""}<button type="button" class="btn primary" id="sSave">${ex ? "Save" : "Save split"}</button>` });
  const $$ = (q) => s.el.querySelector(q);
  let method = sp.method || "equal", people = sp.shares.map(x => ({ ...x }));
  const tot = () => parseFloat($$("#sTot").value) || 0;
  const drawPaid = () => {
    const names = people.filter(p => !p.me && p.name.trim()).map(p => p.name.trim()), cur = $$("#sPaid").value || sp.paidBy;
    $$("#sPaid").innerHTML = `<option value="me">You</option>${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}`;
    $$("#sPaid").value = names.includes(cur) || cur === "me" ? cur : "me";
  };
  const recalc = () => {
    if (method === "equal") { const n = people.length, each = n ? Math.floor(tot() / n * 100) / 100 : 0; people.forEach((p, i) => p.amt = i === 0 ? r2(tot() - each * (n - 1)) : each); }
    const sum = r2(people.reduce((a, p) => a + (+p.amt || 0), 0)), me = people.find(p => p.me)?.amt || 0, paid = $$("#sPaid").value;
    const owe = paid === "me" ? `You paid ${money(tot())}. Others owe you <b>${money(r2(tot() - me))}</b>.` : `${esc(paid)} paid. You owe ${esc(paid)} <b>${money(me)}</b>.`;
    $$("#sSum").innerHTML = `Your share: <b>${money(me)}</b> — this is what counts in your spending.<br>${owe}${method === "exact" && Math.abs(sum - tot()) >= 0.01 ? `<br><span style="color:var(--danger)">Shares add up to ${money(sum)}, not ${money(tot())}.</span>` : ""}`;
    s.el.querySelectorAll(".share-row").forEach((r, i) => { const inp = r.querySelector(".amt-in"); if (inp && method === "equal") inp.value = people[i].amt ? people[i].amt.toFixed(2) : ""; });
  };
  const drawPeople = () => {
    $$("#sPeople").innerHTML = people.map((p, i) => `<div class="share-row">${p.me ? `<span class="me">You</span>` : `<div><input class="nm-in" data-i="${i}" value="${esc(p.name)}" placeholder="Name" autocapitalize="words"></div>`}
      <div class="money"><input class="amt-in" data-i="${i}" type="number" inputmode="decimal" step="0.01" min="0" value="${p.amt ? (+p.amt).toFixed(2) : ""}" ${method === "equal" ? "readonly tabindex=-1" : ""} aria-label="Share"></div>
      ${p.me ? "<span></span>" : `<button type="button" class="rm" data-rm="${i}" aria-label="Remove">${I.x}</button>`}</div>`).join("");
    s.el.querySelectorAll(".seg [data-m]").forEach(b => b.setAttribute("aria-selected", b.dataset.m === method));
    drawPaid(); recalc();
  };
  $$("#sPeople").addEventListener("input", (ev) => {
    const i = +ev.target.dataset.i;
    if (ev.target.classList.contains("nm-in")) { people[i].name = ev.target.value; drawPaid(); recalc(); }
    if (ev.target.classList.contains("amt-in")) { people[i].amt = parseFloat(ev.target.value) || 0; recalc(); }
  });
  $$("#sPeople").addEventListener("click", (ev) => { const b = ev.target.closest("[data-rm]"); if (b) { people.splice(+b.dataset.rm, 1); drawPeople(); } });
  $$("#sAdd").onclick = () => { people.push({ name: "", amt: 0 }); drawPeople(); s.el.querySelectorAll(".nm-in")[s.el.querySelectorAll(".nm-in").length - 1]?.focus(); };
  $$("#sKnown")?.addEventListener("click", (ev) => { const b = ev.target.closest("[data-n]"); if (!b) return; if (people.some(p => norm(p.name) === norm(b.dataset.n))) return; const blank = people.find(p => !p.me && !p.name.trim()); blank ? blank.name = b.dataset.n : people.push({ name: b.dataset.n, amt: 0 }); drawPeople(); });
  $$("#sMeth").onclick = (ev) => { const b = ev.target.closest("[data-m]"); if (!b) return; method = b.dataset.m; drawPeople(); };
  $$("#sTot").addEventListener("input", recalc); $$("#sPaid").onchange = recalc;
  autocomplete($$("#sWhat"), whatSource);
  drawPeople(); $$("#sPaid").value = sp.paidBy; recalc();
  $$("#sSave").onclick = () => {
    const err = (m) => $$("#sErr").textContent = m, T = tot();
    if (!(T > 0)) return err("Enter the total bill.");
    const others = people.filter(p => !p.me);
    if (!others.length || others.some(p => !p.name.trim())) return err("Add a name for everyone you split with.");
    const names = new Set(); for (const p of others) { const k = norm(p.name); if (names.has(k)) return err(`${p.name} is listed twice.`); names.add(k); }
    recalc();
    const sum = r2(people.reduce((a, p) => a + (+p.amt || 0), 0));
    if (Math.abs(sum - T) >= 0.01) return err(`Shares must add up to ${money(T)}.`);
    const w = $$("#sWhat").value.trim() || "Split";
    const split = { total: r2(T), paidBy: $$("#sPaid").value, method, shares: people.map(p => p.me ? { me: true, name: "You", amt: r2(p.amt) } : { name: p.name.trim(), amt: r2(p.amt) }) };
    const patch = { what: w, date: $$("#sDate").value || today(), split, amount: r2(T) };
    if (ex) { St.update(ex.id, patch); toast("Split saved"); }
    else { const n = St.newExpense({ ...patch, type: "split", cat: catFor(w, St.prefs().rules), reportId }); if (!reportId) delete n.reportId; St.save(n); toast("Split saved"); }
    s.close();
  };
  $$("#sDel")?.addEventListener("click", async () => {
    if (!await confirmBox({ title: "Delete this split?", ok: "Delete", danger: true })) return;
    const copy = St.remove(ex.id); s.close(); toast("Split deleted", () => St.restore(copy));
    if (location.hash.startsWith("#/expense/")) go("#/spend");
  });
}

// settle up with a friend
export function openSettle(name, balance) {
  const P = St.prefs(), owesMe = balance > 0, amt = Math.abs(balance);
  const upiLink = owesMe && P.upi ? `upi://pay?pa=${encodeURIComponent(P.upi)}&pn=${encodeURIComponent(P.name || Api.user?.username || "")}&am=${amt.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Settling up")}` : "";
  const msg = owesMe ? `Hi ${name}, settling up: you owe me ${money(amt)}.${P.upi ? ` Pay by UPI to ${P.upi}` : ""}` : "";
  const s = sheet({ title: `Settle up with ${name}`, body: `
    <div class="note-box">${owesMe ? `<b>${esc(name)}</b> owes you <b>${money(amt)}</b>.` : `You owe <b>${esc(name)}</b> <b>${money(amt)}</b>.`}</div>
    <div class="row2"><label class="field"><span>Amount paid</span><div class="money"><input id="stAmt" type="number" inputmode="decimal" step="0.01" min="0" value="${amt.toFixed(2)}"></div></label>
    <label class="field"><span>Date</span><input id="stDate" type="date" value="${today()}"></label></div>
    ${owesMe ? `<div class="chips wrap">${P.upi ? `<button type="button" class="chip" id="stUpi">${I.upi}Share UPI request</button>` : ""}<button type="button" class="chip" id="stWa">Remind on WhatsApp</button></div>
    ${P.upi ? "" : `<p class="muted small" style="margin:0">Add your UPI ID in Account → Preferences to send payment requests.</p>`}` : ""}`,
    foot: `<button type="button" class="btn primary" id="stSave">${owesMe ? `Mark as received` : `Mark as paid`}</button>` });
  s.el.querySelector("#stSave").onclick = () => {
    const a = parseFloat(s.el.querySelector("#stAmt").value);
    if (!(a > 0)) return;
    St.save({ id: uuid(), kind: "settle", with: name, amount: r2(a), dir: owesMe ? "in" : "out", date: s.el.querySelector("#stDate").value || today(), created: Date.now() });
    s.close(); toast(owesMe ? `Recorded ${money(a)} from ${name}` : `Recorded ${money(a)} paid to ${name}`);
  };
  s.el.querySelector("#stUpi")?.addEventListener("click", async () => {
    const text = `${msg}\n${upiLink}`;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; } }
    const c = sheet({ title: "Payment request", center: true, body: `<textarea readonly id="upiTxt" style="min-height:110px">${esc(text)}</textarea>`, foot: `<button class="btn primary" id="upiCopy">Copy</button>` });
    c.el.querySelector("#upiCopy").onclick = async () => { const t = c.el.querySelector("#upiTxt"); t.select(); try { await navigator.clipboard.writeText(text); } catch { document.execCommand("copy"); } toast("Copied"); c.close(); };
  });
  s.el.querySelector("#stWa")?.addEventListener("click", () => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener"));
}
