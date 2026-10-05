// App state: records (expenses, reports, settlements), prefs, sync engine.
import { LS, norm, r2, uuid, today, money, addDays, diffDays } from "./util.js";
import { Api } from "./api.js";
import { catFor, cat } from "./cats.js";
import { Img } from "./media.js";

const listeners = new Set();
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
let emitT = null;
export const emit = () => { clearTimeout(emitT); emitT = setTimeout(() => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 0); };

export const ns = () => (Api.user ? `u:${Api.user.id}` : "guest");
const K = (name, space = ns()) => `exp:${space}:${name}`;

export const S = { items: [], dirty: new Set(), imgUp: new Set(), imgDel: new Set(), cursor: null, lastSynced: 0, state: "off", err: "", noBucket: false };

(function migrate() {
  const old = LS.get("expenses.v1", null);
  if (old && !LS.get(K("items", "guest"), null)) LS.set(K("items", "guest"), old.map(e => ({ ...e, updated: e.updated || e.created || Date.now() })));
  if (old) LS.del("expenses.v1");
  ["expenses.loc"].forEach(LS.del);
})();

export function load() {
  S.items = LS.get(K("items"), []);
  for (const e of S.items) {
    if (!e.kind) e.kind = "expense";
    if (e.kind === "expense") { if (!e.cat) e.cat = catFor(e.what, prefs().rules); if (!e.type) e.type = e.receipt ? "scan" : "manual"; }
    if (!e.updated) e.updated = e.created || Date.now();
  }
  S.dirty = new Set(LS.get(K("dirty"), []));
  S.imgUp = new Set(LS.get(K("imgUp"), []));
  S.imgDel = new Set(LS.get(K("imgDel"), []));
  S.cursor = LS.get(K("cursor"), null);
  S.lastSynced = LS.get(K("synced"), 0);
  S.noBucket = false;
}
export function persist() {
  const ok = LS.set(K("items"), S.items);
  LS.set(K("dirty"), [...S.dirty]); LS.set(K("imgUp"), [...S.imgUp]); LS.set(K("imgDel"), [...S.imgDel]);
  LS.set(K("cursor"), S.cursor); LS.set(K("synced"), S.lastSynced);
  return ok;
}
export const wipeSpace = (space) => ["items", "dirty", "imgUp", "imgDel", "cursor", "synced"].forEach(k => LS.del(K(k, space)));

// ---------- selectors ----------
export const get = (id) => S.items.find(e => e.id === id);
const liveKind = (k) => S.items.filter(e => !e.deleted && e.kind === k);
export const expenses = () => liveKind("expense");
export const reports = () => liveKind("report").sort((a, b) => (b.created || 0) - (a.created || 0));
export const settles = () => liveKind("settle");
/** What this expense costs *me* (my share of a split, 0 while still scanning) */
export const spendOf = (e) => e.split ? r2(e.split.shares.find(s => s.me)?.amt || 0) : (e.amount || 0);
export const reportOf = (e) => e.reportId ? get(e.reportId) : null;
export const inReport = (rid) => expenses().filter(e => e.reportId === rid);

// ---------- writes ----------
export function save(rec) {
  rec.updated = Date.now();
  const i = S.items.findIndex(x => x.id === rec.id);
  if (i < 0) S.items.push(rec); else S.items[i] = rec;
  if (Api.user) S.dirty.add(rec.id);
  else if (rec.deleted) S.items = S.items.filter(x => x.id !== rec.id);
  if (!persist()) window.dispatchEvent(new CustomEvent("app:toast", { detail: "Storage is full — export a backup and remove old receipt photos." }));
  emit(); scheduleSync();
  return rec;
}
export function newExpense(fields = {}) {
  return { id: uuid(), kind: "expense", type: "manual", date: today(), what: "", amount: 0, cat: "other", created: Date.now(), comments: [], ...fields };
}
const TRACK = { amount: "amount", what: "merchant", date: "date", cat: "category", place: "restaurant", pay: "payment", reportId: "report" };
/** Update with an automatic history entry, like Expensify's expense thread */
export function update(id, patch, { log = true } = {}) {
  const e = get(id); if (!e) return null;
  const n = { ...e, ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === undefined || patch[k] === "" || patch[k] === null) delete n[k];
  if (log && e.kind === "expense") {
    const notes = [];
    for (const [k, label] of Object.entries(TRACK)) {
      if (!(k in patch) || (e[k] ?? "") === (n[k] ?? "")) continue;
      const show = (v) => v == null || v === "" ? "none" : k === "amount" ? money(v) : k === "cat" ? cat(v).name : k === "reportId" ? (get(v)?.name || "none") : String(v);
      notes.push(`Changed ${label} from ${show(e[k])} to ${show(n[k])}`);
    }
    if (notes.length && !e.status) n.comments = [...(e.comments || []), ...notes.map(t => ({ t: Date.now(), sys: true, text: t }))];
  }
  return save(n);
}
export function remove(id) {
  const e = get(id); if (!e) return null;
  const copy = JSON.parse(JSON.stringify(e));
  if (e.kind === "report") inReport(id).forEach(x => { const n = { ...x }; delete n.reportId; save(n); });
  save({ ...e, deleted: true });
  return copy;
}
export function restore(copy) {
  save({ ...copy, deleted: false });
  if (copy.img) Img.get(copy.id).then(b => { if (b && Api.user) { S.imgUp.add(copy.id); S.imgDel.delete(copy.id); persist(); } });
}
export async function attachImage(id, blob) {
  await Img.put(id, blob);
  const e = get(id); if (!e) return;
  e.img = true; S.imgDel.delete(id);
  if (Api.user) S.imgUp.add(id);
  save({ ...e });
}
export async function detachImage(id) {
  await Img.del(id);
  const e = get(id); if (!e) return;
  const n = { ...e }; delete n.img;
  if (Api.user) { S.imgUp.delete(id); S.imgDel.add(id); }
  save(n);
}
export async function getImage(id) {
  let b = await Img.get(id);
  if (!b && Api.user && get(id)?.img) { try { b = await Api.downloadImage(id); if (b) await Img.put(id, b); } catch {} }
  return b;
}

// ---------- prefs (synced via account metadata for signed-in users) ----------
const PREF_DEFAULTS = { budget: 0, currency: "INR", upi: "", name: "", rates: { car: 10, bike: 4 }, rules: {}, theme: "system", saved: [] };
export function prefs() {
  const raw = Api.user ? (Api.user.meta || {}) : LS.get(K("settings", "guest"), {});
  return { ...PREF_DEFAULTS, ...raw, rates: { ...PREF_DEFAULTS.rates, ...(raw.rates || {}) }, rules: raw.rules || {} };
}
let metaT = null;
export function setPrefs(patch) {
  const next = { ...prefs(), ...patch };
  if (Api.user) {
    const { username, ...meta } = { ...(Api.user.meta || {}), ...next };
    Api.setMetaLocal({ ...meta, username: Api.user.username });
    clearTimeout(metaT); metaT = setTimeout(() => Api.saveMeta(Api.user.meta).catch(() => {}), 600);
  } else LS.set(K("settings", "guest"), next);
  if ("theme" in patch) applyTheme();
  emit();
}
/** Remember the category a person picks for a merchant, so next time it's automatic */
export function learn(merchant, catId) {
  const n = norm(merchant); if (!n) return;
  const p = prefs(); if (p.rules[n] === catId) return;
  if (catFor(merchant, {}) === catId) { if (p.rules[n]) { const r = { ...p.rules }; delete r[n]; setPrefs({ rules: r }); } return; }
  setPrefs({ rules: { ...p.rules, [n]: catId } });
}
export function applyTheme() {
  const t = prefs().theme;
  LS.set("exp:theme", t);
  if (t === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
}

// ---------- smart checks ----------
/** Possible duplicates: same amount, dates within a day, similar merchant */
export function duplicates() {
  const byAmt = new Map(), out = new Map();
  for (const e of expenses()) { if (!e.amount || e.status === "scanning") continue; const k = r2(e.amount); (byAmt.get(k) || byAmt.set(k, []).get(k)).push(e); }
  for (const list of byAmt.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(diffDays(a.date, b.date)) > 1) continue;
      const na = norm(a.what), nb = norm(b.what);
      if (na && nb && !(na === nb || na.includes(nb) || nb.includes(na))) continue;
      if ((a.notDup || []).includes(b.id) || (b.notDup || []).includes(a.id)) continue;
      (out.get(a.id) || out.set(a.id, []).get(a.id)).push(b.id);
      (out.get(b.id) || out.set(b.id, []).get(b.id)).push(a.id);
    }
  }
  return out;
}
/** Split balances: + means they owe me */
export function balances() {
  const bal = new Map(), add = (name, v) => { const k = name.trim(); if (!k) return; bal.set(k, r2((bal.get(k) || 0) + v)); };
  for (const e of expenses()) {
    if (!e.split) continue;
    const me = e.split.shares.find(s => s.me);
    if (e.split.paidBy === "me") e.split.shares.filter(s => !s.me).forEach(s => add(s.name, s.amt));
    else add(e.split.paidBy, -(me?.amt || 0));
  }
  for (const s of settles()) add(s.with, s.dir === "in" ? -s.amount : s.amount);
  return [...bal.entries()].map(([name, v]) => ({ name, v })).filter(b => Math.abs(b.v) >= 0.01).sort((a, b) => b.v - a.v);
}

// ---------- sync ----------
let syncing = false, again = false, timer = null;
function setState(s, err = "") { S.state = s; S.err = err; emit(); }
export function scheduleSync(ms = 1200) { if (!Api.user) return; clearTimeout(timer); timer = setTimeout(syncNow, ms); }
export async function syncNow() {
  if (!Api.user || !Api.configured) return;
  if (syncing) { again = true; return; }
  if (!navigator.onLine) { setState("offline", "You're offline. Changes will sync when you reconnect."); return; }
  syncing = true; setState("busy");
  const space = ns();
  try {
    const rows = await Api.pull(S.cursor);
    if (ns() !== space) return;
    let changed = false;
    for (const r of rows) {
      const l = get(r.id), remote = { ...r.data, id: r.id, updated: Number(r.updated), deleted: !!r.deleted };
      if (!remote.kind) remote.kind = "expense";
      if (!l || remote.updated > (l.updated || 0)) {
        if (l) Object.keys(l).forEach(k => delete l[k]);
        l ? Object.assign(l, remote) : S.items.push(remote);
        S.dirty.delete(r.id); changed = true;
        if (remote.deleted) Img.del(r.id);
      }
      if (r.synced_at && (!S.cursor || r.synced_at > S.cursor)) S.cursor = r.synced_at;
    }
    const pending = [...S.dirty].map(get).filter(Boolean);
    if (pending.length) {
      await Api.push(pending.map(e => { const { deleted, ...data } = e; return { id: e.id, data, deleted: !!deleted, updated: e.updated }; }));
      pending.forEach(e => S.dirty.delete(e.id));
    }
    // receipt photos
    for (const id of [...S.imgUp]) {
      const e = get(id), b = e && !e.deleted ? await Img.get(id) : null;
      if (!b) { S.imgUp.delete(id); continue; }
      try { await Api.uploadImage(id, b); S.imgUp.delete(id); S.noBucket = false; }
      catch (err) { if (err.noBucket) { S.noBucket = true; break; } throw err; }
    }
    for (const id of [...S.imgDel]) { await Api.deleteImage(id); S.imgDel.delete(id); }
    const cutoff = Date.now() - 60 * 864e5;
    S.items = S.items.filter(e => !(e.deleted && !S.dirty.has(e.id) && e.updated < cutoff));
    S.lastSynced = Date.now(); persist();
    if (changed) emit();
    setState("ok");
  } catch (err) {
    setState(Api.user ? "err" : "off", err.message || "Sync failed");
  } finally {
    syncing = false;
    if (again) { again = false; scheduleSync(300); }
  }
}
window.addEventListener("online", () => scheduleSync(200));
document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(200); });
setInterval(() => { if (!document.hidden) syncNow(); }, 60000);

export function switchSpace() { load(); setState(Api.user ? "idle" : "off"); applyTheme(); emit(); }
/** Move guest (device-only) records into the signed-in account */
export function adoptGuest() {
  const guest = LS.get(K("items", "guest"), []).filter(e => !e.deleted), have = new Set(S.items.map(e => e.id));
  for (const e of guest) {
    const n = { ...e, kind: e.kind || "expense", updated: Date.now() };
    if (have.has(n.id)) n.id = uuid();
    S.items.push(n); S.dirty.add(n.id);
    if (n.img) S.imgUp.add(n.id);
  }
  const gp = LS.get(K("settings", "guest"), null);
  if (gp) setPrefs({ ...gp, ...prefs(), rules: { ...(gp.rules || {}), ...prefs().rules } });
  wipeSpace("guest"); LS.del(K("settings", "guest"));
  persist(); emit(); scheduleSync(100);
  return guest.length;
}
export const guestCount = () => LS.get(K("items", "guest"), []).filter(e => !e.deleted).length;
