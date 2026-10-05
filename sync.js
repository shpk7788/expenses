// Accounts + cloud sync via Supabase (Auth + PostgREST), no SDK needed.
(function () {
  const cfg = window.APP_CONFIG || {};
  const URL_ = (cfg.supabaseUrl || "").replace(/\/+$/, "");
  const KEY = cfg.supabaseKey || "";
  const SKEY = "exp:session";
  const configured = !!(URL_ && KEY);

  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY)); } catch {}

  const persist = () => { try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch {} };
  const emailFor = (u) => `${u.toLowerCase()}@users.snyp.io`;

  function setSession(data) {
    const user = data.user || session?.user;
    session = {
      access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: { id: user.id, username: user.user_metadata?.username || (user.email || "").split("@")[0], meta: user.user_metadata || {} },
    };
    persist();
  }

  async function authFetch(path, body) {
    const res = await fetch(URL_ + path, {
      method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendly(data));
    return data;
  }
  function friendly(d) {
    const m = (d.msg || d.error_description || d.message || d.error || "").toString();
    if (/already registered|already exists/i.test(m)) return "That username is taken. Try logging in instead.";
    if (/invalid login|invalid grant|credentials/i.test(m)) return "Wrong username or password.";
    if (/email not confirmed/i.test(m)) return "Account needs email confirmation turned off in Supabase (Authentication → Email → Confirm email).";
    if (/password/i.test(m) && /6|short|weak/i.test(m)) return "Password must be at least 6 characters.";
    if (/rate limit/i.test(m)) return "Too many attempts. Wait a minute and try again.";
    return m || "Something went wrong. Check your connection and try again.";
  }

  async function refresh() {
    if (!session?.refresh_token) throw new Error("Not logged in");
    try {
      const data = await authFetch("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      setSession(data);
    } catch (e) {
      if (/credentials|grant|token/i.test(e.message)) { session = null; persist(); window.dispatchEvent(new Event("sync:loggedout")); }
      throw e;
    }
  }
  async function token() {
    if (!session) throw new Error("Not logged in");
    if (Date.now() > session.expires_at - 60_000) await refresh();
    return session.access_token;
  }
  async function api(path, opts = {}, retry = true) {
    const res = await fetch(URL_ + path, {
      ...opts, headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 401 && retry) { await refresh(); return api(path, opts, false); }
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `Sync error ${res.status}`); }
    return res.status === 204 || res.headers.get("content-length") === "0" ? null : res.json().catch(() => null);
  }

  const validUser = (u) => /^[a-z0-9_.]{3,24}$/i.test(u);

  window.Sync = {
    configured,
    get user() { return session?.user || null; },
    async signUp(username, password) {
      username = username.trim();
      if (!validUser(username)) throw new Error("Username must be 3–24 letters, numbers, dots or underscores.");
      if ((password || "").length < 6) throw new Error("Password must be at least 6 characters.");
      const data = await authFetch("/auth/v1/signup", { email: emailFor(username), password, data: { username } });
      if (!data.access_token) throw new Error("Account created, but email confirmation is on. Turn off \"Confirm email\" in Supabase, then log in.");
      setSession(data); return session.user;
    },
    async signIn(username, password) {
      username = username.trim();
      if (!validUser(username)) throw new Error("Wrong username or password.");
      const data = await authFetch("/auth/v1/token?grant_type=password", { email: emailFor(username), password });
      setSession(data); return session.user;
    },
    async signOut() {
      try { if (session) await fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` } }); } catch {}
      session = null; persist();
    },
    // rows changed on the server after `cursor` (ISO time), oldest first, paged
    async pull(cursor) {
      const out = []; let offset = 0;
      for (;;) {
        const q = `/rest/v1/expenses?select=id,data,deleted,updated,synced_at&order=synced_at.asc,id.asc&limit=1000&offset=${offset}` +
          (cursor ? `&synced_at=gt.${encodeURIComponent(cursor)}` : "");
        const rows = await api(q, { method: "GET" }) || [];
        out.push(...rows); offset += rows.length;
        if (rows.length < 1000) break;
      }
      return out;
    },
    async push(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        await api("/rest/v1/expenses?on_conflict=id", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows.slice(i, i + 200)),
        });
      }
    },
    async saveMeta(meta) {
      const res = await fetch(URL_ + "/auth/v1/user", {
        method: "PUT", headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: meta }),
      });
      if (res.ok) { const u = await res.json(); session.user.meta = u.user_metadata || meta; persist(); }
    },
    async loadMeta() {
      const res = await fetch(URL_ + "/auth/v1/user", { headers: { apikey: KEY, Authorization: `Bearer ${await token()}` } });
      if (res.ok) { const u = await res.json(); session.user.meta = u.user_metadata || {}; persist(); }
      return session.user.meta;
    },
  };
})();
