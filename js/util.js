// Shared helpers: DOM, formatting, dates, icons.
export const $ = (id) => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
export const r2 = (v) => Math.round((+v || 0) * 100) / 100;
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const fmtINR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const fmtINR0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
/** ₹480 for whole amounts, ₹480.50 when there are paise */
export const money = (v) => { v = Math.round((v || 0) * 100) / 100; return (Number.isInteger(v) ? fmtINR0 : fmtINR).format(v).replace(/^-/, "−"); };
export const moneyBig = (v) => (Math.abs(v) >= 1e5 ? fmtINR0.format(Math.round(v || 0)) : money(v));
/** Hero figure: rupees large, paise small */
export const moneyHero = (v) => { const s = fmtINR.format(Math.round((v || 0) * 100) / 100), i = s.lastIndexOf("."); return i < 0 ? s : `${s.slice(0, i)}<small class="paise">${s.slice(i)}</small>`; };
export const moneyIn = (v, cur) => { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v || 0); } catch { return `${cur} ${r2(v)}`; } };
export function compact(v) {
  const s = v < 0 ? "-" : ""; v = Math.abs(v || 0);
  if (v >= 1e7) return s + "₹" + +(v / 1e7).toFixed(1) + "Cr";
  if (v >= 1e5) return s + "₹" + +(v / 1e5).toFixed(1) + "L";
  if (v >= 1e3) return s + "₹" + +(v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "k";
  return s + "₹" + Math.round(v);
}

// ---- dates: "YYYY-MM-DD" strings, local time ----
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const today = () => ymd(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
export const addMonths = (s, n) => { const d = parse(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, daysIn(d.getFullYear(), d.getMonth()))); return ymd(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const weekStart = (s) => { const d = parse(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
export const monthStart = (s) => s.slice(0, 8) + "01";
export const monthEnd = (s) => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const fyStart = (s) => { const d = parse(s), y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; };
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dLong = (s) => parse(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const dMed = (s) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const dShort = (s) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export function dayLabel(s) {
  const t = today();
  if (s === t) return "Today";
  if (s === addDays(t, -1)) return "Yesterday";
  const d = parse(s);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
export const timeAgo = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
export const plural = (n, w, p = w + "s") => `${n} ${n === 1 ? w : p}`;

// ---- storage ----
export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---- icons (stroke, 24px grid) ----
const sv = (p, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.4"><path d="M27.4 20.5 20.4 19 17 12.8M36.6 20.5 43.6 19 47 12.8M27.8 32 20.6 35 17.8 41.4M36.2 32 43.4 35 46.2 41.4"/><path d="M32 37.5C31.6 44.5 31.2 50.5 34.2 55C37.2 59.4 43.6 59.6 46 55.6C48.2 51.8 45.6 47.4 41.6 47.6" stroke-width="3.8"/></g><g fill="currentColor"><path d="M32 2.5C38.4 2.5 41.6 5.9 41.6 9.7C41.6 12.9 39.4 15 36.8 16C38.6 18.4 39.2 21.8 39 26.4C38.8 32.4 36 38.6 32 39.6C28 38.6 25.2 32.4 25 26.4C24.8 21.8 25.4 18.4 27.2 16C24.6 15 22.4 12.9 22.4 9.7C22.4 5.9 25.6 2.5 32 2.5Z"/><circle cx="16.4" cy="11.6" r="2.9"/><circle cx="47.6" cy="11.6" r="2.9"/><circle cx="17.2" cy="43" r="2.9"/><circle cx="46.8" cy="43" r="2.9"/></g><circle cx="40.2" cy="53.4" r="2.9" fill="#E9B23A"/><circle cx="27.8" cy="8.6" r="1.8" fill="#E9B23A"/><circle cx="36.2" cy="8.6" r="1.8" fill="#E9B23A"/></svg>';
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Animate a number up to its value (premium feel on totals) */
export function countUp(el, to, fmt, from = 0) {
  if (reducedMotion() || Math.abs(to - from) < 1) { el.innerHTML = fmt(to); return; }
  const t0 = performance.now(), dur = 750;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.innerHTML = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
export const I = {
  home: sv('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  spend: sv('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  reports: sv('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
  account: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 2.4),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: sv('<path d="M15 5l-7 7 7 7"/>', 2.2),
  left: sv('<path d="M15 6l-6 6 6 6"/>', 2.2),
  right: sv('<path d="M9 6l6 6-6 6"/>', 2.2),
  down: sv('<path d="M6 9l6 6 6-6"/>', 2.4),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.4),
  scan: sv('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>'),
  camera: sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  pen: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  car: sv('<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3zM7 19v2M17 19v2"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/>'),
  split: sv('<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.8-3.5 3-5.5 5.5-5.5s4.7 2 5.5 5.5M14 15c1-.6 2-.9 3-.9 2.2 0 4 1.7 4.6 4.9"/>'),
  receipt: sv('<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  trash: sv('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  folder: sv('<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  filter: sv('<path d="M4 5h16l-6 7v6l-4 2v-8z"/>'),
  cal: sv('<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  chart: sv('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  list: sv('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  alert: sv('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5h.01"/>'),
  info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
  more: sv('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 2.4),
  share: sv('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  download: sv('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/>'),
  upload: sv('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 19h14"/>'),
  sync: sv('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/>'),
  logout: sv('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  tag: sv('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
  user2: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  wallet: sv('<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>'),
  globe: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  note: sv('<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>'),
  star: sv('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>'),
  image: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  repeat: sv('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  bell: sv('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  msg: sv('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  bank: sv('<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>'),
  upi: sv('<path d="M7 4l5 8-5 8M13 4l5 8-5 8"/>'),
};
