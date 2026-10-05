// Supabase Auth + REST + Storage over plain fetch.
import { LS } from "./util.js";

const cfg = window.APP_CONFIG || {};
const BASE = (cfg.supabaseUrl || "").replace(/\/+$/, "");
const KEY = cfg.supabaseKey || "";
const SKEY = "exp:session";
export const configured = !!(BASE && KEY);

let session = LS.get(SKEY, null);
const persist = () => session ? LS.set(SKEY, session) : LS.del(SKEY);
const emailFor = (u) => `${u.toLowerCase()}@users.snyp.io`;
const validUser = (u) => /^[a-z0-9_.]{3,24}$/i.test(u);

function setSession(data) {
  const user = data.user || session?.user;
  session = {
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    user: { id: user.id, username: user.user_metadata?.username || (user.email || "").split("@")[0], meta: user.user_metadata || {} },
  };
  persist();
}
function friendly(d, status) {
  const m = String(d?.msg || d?.error_description || d?.message || d?.error || "");
  if (/already registered|already exists/i.test(m)) return "That username is taken. Try logging in instead.";
  if (/invalid login|invalid grant|credentials/i.test(m)) return "Wrong username or password.";
  if (/email not confirmed/i.test(m)) return "Sign-in needs \"Confirm email\" turned off in Supabase.";
  if (/password/i.test(m) && /6|short|weak|characters/i.test(m)) return "Password must be at least 6 characters.";
  if (/rate limit|too many/i.test(m) || status === 429) return "Too many attempts. Wait a minute and try again.";
  return m || "Couldn't reach the server. Check your connection and try again.";
}
async function authPost(path, body) {
  let res;
  try { res = await fetch(BASE + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("Couldn't reach the server. Check your connection and try again."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendly(data, res.status));
  return data;
}
async function refresh() {
  if (!session?.refresh_token) throw new Error("Not logged in");
  try { setSession(await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })); }
  catch (e) {
    if (/credentials|grant|token|refresh/i.test(e.message)) { session = null; persist(); window.dispatchEvent(new Event("api:loggedout")); }
    throw e;
  }
}
async function token() {
  if (!session) throw new Error("Not logged in");
  if (Date.now() > session.expires_at - 60_000) await refresh();
  return session.access_token;
}
async function call(path, opts = {}, retry = true) {
  const res = await fetch(BASE + path, { ...opts, headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, ...(opts.headers || {}) } });
  if (res.status === 401 && retry) { await refresh(); return call(path, opts, false); }
  return res;
}
async function callJson(path, opts = {}) {
  const res = await call(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `Sync error ${res.status}`); }
  const t = await res.text(); return t ? JSON.parse(t) : null;
}

export const Api = {
  configured,
  get user() { return session?.user || null; },
  async signUp(username, password) {
    username = username.trim();
    if (!validUser(username)) throw new Error("Username must be 3–24 letters, numbers, dots or underscores.");
    if ((password || "").length < 6) throw new Error("Password must be at least 6 characters.");
    const data = await authPost("/auth/v1/signup", { email: emailFor(username), password, data: { username } });
    if (!data.access_token) throw new Error("Account created, but \"Confirm email\" is on in Supabase. Turn it off, then log in.");
    setSession(data); return session.user;
  },
  async signIn(username, password) {
    username = username.trim();
    if (!validUser(username)) throw new Error("Wrong username or password.");
    setSession(await authPost("/auth/v1/token?grant_type=password", { email: emailFor(username), password }));
    return session.user;
  },
  async signOut() {
    try { if (session) await fetch(BASE + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` } }); } catch {}
    session = null; persist();
  },
  async pull(cursor) {
    const out = []; let offset = 0;
    for (;;) {
      const rows = await callJson(`/rest/v1/expenses?select=id,data,deleted,updated,synced_at&order=synced_at.asc,id.asc&limit=1000&offset=${offset}` +
        (cursor ? `&synced_at=gt.${encodeURIComponent(cursor)}` : ""), { method: "GET" }) || [];
      out.push(...rows); offset += rows.length;
      if (rows.length < 1000) break;
    }
    return out;
  },
  async push(rows) {
    for (let i = 0; i < rows.length; i += 200) {
      await callJson("/rest/v1/expenses?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 200)) });
    }
  },
  async saveMeta(meta) {
    const res = await call("/auth/v1/user", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: meta }) });
    if (res.ok) { const u = await res.json(); session.user.meta = u.user_metadata || meta; persist(); }
  },
  async loadMeta() {
    const res = await call("/auth/v1/user", { method: "GET" });
    if (res.ok) { const u = await res.json(); session.user.meta = u.user_metadata || {}; persist(); }
    return session.user.meta;
  },
  setMetaLocal(meta) { if (session) { session.user.meta = meta; persist(); } },
  // receipt photos: private bucket "receipts", path <user id>/<expense id>.jpg
  async uploadImage(id, blob) {
    const res = await call(`/storage/v1/object/receipts/${session.user.id}/${id}.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "31536000" }, body: blob });
    if (!res.ok) { const d = await res.json().catch(() => ({})); const e = new Error(d.message || d.error || `Upload failed (${res.status})`); e.noBucket = /bucket not found/i.test(e.message); throw e; }
  },
  async downloadImage(id) {
    const res = await call(`/storage/v1/object/authenticated/receipts/${session.user.id}/${id}.jpg`, { method: "GET" });
    if (!res.ok) return null;
    return res.blob();
  },
  async deleteImage(id) {
    try { await call(`/storage/v1/object/receipts/${session.user.id}/${id}.jpg`, { method: "DELETE" }); } catch {}
  },
};
