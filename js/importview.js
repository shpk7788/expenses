// Import screen: bank / Google Pay / PhonePe statements, pasted SMS, and alerts forwarded automatically.
// Files are read on the phone — nothing is uploaded.
import { $, esc, norm, r2, money, today, plural, dayLabel, dShort, monthStart, addMonths, I } from "./util.js";
import { cat, CATS } from "./cats.js";
import * as St from "./store.js";
import { Api } from "./api.js";
import { sheet, toast, go, pickCategory, promptBox, confirmBox } from "./ui.js";
import { top } from "./views.js";
import * as P from "./importer.js";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/";
const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const SRC = { bank: "bank statement", gpay: "Google Pay statement", phonepe: "PhonePe statement", paytm: "Paytm statement", "upi-app": "UPI statement", sms: "SMS", inbox: "bank alerts" };

const IM = { rows: null, range: "all", busy: "", err: "", file: null, pw: false, pwErr: "", label: "", inbox: false, unread: [], who: false, sms: "" };
const reset = () => Object.assign(IM, { rows: null, range: "all", busy: "", err: "", file: null, pw: false, pwErr: "", label: "", inbox: false, unread: [], who: false });

// ---------- loading helpers ----------
let pdfjsP, xlsxP;
const loadPdf = () => pdfjsP ||= import(/* @vite-ignore */ PDFJS + "pdf.min.mjs").then(m => { m.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs"; return m; }).catch(e => { pdfjsP = null; throw e; });
const loadXlsx = () => xlsxP ||= new Promise((ok, no) => { if (window.XLSX) return ok(window.XLSX); const s = document.createElement("script"); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; no(new Error("Couldn't load the Excel reader — check your connection")); }; document.head.append(s); });

/** PDF → text lines, rebuilt from positioned text so table rows stay on one line */
async function pdfLines(buf, password) {
  const pdfjs = await loadPdf();
  const doc = await pdfjs.getDocument({ data: buf, password: password || undefined, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let row = [], y = null;
    const flush = () => { if (!row.length) return; row.sort((a, b) => a.x - b.x); let out = "", end = null; for (const it of row) { out += end == null ? it.s : (it.x - end > 2 ? "  " : "") + it.s; end = it.x + it.w; } lines.push(out.replace(/\s+$/, "")); row = []; };
    for (const it of items) { if (y != null && Math.abs(it.y - y) > Math.max(2, it.h * 0.45)) flush(); if (!row.length) y = it.y; row.push(it); }
    flush();
  }
  return lines;
}
const sourceOf = (t) => /google pay|g ?pay/i.test(t) ? "gpay" : /phonepe/i.test(t) ? "phonepe" : /paytm/i.test(t) && /paid to|received from/i.test(t) ? "paytm" : "bank";

async function readFile(file, password) {
  const name = (file.name || "").toLowerCase(), buf = await file.arrayBuffer();
  if (/\.pdf$/.test(name) || file.type === "application/pdf" || new TextDecoder().decode(buf.slice(0, 5)) === "%PDF-") {
    const lines = await pdfLines(buf, password), src = sourceOf(lines.slice(0, 40).join(" "));
    return { txns: P.parseStatementLines(lines, src), src };
  }
  if (/\.(xlsx|xls|ods)$/.test(name) || /spreadsheet|excel/.test(file.type)) {
    const X = await loadXlsx(), wb = X.read(buf, { type: "array" });
    const txns = wb.SheetNames.flatMap(n => P.parseTable(X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" })));
    return { txns, src: "bank" };
  }
  const text = new TextDecoder().decode(buf).replace(/^﻿/, "");
  const { parseCSV, importPalliCsv } = await import("./views2.js");
  const rows = parseCSV(text), head = (rows[0] || []).map(h => String(h).trim().toLowerCase());
  if (head.includes("date") && head.includes("category") && (head.includes("merchant") || head.includes("what"))) { const n = await importPalliCsv(text); if (n >= 0) return { palli: n }; }
  let txns = P.parseTable(rows);
  if (txns.length) return { txns, src: "bank" };
  txns = P.parseStatementLines(text.split(/\r?\n/), sourceOf(text));
  if (txns.length) return { txns, src: sourceOf(text) };
  return { txns: P.parseSms(text), src: "sms" };
}

function load(txns, label) {
  const pr = St.prefs(), rows = P.prepare(txns, { existing: St.expenses(), rules: pr.rules, people: pr.people });
  if (!rows.length) { IM.err = "No transactions found. If this is a scanned (photo) PDF, download the statement again from your bank's app or net banking as a regular PDF, Excel or CSV."; IM.rows = null; return; }
  IM.rows = rows; IM.label = label; IM.err = "";
  const m = monthStart(today());
  IM.range = rows.some(r => r.date >= m) && rows.some(r => r.date < m) ? "month" : "all";
}
async function handleFile(file, password) {
  IM.file = file; IM.busy = "Reading your statement…"; IM.err = ""; IM.pwErr = ""; St.emit();
  try {
    const r = await readFile(file, password);
    if ("palli" in r) { reset(); toast(r.palli ? `Imported ${plural(r.palli, "expense")} from your Palli backup` : "Everything in that backup is already here"); go("#/spend"); return; }
    IM.pw = false; load(r.txns, `${file.name} · ${SRC[r.src] || "statement"}`);
  } catch (e) {
    if (e?.name === "PasswordException") { IM.pw = true; IM.pwErr = e.code === 2 ? "That password didn't work — try again." : ""; }
    else { console.error(e); IM.err = /load|fetch|network|import/i.test(e?.message || "") ? "Couldn't load the statement reader. Check your connection and try again." : "Couldn't read that file. Try the PDF, Excel or CSV statement from your bank or UPI app."; }
  } finally { IM.busy = ""; St.emit(); }
}
function readSms(text, label = "pasted SMS") {
  const t = P.parseSms(text);
  if (!t.length) { IM.err = "Couldn't find a payment in that text. Paste the full bank message — it should have an amount like “Rs.250” and words like debited, sent or spent."; St.emit(); return; }
  load(t, label); St.emit();
}
function readInbox() {
  const box = St.S.inbox; if (!box.length) { reset(); return; }
  const txns = [], noise = [], unread = [];
  for (const r of box) {
    const t = P.parseSms(r.msg, new Date(r.received || Date.now()));
    if (t.length) t.forEach(x => txns.push({ ...x, source: "inbox", inboxId: r.id }));
    else (P.isNoiseSms(r.msg) || !/\d/.test(r.msg) ? noise : unread).push(r);
  }
  if (noise.length) St.clearInbox(noise.map(r => r.id));   // OTPs, reminders, failed payments
  const label = `${plural(box.length - noise.length, "bank alert")} from your phone`;
  if (txns.length) load(txns, label);
  if (!IM.rows) { if (!unread.length) { reset(); toast("Those alerts weren't payments (OTPs, reminders…) — cleared"); return; } IM.rows = []; IM.label = label; IM.err = ""; }
  IM.inbox = true; IM.unread = unread;
}

// ---------- view ----------
let consumed = false;
export function importView(params) {
  // entry points: ?inbox=1 (forwarded alerts), shared SMS text (Android share / iPhone Shortcut), shared file (Android share)
  if (!consumed) {
    consumed = true;
    const shared = sessionStorage.getItem("exp:sharedSms");
    if (shared) { sessionStorage.removeItem("exp:sharedSms"); reset(); IM.sms = shared; readSms(shared, "shared message"); }
    else if (params.get("inbox")) { reset(); readInbox(); }
    if (params.get("shared")) takeShared();
  }
  $("view").innerHTML = IM.rows ? review() : intro();
}
export function leaveImport() { consumed = false; }
/** Something shared into Palli from Android's share sheet (kept by the service worker in Cache Storage, never in a URL) */
async function takeShared() {
  try {
    const c = await caches.open("palli-share"), f = await c.match("shared-file"), t = await c.match("shared-text");
    await caches.delete("palli-share");
    if (f) { const b = await f.blob(), name = decodeURIComponent(f.headers.get("x-name") || "statement"); reset(); handleFile(new File([b], name, { type: b.type }), ""); }
    else if (t) { const txt = await t.text(); reset(); IM.sms = txt; readSms(txt, "shared message"); }
  } catch {}
}

function intro() {
  const box = St.S.inbox.length;
  return top("Import", { back: "#/account" }) + `
  ${box ? `<button type="button" class="card imp-inbox" data-im="inbox"><span class="mi">${I.bell}</span><span><b>${plural(box, "new bank alert")}</b><small>Forwarded from your phone — tap to review</small></span>${I.right}</button>` : ""}
  ${IM.err ? `<div class="note-box warn imp-err" role="alert">${esc(IM.err)}</div>` : ""}
  <section class="card imp-card">
    <div class="imp-h"><span class="mi">${I.bank}</span><div><b>Upload a statement</b><small>Bank statement (PDF, Excel or CSV) or a Google Pay / PhonePe statement. It's read on your phone — the file never leaves it.</small></div></div>
    ${IM.pw ? `<form class="imp-pw" data-im-form="pw"><label class="field"><span>This PDF is locked. Enter its password</span><input id="imPw" type="password" autocomplete="off" placeholder="Often your date of birth or customer ID" enterkeyhint="go"></label>
      ${IM.pwErr ? `<p class="err">${esc(IM.pwErr)}</p>` : ""}<p class="muted small">Banks usually say which password in the email that came with the statement.</p>
      <div class="row2"><button type="button" class="btn secondary" data-im="file">Other file</button><button class="btn primary" type="submit">Unlock</button></div></form>`
      : `<button type="button" class="btn primary block" data-im="file">${I.upload}<span>Choose statement</span></button>`}
    <details class="imp-how"><summary>How to get your statement</summary><ul>
      <li><b>Google Pay</b> — tap your photo → <i>See transaction history</i> → <i>More</i> (⋮) → <i>Get statement</i>, pick the dates and save the PDF.</li>
      <li><b>PhonePe</b> — <i>History</i> → <i>Download statement</i> → choose the period. It arrives by email as a PDF.</li>
      <li><b>Your bank</b> — in the bank app or net banking, open <i>Account statement</i> and download it as PDF, Excel or CSV. Excel/CSV is the most accurate.</li>
      <li><b>Paytm</b> — <i>Balance & History</i> → <i>Download statement</i>.</li></ul></details>
  </section>
  <section class="card imp-card">
    <div class="imp-h"><span class="mi">${I.msg}</span><div><b>Paste bank SMS</b><small>Copy one or many payment messages from your bank and paste them here.</small></div></div>
    <textarea id="imSms" rows="4" placeholder="Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 03/10/26…">${esc(IM.sms)}</textarea>
    <button type="button" class="btn secondary block" data-im="sms">Read messages</button>
  </section>
  <section class="card imp-card">
    <div class="imp-h"><span class="mi">${I.bell}</span><div><b>Automatic from now on</b><small>Your phone forwards each bank alert to Palli as it arrives. You just tap to confirm.</small></div></div>
    <button type="button" class="btn secondary block" data-im="alerts">Set it up</button>
  </section>
  ${IM.busy ? `<div class="imp-busy" role="status"><span class="spin"></span><b>${esc(IM.busy)}</b></div>` : ""}`;
}

const inRange = (t) => {
  const m = monthStart(today());
  return IM.range === "month" ? t.date >= m : IM.range === "last" ? t.date >= addMonths(m, -1) && t.date < m : IM.range === "3m" ? t.date >= addMonths(m, -2) : true;
};
const visible = () => IM.rows.map((t, i) => ({ t, i })).filter(({ t }) => inRange(t) && (!IM.who || (t.person && t.dir === "out")));
function review() {
  const vis = visible(), sel = vis.filter(x => x.t.on), tot = sel.reduce((s, x) => s + x.t.amount, 0);
  const m = monthStart(today()), cnt = (r) => IM.rows.filter(t => (r === "month" ? t.date >= m : r === "last" ? t.date >= addMonths(m, -1) && t.date < m : r === "3m" ? t.date >= addMonths(m, -2) : true)).length;
  const ranges = [["month", "This month"], ["last", "Last month"], ["3m", "Last 3 months"], ["all", "Everything"]].filter(([k]) => k === "all" || cnt(k));
  const skipped = vis.length - sel.length, people = IM.rows.filter(t => inRange(t) && t.person && t.dir === "out" && !t.knownPerson && t.cat === "other").length;
  let html = "", day = "", rows = [];
  const flush = () => { if (rows.length) html += `<div class="group"><div class="ghead"><span>${dayLabel(day)}</span><span>${money(rows.filter(x => x.t.on).reduce((s, x) => s + x.t.amount, 0))}</span></div><ul class="rows selecting">${rows.map(row).join("")}</ul></div>`; rows = []; };
  for (const x of vis) { if (x.t.date !== day) { flush(); day = x.t.date; } rows.push(x); }
  flush();
  return top("Review import", { right: `<button type="button" class="link" data-im="restart">Start over</button>` }) + `
  <section class="card imp-sum">
    <p class="muted small" style="margin:0 0 4px">${esc(IM.label)}</p>
    <b class="imp-big">${plural(vis.length, "transaction")}</b>
    <p class="muted small" style="margin:4px 0 12px">Sorted into categories for you. Tap a row to include or skip it, the icon to change its category, or the name to rename it.</p>
    ${ranges.length > 1 ? `<div class="chips">${ranges.map(([k, l]) => `<button type="button" class="chip" data-range="${k}" aria-pressed="${IM.range === k}">${l} <span class="muted">${cnt(k)}</span></button>`).join("")}</div>` : ""}
    ${people || IM.who ? `<button type="button" class="imp-people" data-im="who" aria-pressed="${IM.who}">${I.split}<span><b>${IM.who ? "Showing payments to people" : `${plural(people, "payment")} to people`}</b><small>${IM.who ? "Tap to show everything" : "Tell Palli who they are once — it remembers"}</small></span></button>` : ""}
    <div class="imp-links"><button type="button" class="link" data-im="all">Select all spending</button><button type="button" class="link" data-im="none">Clear</button></div>
  </section>
  ${IM.unread.length ? `<section class="card imp-unread"><b>${plural(IM.unread.length, "alert")} Palli couldn't read</b><p class="muted small">Add these by hand if they were payments.</p>${IM.unread.map(r => `<p class="raw">${esc(r.msg)}</p>`).join("")}<button type="button" class="btn secondary sm" data-im="dismiss">Dismiss ${IM.unread.length > 1 ? "them" : "it"}</button></section>` : ""}
  ${vis.length ? html : IM.rows.length ? `<div class="empty"><p>Nothing in this period.</p></div>` : ""}
  ${skipped ? `<p class="muted small imp-foot">${plural(skipped, "row")} left out — money received, card bill payments, transfers to your own accounts, investments and likely duplicates are skipped unless you tick them.</p>` : ""}
  <div class="imp-bar"><div class="cnt"><b>${plural(sel.length, "expense")}</b><span>${money(tot)}</span></div><button type="button" class="btn primary" data-im="add" ${sel.length ? "" : "disabled"}>Add ${sel.length || ""}</button></div>`;
}
function row({ t, i }) {
  const c = cat(t.cat), bits = [t.pay, t.desc && norm(t.desc) !== norm(t.merchant) ? t.desc : ""].filter(Boolean).map(esc);
  const flags = [];
  if (t.dir === "in") flags.push(`<span class="pill good">Received</span>`);
  else if (t.skip) flags.push(`<span class="pill" title="${esc(t.skip)}">${esc(/card/i.test(t.skip) ? "Card bill" : /own/i.test(t.skip) ? "Own transfer" : t.skip)}</span>`);
  if (t.dup) flags.push(`<span class="pill warn" title="${esc(t.dupOf ? `Looks like “${t.dupOf}”, already in Palli` : "Already in Palli")}">${I.copy}Already added?</span>`);
  if (t.person && t.dir === "out" && !t.skip) flags.push(t.knownPerson || t.cat !== "other" ? `<span class="pill">Person</span>` : `<button type="button" class="pill ask" data-who="${i}">Who is this?</button>`);
  return `<li class="erow imp-row${t.on ? " sel" : ""}${t.dir === "in" ? " in" : ""}" data-ix="${i}" role="checkbox" aria-checked="${t.on}" tabindex="0">
    <span class="ck">${I.check}</span>
    <button type="button" class="cat-ico" data-cat="${i}" style="background:${c.color}22" title="${esc(c.name)} — tap to change" aria-label="Category: ${esc(c.name)}">${c.emoji}</button>
    <div class="mid"><b data-ren="${i}">${esc(t.merchant)}</b><small><span>${bits.join(" · ") || esc(c.name)}</span></small></div>
    <div class="end"><span class="amt">${t.dir === "in" ? "+" : ""}${money(t.amount)}</span>${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}</div></li>`;
}

// ---------- events ----------
export async function importClick(ev) {
  const t = ev.target;
  const a = t.closest("[data-im]")?.dataset.im;
  if (a === "file") { pickFile(); return true; }
  if (a === "sms") { const v = $("imSms")?.value || ""; IM.sms = v; if (!v.trim()) { $("imSms")?.focus(); toast("Paste one or more bank messages first"); return true; } readSms(v); return true; }
  if (a === "alerts") { alertsSetup(); return true; }
  if (a === "inbox") { reset(); readInbox(); St.emit(); return true; }
  if (a === "who") { IM.who = !IM.who; St.emit(); scrollTo(0, 0); return true; }
  if (a === "dismiss") { St.clearInbox(IM.unread.map(r => r.id)); IM.unread = []; if (!IM.rows.length) reset(); St.emit(); return true; }
  const wi = t.closest("[data-who]")?.dataset.who;
  if (wi != null) { whoSheet(+wi); return true; }
  if (a === "restart") { if (IM.inbox && !await confirmBox({ title: "Start over?", text: "The forwarded alerts stay in your inbox for later.", ok: "Start over" })) return true; reset(); St.emit(); scrollTo(0, 0); return true; }
  if (a === "all" || a === "none") { visible().forEach(({ t }) => { t.on = a === "all" ? t.dir === "out" && !t.skip && !t.dup : false; }); St.emit(); return true; }
  if (a === "add") { addSelected(); return true; }
  const rg = t.closest("[data-range]")?.dataset.range;
  if (rg) { IM.range = rg; St.emit(); return true; }
  const ci = t.closest("[data-cat]")?.dataset.cat;
  if (ci != null) {
    const r = IM.rows[+ci], v = await pickCategory({ value: r.cat, title: r.merchant });
    if (v && v !== r.cat) { const k = norm(r.merchant), same = IM.rows.filter(x => norm(x.merchant) === k); same.forEach(x => { x.cat = v; x.learn = true; }); if (same.length > 1) toast(`Changed all ${same.length} from ${r.merchant}`); St.emit(); }
    return true;
  }
  const ri = t.closest("[data-ren]")?.dataset.ren;
  if (ri != null) {
    const r = IM.rows[+ri], v = await promptBox({ title: "Rename", label: r.desc ? `From: ${r.desc.slice(0, 80)}` : "", value: r.merchant });
    if (v && v.trim()) {
      const old = norm(r.merchant), name = v.trim();
      IM.rows.filter(x => norm(x.merchant) === old).forEach(x => { x.orig ||= x.merchant; x.merchant = name; x.renamed = true; if (!x.learn) x.cat = St.prefs().rules[norm(name)] || x.cat; });
      St.emit();
    }
    return true;
  }
  const li = t.closest(".imp-row");
  if (li) { const r = IM.rows[+li.dataset.ix]; r.on = !r.on; li.classList.toggle("sel", r.on); li.setAttribute("aria-checked", r.on); St.emit(); return true; }
  return false;
}
export function importKey(ev) {
  if ((ev.key === " " || ev.key === "Enter") && ev.target.classList?.contains("imp-row")) { ev.preventDefault(); ev.target.click(); }
}
export function importSubmit(ev) {
  if (ev.target.dataset.imForm === "pw") { ev.preventDefault(); const pw = $("imPw")?.value || ""; if (IM.file && pw) handleFile(IM.file, pw); }
}
export function importInput(ev) { if (ev.target.id === "imSms") IM.sms = ev.target.value; }

function pickFile() {
  const inp = document.createElement("input"); inp.type = "file";
  inp.accept = ".pdf,.csv,.xls,.xlsx,.txt,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  inp.onchange = () => { const f = inp.files[0]; if (f) { IM.pw = false; handleFile(f, ""); } };
  inp.click();
}

function addSelected() {
  const pick = visible().filter(x => x.t.on).map(x => x.t);
  if (!pick.length) return;
  const recs = pick.map(t => {
    const e = St.newExpense({ date: t.date, what: t.merchant, amount: t.amount, cat: t.cat });
    if (t.pay) e.pay = t.pay;
    if (t.person) { e.toPerson = true; if (t.cat === "other") e.ask = true; }
    e.src = { from: t.source, ...(t.ref ? { ref: t.ref } : {}), text: t.desc.slice(0, 160) };
    return e;
  });
  const learned = new Map(); pick.filter(t => t.learn).forEach(t => learned.set(t.merchant, t.cat));
  learned.forEach((c, m) => St.learn(m, c));
  pick.filter(t => t.renamed && t.orig).forEach(t => St.rememberPerson(t.orig, { name: t.merchant }));
  St.saveMany(recs);
  // only the alerts you actually reviewed (rows in the period on screen) leave the inbox; undo brings them back
  const seen = IM.inbox ? [...new Set(visible().map(x => x.t.inboxId).filter(Boolean))] : [];
  const undoInbox = St.clearInbox(seen, 6500);
  const ids = recs.map(r => r.id), n = recs.length, tot = recs.reduce((s, r) => s + r.amount, 0), asks = recs.filter(r => r.ask).length;
  reset(); IM.sms = "";
  go(asks ? "#/people" : "#/spend");
  toast(`Added ${plural(n, "expense")} · ${money(tot)}`, () => { undoInbox(); St.saveMany(ids.map(St.get).filter(Boolean).map(e => ({ ...e, deleted: true }))); });
}

// ---------- automatic alerts ----------
export const SQL = `-- Palli: automatic bank alerts (run once in Supabase → SQL editor)
create table if not exists public.sms_inbox (id bigserial primary key, user_id uuid not null references auth.users on delete cascade, msg text not null, received timestamptz not null default now());
create table if not exists public.sms_tokens (user_id uuid primary key references auth.users on delete cascade, token text not null unique, created timestamptz not null default now());
alter table public.sms_inbox enable row level security;
alter table public.sms_tokens enable row level security;
drop policy if exists "own inbox" on public.sms_inbox;
create policy "own inbox" on public.sms_inbox for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own token" on public.sms_tokens;
create policy "own token" on public.sms_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.ingest_sms(token text, msg text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select t.user_id into uid from public.sms_tokens t where t.token = ingest_sms.token;
  if uid is null then raise exception 'unknown token'; end if;
  if coalesce(length(trim(msg)), 0) = 0 then return 'empty'; end if;
  insert into public.sms_inbox (user_id, msg) values (uid, left(msg, 1000));
  delete from public.sms_inbox where user_id = uid and id not in (select id from public.sms_inbox where user_id = uid order by id desc limit 300);
  return 'ok';
end $$;
revoke all on function public.ingest_sms(text, text) from public;
grant execute on function public.ingest_sms(text, text) to anon, authenticated;`;

const copyBtn = (v, label = "Copy") => `<button type="button" class="btn secondary sm" data-copy="${esc(v)}">${I.copy}<span>${label}</span></button>`;
export async function alertsSetup() {
  if (!Api.user) { toast("Sign in first — alerts go to your account"); go("#/account"); return; }
  const s = sheet({ title: "Automatic bank alerts", sub: "Every payment SMS lands in Palli for a one-tap review", body: `<div class="imp-busy inline"><span class="spin"></span><b>Checking setup…</b></div>` });
  let tk; try { tk = await Api.smsToken(); } catch { tk = { missing: true, offline: true }; }
  const body = s.el.querySelector(".sheet-body") || s.el.querySelector("[data-body]") || s.el;
  const area = s.el.querySelector(".imp-busy.inline")?.parentElement || body;
  if (tk.missing) {
    area.innerHTML = tk.offline ? `<div class="note-box warn">You're offline. Try again when you're connected.</div>` : `
      <div class="note-box">Automatic alerts aren't switched on for Palli yet. Until they are, you can paste bank SMS or upload a statement from the Import screen.</div>
      <details class="imp-how" style="margin-top:12px"><summary>For the app owner: switch it on (once, for everyone)</summary>
      <ol class="steps"><li>Open <b>supabase.com</b> → the Palli project → <b>SQL Editor</b> → <b>New query</b>.</li><li>Paste this and press <b>Run</b>. Users don't need to do this.</li></ol>
      <pre class="code">${esc(SQL)}</pre>${copyBtn(SQL, "Copy SQL")}</details>`;
  } else {
    const url = Api.ingestUrl, json = `{"token":"${tk.token}","msg":"%text%"}`;
    area.innerHTML = `
      <div class="seg" role="tablist"><button type="button" role="tab" data-os="ios" aria-selected="true">iPhone</button><button type="button" role="tab" data-os="android" aria-selected="false">Android</button></div>
      <div data-pane="ios"><ol class="steps">
        <li>Open the <b>Shortcuts</b> app → <b>Automation</b> → <b>+</b> → <b>Message</b>.</li>
        <li>Set <b>Message Contains</b> to <code>debited</code>, choose <b>Run Immediately</b>, tap <b>Next</b> → <b>New Blank Automation</b>.</li>
        <li>Add the action <b>Get Contents of URL</b> and paste this URL:${copyBtn(url, "Copy URL")}</li>
        <li>Tap the arrow on that action: <b>Method</b> POST, <b>Request Body</b> JSON. Add a Text field <code>token</code> with this value:${copyBtn(tk.token, "Copy token")}</li>
        <li>Add a second Text field <code>msg</code>, and for its value pick the <b>Shortcut Input</b> variable → <b>Content</b>.</li>
        <li>Done. Repeat steps 1–5 with <code>spent</code> and <code>sent</code> if your bank uses those words.</li></ol></div>
      <div data-pane="android" hidden><ol class="steps">
        <li>Install a free SMS forwarding app that can send to a web address — for example <b>SMS to URL Forwarder</b> (open source, on Google Play and F-Droid).</li>
        <li>Add a forwarding rule. Sender: your bank (e.g. <code>HDFCBK</code>) or <code>*</code> for all.</li>
        <li>Web address:${copyBtn(url, "Copy URL")}</li>
        <li>Message template (JSON):<pre class="code">${esc(json)}</pre>${copyBtn(json, "Copy template")}</li>
        <li>Save, and allow it to read SMS. You can also tap <b>Share</b> on any bank SMS and pick Palli.</li></ol></div>
      <div class="note-box" style="margin-top:12px">Your token only lets a phone <i>add</i> alerts to your review list — it can't read or change your expenses. Keep it private anyway.</div>
      <div class="row2" style="margin-top:12px"><button type="button" class="btn secondary" data-al="renew">New token</button><button type="button" class="btn primary" data-al="test">Send a test alert</button></div>`;
    area.addEventListener("click", async (e) => {
      const os = e.target.closest("[data-os]")?.dataset.os;
      if (os) { area.querySelectorAll("[data-os]").forEach(b => b.setAttribute("aria-selected", b.dataset.os === os)); area.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== os); }
      const al = e.target.closest("[data-al]")?.dataset.al;
      if (al === "test") {
        try {
          const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tk.token, msg: `Sent Rs.1.00 From Palli Test A/C *0000 To PALLI TEST On ${today().split("-").reverse().join("/")}` }) });
          if (!r.ok) throw 0;
          await St.checkInbox(); toast("Test alert arrived — it's waiting on the Home screen");
        } catch { toast("The test didn't go through — check your connection"); }
      }
      if (al === "renew" && await confirmBox({ title: "Make a new token?", text: "Shortcuts and apps using the old token stop working until you paste the new one.", ok: "New token", danger: true })) { s.close(); const n = await Api.smsToken(true); if (n.token) setTimeout(alertsSetup, 350); }
    });
  }
  s.el.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copy]"); if (!c) return;
    try { await navigator.clipboard.writeText(c.dataset.copy); toast("Copied"); } catch { toast("Couldn't copy — press and hold to select instead"); }
  });
}
export const _test = { IM, readSms, handleFile };

// ---------- who is this person? ----------
function whoSheet(i) {
  const r = IM.rows[i]; if (!r) return;
  let pick = r.cat;
  const s = sheet({ title: `Who is ${r.merchant}?`, sub: "Palli remembers this for every future payment to them",
    body: `<label class="field"><span>Name</span><input id="wName" value="${esc(r.merchant)}" placeholder="e.g. Subash (gym trainer)" autocomplete="off"></label>
      <div class="field" style="margin-top:14px"><span>Usually paid for</span><div class="cat-grid">${CATS.map(c => `<button type="button" data-v="${c.id}" aria-pressed="${c.id === pick}"><span class="ce" style="background:${c.color}22">${c.emoji}</span><span>${esc(c.name)}</span></button>`).join("")}</div></div>`,
    foot: `<button type="button" class="btn secondary" data-x>Not now</button><button type="button" class="btn primary" id="wOk">Save</button>` });
  s.body.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; pick = b.dataset.v; s.body.querySelectorAll("[data-v]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  s.el.querySelector("#wOk").onclick = () => {
    const name = s.el.querySelector("#wName").value.trim() || r.merchant, k = norm(r.merchant), orig = r.orig || r.merchant;
    IM.rows.filter(x => norm(x.merchant) === k).forEach(x => { x.orig ||= x.merchant; x.merchant = name; x.cat = pick; x.learn = pick !== "other"; x.knownPerson = true; });
    St.rememberPerson(orig, { name });
    if (pick !== "other") St.learn(name, pick);
    s.close(); St.emit();
  };
}

// ---------- payments to people that still need a category (#/people) ----------
const QUICK = ["food", "groceries", "transport", "home", "health", "personal", "rent", "shopping", "services", "gifts", "other"];
const pendingPeople = () => {
  const g = new Map();
  for (const e of St.expenses().filter(e => e.ask)) { const k = norm(e.what); (g.get(k) || g.set(k, { name: e.what, list: [] }).get(k)).list.push(e); }
  return [...g.values()].map(x => ({ ...x, list: x.list.sort((a, b) => b.date.localeCompare(a.date)), tot: x.list.reduce((s, e) => s + e.amount, 0) })).sort((a, b) => b.tot - a.tot);
};
export const peopleCount = () => St.expenses().filter(e => e.ask).length;
const open = new Set();
export function peopleView() {
  const groups = pendingPeople();
  $("view").innerHTML = top("What were these for?", { back: "#/home" }) + (groups.length ? `
    <p class="muted small" style="margin:0 4px 14px">UPI payments to people's names — a shop, an auto driver, a friend you paid back. Pick what each person is usually for; Palli remembers them on every future import.</p>
    ${groups.map(g => { const k = norm(g.name), many = g.list.length > 1; return `<section class="card ppl" data-k="${esc(k)}">
      <div class="ppl-h"><span class="ppl-av">${esc(g.name.trim()[0]?.toUpperCase() || "?")}</span><div><b>${esc(g.name)}</b><small>${plural(g.list.length, "payment")} · ${money(g.tot)} · ${dShort(g.list[0].date)}</small></div><button type="button" class="link" data-pren="${esc(k)}">Rename</button></div>
      <div class="chips wrap ppl-cats">${QUICK.map(c => `<button type="button" class="chip" data-pc="${c}">${cat(c).emoji} ${esc(c === "other" ? "Personal / other" : cat(c).name)}</button>`).join("")}</div>
      ${many ? `<button type="button" class="link ppl-each" data-each="${esc(k)}">${open.has(k) ? "Hide payments" : "Different each time? Sort them one by one"}</button>` : ""}
      ${many && open.has(k) ? `<ul class="ppl-list">${g.list.map(e => `<li><span><b>${money(e.amount)}</b><small>${dayLabel(e.date)}</small></span><select data-one="${e.id}" aria-label="Category for ${money(e.amount)} on ${esc(e.date)}"><option value="">Choose…</option>${CATS.map(c => `<option value="${c.id}">${c.emoji} ${esc(c.name)}</option>`).join("")}</select></li>`).join("")}</ul>` : ""}
    </section>`; }).join("")}` : `<div class="empty"><b>All sorted</b><p>Every payment to a person has a category.</p><button type="button" class="btn secondary" data-go="#/spend">See spending</button></div>`);
}
export async function peopleClick(ev) {
  const t = ev.target, card = t.closest(".ppl"), k = card?.dataset.k;
  const g = k && pendingPeople().find(x => norm(x.name) === k);
  const each = t.closest("[data-each]"); if (each) { open.has(k) ? open.delete(k) : open.add(k); St.emit(); return true; }
  const pc = t.closest("[data-pc]")?.dataset.pc;
  if (pc && g) {
    St.saveMany(g.list.map(e => { const n = { ...e, cat: pc }; delete n.ask; return n; }));
    if (pc !== "other") St.learn(g.name, pc);
    St.rememberPerson(g.name, { cat: pc });
    toast(`${g.name} → ${pc === "other" ? "Personal / other" : cat(pc).name} · ${plural(g.list.length, "payment")}`, () => St.saveMany(g.list.map(e => ({ ...St.get(e.id), cat: e.cat, ask: true }))));
    return true;
  }
  if (t.closest("[data-pren]") && g) {
    const v = await promptBox({ title: "Who is this?", label: "Give them a name you'll recognise", value: g.name, placeholder: "e.g. Subash (gym trainer)" });
    if (v && v.trim() && v.trim() !== g.name) { St.saveMany(g.list.map(e => ({ ...e, what: v.trim() }))); St.rememberPerson(g.name, { name: v.trim() }); }
    return true;
  }
  return false;
}
export function peopleChange(ev) {
  const id = ev.target.dataset.one, c = ev.target.value; if (!id || !c) return;
  const e = St.get(id); if (!e) return;
  const n = { ...e, cat: c }; delete n.ask; St.saveMany([n]);
  toast(`${money(e.amount)} → ${cat(c).name}`);
}
