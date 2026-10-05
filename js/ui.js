// UI primitives: sheets (back-button aware), toast, confirm, autocomplete, expense rows.
import { $, esc, norm, money, I, MONTHS, dayLabel, plural } from "./util.js";
import { cat } from "./cats.js";
import { spendOf } from "./store.js";
import { imgUrl } from "./media.js";

// ---------- toast ----------
let toastT = null, undoFn = null;
export function toast(msg, undo) {
  $("toastMsg").textContent = msg; undoFn = undo || null; $("toastUndo").hidden = !undo;
  $("toast").classList.add("show"); clearTimeout(toastT);
  toastT = setTimeout(() => { $("toast").classList.remove("show"); undoFn = null; }, undo ? 6000 : 2600);
}
$("toastUndo").addEventListener("click", () => { const f = undoFn; undoFn = null; $("toast").classList.remove("show"); f?.(); });
window.addEventListener("app:toast", (e) => toast(e.detail));

// ---------- sheets with history so the phone's Back button closes them ----------
const stack = [];
let ignorePop = 0, pendingHash = null;
const waiters = [];
/** Run after any pending sheet-close history step has finished (avoids racing pushState) */
export function whenSettled(fn) { if (!ignorePop) fn(); else waiters.push(fn); }
window.addEventListener("popstate", () => {
  if (ignorePop) {
    ignorePop--;
    if (!ignorePop) { if (pendingHash != null) { const h = pendingHash; pendingHash = null; location.hash = h; } while (waiters.length) waiters.shift()(); }
    return;
  }
  const top = stack.pop();
  if (top) { top._viaPop = true; top.close(); }
});
/**
 * sheet({ title, sub, body, foot, center, onClose }) → { el, body, foot, close }
 * body/foot are HTML strings; returns the dialog so callers wire events.
 */
export function sheet({ title = "", sub = "", body = "", foot = "", center = false, onClose, cls = "" } = {}) {
  const d = document.createElement("dialog");
  d.className = `sheet ${center ? "center" : ""} ${cls}`;
  d.innerHTML = `<div class="sh">${center ? "" : '<div class="grab"></div>'}
    <div class="sh-head"><div style="min-width:0"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
    <button type="button" class="x" data-x aria-label="Close">${I.x}</button></div>
    <div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ""}</div>`;
  document.body.appendChild(d);
  d.addEventListener("click", (ev) => { if (ev.target === d || ev.target.closest("[data-x]")) d.close(); });
  d.addEventListener("close", () => {
    const i = stack.indexOf(d);
    if (i >= 0) stack.splice(i, 1);
    if (!d._viaPop && !d._silent) { ignorePop++; history.back(); }
    onClose?.(); setTimeout(() => d.remove(), 0);
  });
  d.showModal();
  stack.push(d); history.pushState({ sheet: stack.length }, "");
  const api = { el: d, body: d.querySelector(".sh-body"), foot: d.querySelector(".sh-foot"), close: () => d.open && d.close(),
    setTitle: (t) => { d.querySelector(".sh-head h2").textContent = t; } };
  return api;
}
/** Close every open sheet, then optionally navigate */
export function closeAll(hash) {
  if (!stack.length) { if (hash != null) { if (ignorePop) pendingHash = hash; else location.hash = hash; } return; }
  const n = stack.length;
  [...stack].reverse().forEach(d => { d._silent = true; d.close(); });
  stack.length = 0; ignorePop++; pendingHash = hash ?? null;
  history.go(-n);
}
export const anySheet = () => stack.length > 0;
export function go(hash) { closeAll(hash); }

export function confirmBox({ title, text = "", ok = "OK", danger = false }) {
  return new Promise(res => {
    let val = false;
    const s = sheet({ title, center: true, body: text ? `<p class="muted" style="margin:0">${esc(text)}</p>` : "",
      foot: `<button class="btn secondary" data-no>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(ok)}</button>`,
      onClose: () => res(val) });
    s.el.querySelector("[data-no]").onclick = () => s.close();
    s.el.querySelector("[data-yes]").onclick = () => { val = true; s.close(); };
  });
}
export function promptBox({ title, label = "", value = "", placeholder = "", ok = "Save", type = "text", inputmode = "" }) {
  return new Promise(res => {
    let val = null;
    const s = sheet({ title, center: true, body: `<label class="field"><span>${esc(label)}</span><input id="pIn" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ""} value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`,
      foot: `<button class="btn secondary" data-no>Cancel</button><button class="btn primary" data-yes>${esc(ok)}</button>`, onClose: () => res(val) });
    const inp = s.el.querySelector("#pIn"); setTimeout(() => { inp.focus(); inp.select?.(); }, 50);
    const done = () => { val = inp.value; s.close(); };
    s.el.querySelector("[data-no]").onclick = () => s.close();
    s.el.querySelector("[data-yes]").onclick = done;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); done(); } });
  });
}
/** Option list sheet → resolves with chosen value (or null) */
export function pickList({ title, options, value, search = false }) {
  return new Promise(res => {
    let val = null;
    const html = (q = "") => options.filter(o => !q || norm(o.label + " " + (o.sub || "")).includes(norm(q))).map(o =>
      `<button type="button" class="set-row" data-v="${esc(o.value)}" style="grid-template-columns:${o.icon ? "28px " : ""}minmax(0,1fr) auto">
        ${o.icon ? `<span style="font-size:1.2rem;text-align:center">${o.icon}</span>` : ""}<span>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>
        <span class="val" style="color:var(--accent)">${String(o.value) === String(value) ? I.check : ""}</span></button>`).join("") || `<p class="muted">No matches.</p>`;
    const s = sheet({ title, body: `${search ? `<div class="searchbar" style="margin:0">${I.search}<input type="search" id="plQ" placeholder="Search"></div>` : ""}<div class="set-list" id="plL">${html()}</div>`, onClose: () => res(val) });
    s.el.querySelector("#plL").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; val = b.dataset.v; s.close(); });
    s.el.querySelector("#plQ")?.addEventListener("input", (e) => { s.el.querySelector("#plL").innerHTML = html(e.target.value); });
  });
}

// ---------- full-screen image viewer ----------
export function viewImage(url) {
  const v = document.createElement("div"); v.className = "viewer"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "Receipt photo");
  v.innerHTML = `<img src="${url}" alt="Receipt photo"><button type="button" aria-label="Close">${I.x}</button>`;
  const close = () => { v.remove(); removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "Escape") close(); };
  v.querySelector("button").onclick = close; v.addEventListener("click", (e) => { if (e.target === v) close(); });
  addEventListener("keydown", key); document.body.appendChild(v); v.querySelector("button").focus();
}

// ---------- autocomplete ----------
export function highlight(name, q) {
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(name) : esc(name.slice(0, i)) + "<b>" + esc(name.slice(i, i + q.length)) + "</b>" + esc(name.slice(i + q.length));
}
export function autocomplete(input, source, onPick) {
  const box = document.createElement("div"); box.className = "ac"; box.setAttribute("role", "listbox");
  input.parentElement.classList.add("ac-wrap"); input.after(box);
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false");
  let opts = [], idx = -1;
  const close = () => { box.classList.remove("open"); input.setAttribute("aria-expanded", "false"); idx = -1; };
  const open = (q) => {
    if (!norm(q)) return close();
    const secs = source(q).filter(s => s.opts.length);
    opts = secs.flatMap(s => s.opts); idx = -1;
    if (!opts.length) return close();
    let i = 0;
    box.innerHTML = secs.map(s => `<div class="ac-sec">${esc(s.title)}</div>` + s.opts.map(o => `<div class="ac-opt" role="option" data-i="${i++}"><span>${highlight(o.name, q)}</span><small>${esc(o.sub || "")}</small></div>`).join("")).join("");
    box.scrollTop = 0; box.classList.add("open"); input.setAttribute("aria-expanded", "true");
  };
  const pick = (i) => { const o = opts[i]; if (!o) return; input.value = o.name; close(); onPick?.(true); };
  input.addEventListener("input", () => open(input.value.trim()));
  input.addEventListener("focus", () => { if (input.value.trim()) open(input.value.trim()); });
  input.addEventListener("keydown", (ev) => {
    if (!box.classList.contains("open")) { if (ev.key === "Enter") { ev.preventDefault(); onPick?.(false); } return; }
    const els = box.querySelectorAll(".ac-opt");
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault(); idx = (idx + (ev.key === "ArrowDown" ? 1 : -1) + els.length) % els.length;
      els.forEach((el, i) => el.classList.toggle("active", i === idx)); els[idx].scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter") { ev.preventDefault(); if (idx >= 0) pick(idx); else { close(); onPick?.(false); } }
    else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
    else if (ev.key === "Tab") close();
  });
  box.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".ac-opt")) ev.preventDefault(); });
  box.addEventListener("click", (ev) => { const el = ev.target.closest(".ac-opt"); if (el) pick(+el.dataset.i); });
  input.addEventListener("blur", () => setTimeout(close, 150));
  return { close };
}

// ---------- expense rows ----------
export function rowHtml(e, { dupes, selected, showDate = false } = {}) {
  const c = cat(e.cat), scanning = e.status === "scanning";
  const bits = [];
  if (showDate) bits.push(dayLabel(e.date));
  if (e.place) bits.push(esc(e.place));
  if (e.split) bits.push(e.split.paidBy === "me" ? `Split · you paid` : `Split · ${esc(e.split.paidBy)} paid`);
  if (e.type === "distance" && e.distance) bits.push(`${+e.distance.km} km`);
  if (e.pay) bits.push(esc(e.pay));
  if (!bits.length && e.note) bits.push(esc(e.note));
  const flags = [];
  if (scanning) flags.push(`<span class="pill">Scanning…</span>`);
  else if (e.status === "review") flags.push(`<span class="pill warn">Review</span>`);
  else if (e.status === "failed") flags.push(`<span class="pill bad">Add details</span>`);
  if (dupes?.has(e.id)) flags.push(`<span class="pill warn">${I.copy}Duplicate?</span>`);
  const end = scanning ? `<span class="amt scanning-txt">…</span>` : `<span class="amt">${money(spendOf(e))}</span>`;
  const sub2 = e.orig ? `<small>${esc(e.orig.cur)} ${+e.orig.amt}</small>` : e.split ? `<small>of ${money(e.split.total)}</small>` : "";
  const icons = [e.img && I.image, (e.receipt?.items?.length) && I.receipt, e.reportId && I.folder].filter(Boolean).slice(0, 2).join("");
  return `<li class="erow${scanning ? " scanning" : ""}${selected?.has(e.id) ? " sel" : ""}" data-id="${e.id}">
    <span class="ck">${I.check}</span>
    <div class="cat-ico" style="background:${c.color}22" title="${esc(c.name)}">${c.emoji}${e.img ? `<img data-thumb="${e.id}" alt="" hidden>` : ""}</div>
    <div class="mid"><b>${esc(e.what || (scanning ? "Reading receipt…" : "Untitled"))}</b><small>${icons}<span>${bits.join(" · ") || esc(c.name)}</span></small></div>
    <div class="end">${end}${sub2}${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}</div>
  </li>`;
}
/** Swap category icons for receipt thumbnails once loaded */
export function hydrateThumbs(root) {
  root.querySelectorAll("img[data-thumb]").forEach(async (img) => {
    const u = await imgUrl(img.dataset.thumb);
    if (u) { img.src = u; img.hidden = false; }
  });
}
/** Group expenses: months → days */
export function groupedHtml(list, opts = {}) {
  let html = "", curM = "", curD = "", rows = [];
  const monthTot = {}; list.forEach(e => { const k = e.date.slice(0, 7); monthTot[k] = (monthTot[k] || 0) + spendOf(e); });
  const flush = () => {
    if (!rows.length) return;
    const t = rows.reduce((s, e) => s + spendOf(e), 0);
    html += `<div class="group"><div class="ghead"><span>${dayLabel(curD)}</span><span>${money(t)}</span></div><ul class="rows">${rows.map(e => rowHtml(e, opts)).join("")}</ul></div>`;
    rows = [];
  };
  for (const e of list) {
    const mk = e.date.slice(0, 7);
    if (mk !== curM) { flush(); curM = mk; const [y, m] = mk.split("-"); html += `<div class="mhead"><b>${MONTHS[+m - 1]} ${y}</b><span>${money(monthTot[mk])}</span></div>`; }
    if (e.date !== curD) { flush(); curD = e.date; }
    rows.push(e);
  }
  flush();
  return html;
}
export const countLabel = (n) => plural(n, "expense");
