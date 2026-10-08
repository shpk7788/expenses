// Receipt photos (IndexedDB) and currency conversion.
const DB = "expenses-img", STORE = "img";
let dbp = null;
function db() {
  return dbp ||= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((ok, fail) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE), req = fn(s); t.oncomplete = () => ok(req?.result); t.onerror = () => fail(t.error); });
}
export const Img = {
  put: (key, blob) => tx("readwrite", s => s.put(blob, key)).catch(() => null),
  get: (key) => tx("readonly", s => s.get(key)).catch(() => null),
  del: (key) => tx("readwrite", s => s.delete(key)).catch(() => null),
};
const urls = new Map();
export async function imgUrl(key) {
  if (urls.has(key)) return urls.get(key);
  const b = await Img.get(key); if (!b) return null;
  const u = URL.createObjectURL(b); urls.set(key, u); return u;
}
export function forgetUrl(key) { const u = urls.get(key); if (u) { URL.revokeObjectURL(u); urls.delete(key); } }

// Downscale a photo to a JPEG ~1600px for storage; returns { blob, canvas } (canvas reused for OCR)
export async function compress(file, max = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { const u = URL.createObjectURL(file); src = new Image(); src.src = u; await src.decode(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.72));
  return { blob, canvas: c };
}

// ---- FX: rate to convert 1 unit of `cur` into INR on `date` ----
// Gives up after ~4 s in total (patchy roaming data), then falls back to the last rate this phone saw for that currency.
export async function fxRateInfo(cur, date, { budget = 4000 } = {}) {
  if (cur === "INR") return { rate: 1 };
  const key = `exp:fx:${cur}:${date}`;
  try { const c = localStorage.getItem(key); if (c) return { rate: +c }; } catch {}
  const t = new Date().toISOString().slice(0, 10), d = date > t ? "latest" : date, until = Date.now() + budget;
  for (const base of ["https://api.frankfurter.dev/v1/", "https://api.frankfurter.app/"]) {
    const left = until - Date.now(); if (left < 300) break;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), left);
    try {
      const res = await fetch(`${base}${d}?from=${cur}&to=INR`, { signal: ctl.signal });
      if (!res.ok) continue;
      const j = await res.json(), r = j?.rates?.INR;
      if (r) { try { localStorage.setItem(key, String(r)); } catch {} return { rate: r }; }
    } catch {} finally { clearTimeout(timer); }
  }
  // offline / too slow: newest rate we already have for this currency
  let best = null;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), m = /^exp:fx:([A-Z]{3}):(\d{4}-\d{2}-\d{2})$/.exec(k || ""); if (m && m[1] === cur && (!best || m[2] > best.date)) best = { date: m[2], rate: +localStorage.getItem(k) }; } } catch {}
  return best ? { rate: best.rate, stale: best.date } : { rate: null };
}
export const fxRate = async (cur, date) => (await fxRateInfo(cur, date)).rate;
