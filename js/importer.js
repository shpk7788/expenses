// Turn bank SMS, UPI app statements and bank statements into transactions.
// Everything runs on-device; files never leave the phone.
import { norm, r2, pad } from "./util.js";
import { STORE_IDX, catFor } from "./cats.js";

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONRE = "jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec";
const AMT = String.raw`(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)`;
const amtRe = () => new RegExp(AMT, "i");
const monOf = (w) => { w = String(w).toLowerCase(); return MON[w.slice(0, 4)] || MON[w.slice(0, 3)] || 0; };
/** "1,234.50", "(250.00)", "-250", "Dr 400.00", "400.00 Cr", "₹ 1,240" → signed number (NaN if none) */
export const num = (s) => {
  s = String(s ?? "").trim();
  const neg = /^\(.*\)$/.test(s) || /^(?:₹|rs\.?|inr)?\s*-/i.test(s);
  const v = parseFloat(s.replace(/\b(?:rs\.?|inr|dr|cr)\b|[₹,\s()+\-]/gi, ""));
  return isNaN(v) ? NaN : neg ? -v : v;
};
const valid = (y, mo, d) => y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && new Date(y, mo - 1, d).getDate() === d;
const iso = (y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`;
const ymdOf = (dt) => iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());

/** Parse many Indian date styles → "YYYY-MM-DD" (DD/MM first, as Indian banks write them) */
export function parseDate(s) {
  if (s == null || s === "") return null;
  s = String(s).trim();
  let m, y, mo, d;
  const fix = (yy) => (yy < 100 ? 2000 + yy : yy);
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?![\d:])/.exec(s))) [d, mo, y] = [+m[1], +m[2], fix(+m[3])];
  else if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-.]*(${MONRE})[a-z]*[\\s,\\-.']*(\\d{4}|\\d{2})(?![\\d:])`, "i").exec(s))) { d = +m[1]; mo = monOf(m[2]); y = fix(+m[3]); }
  else if ((m = new RegExp(`^(${MONRE})[a-z]*[\\s.]+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "i").exec(s))) { mo = monOf(m[1]); d = +m[2]; y = +m[3]; }
  else if (/^\d{5}(\.\d+)?$/.test(s)) { const dt = new Date(Math.round((+s - 25569) * 864e5)); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); } // Excel serial
  else return null;
  if (mo > 12 && d <= 12) [d, mo] = [mo, d];
  return valid(y, mo, d) ? iso(y, mo, d) : null;
}
/** First date inside free text; "05 Oct" without a year takes the year of `ref` (never in the future) */
export function findDate(text, ref = new Date()) {
  const pats = [/\b\d{4}-\d{1,2}-\d{1,2}\b/, /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:\d{4}|\d{2})(?![\d:])/, new RegExp(`\\b\\d{1,2}[\\s\\-]?(?:${MONRE})[a-z]*[\\s\\-,']*(?:\\d{4}|\\d{2})(?![\\d:])`, "i"), new RegExp(`\\b(?:${MONRE})[a-z]*\\s+\\d{1,2},?\\s+\\d{4}\\b`, "i")];
  for (const p of pats) { const m = p.exec(text); if (m) { const d = parseDate(m[0]); if (d) return d; } }
  const m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-]?(${MONRE})[a-z]*\\b`, "i").exec(text);
  if (m) {
    let y = ref.getFullYear(); const mo = monOf(m[2]), d = +m[1];
    if (valid(y, mo, d) && iso(y, mo, d) > ymdOf(new Date(ref.getTime() + 864e5))) y--;
    if (valid(y, mo, d)) return iso(y, mo, d);
  }
  return null;
}

// ---------- merchant clean-up ----------
const BANKS = /^(yesb|hdfc|icic|sbin|utib|kkbk|punb|barb|idib|cnrb|ubin|indb|ioba|ucba|fdrl|kvbl|idfb|aubl|paytm|ybl|ibl|axl|okaxis|okhdfcbank|okicici|oksbi|apl|upi|p2m|p2a|dr|cr|pay|payment|collect|na|null|upiintent|sent using paytm upi)$/i;
const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Upi|Atm|Emi|Hdfc|Icici|Sbi|Lic|Llp)\b/g, w => w.toUpperCase());
// Brand names are matched as whole words only ("Subash" is a person, not "Ba&sh").
// Global brands whose names are ordinary words or first names are left out unless the name is long and distinctive.
const STOP = new Set(["more", "metro", "hero", "max", "only", "next", "pink", "coach", "giant", "lotus", "relay", "wash", "loop", "sonic", "steam", "paul", "ram", "emma", "ora", "man", "me", "ip", "hp", "lg", "mg", "bp", "glo", "bene", "bosco", "tata", "titan", "jet", "vib", "trek", "tribe", "seat", "mini", "shell", "spar", "taj", "roots", "lucid", "omega", "oxxo", "tous", "typo", "voco", "alua", "honda"]);
const BRAND = new Map(), BRAND_LONG = [];
for (const s of STORE_IDX) {
  if (s.n.length < 3 || STOP.has(s.n) || BRAND.has(s.n)) continue;
  if (!s.india && s.n.length < 7) continue;
  BRAND.set(s.n, s.name);
  if (s.n.length >= 6) BRAND_LONG.push(s.n);
}
const tokens = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
/** Known brand inside a messy narration ("SWIGGY LIMITED", "swiggy.instamart@ybl") — whole words only */
export function knownBrand(text) {
  const tk = tokens(String(text).slice(0, 300)).filter(t => !BANKS.test(t));
  let best = null, len = 0;
  for (let i = 0; i < tk.length; i++) {
    let j = "";
    for (let k = i; k < Math.min(tk.length, i + 5); k++) { j += tk[k]; const b = BRAND.get(j); if (b && j.length > len) { best = b; len = j.length; } }
    if (tk[i].length > 6) for (const n of BRAND_LONG) if (n.length > len && tk[i].startsWith(n)) { best = BRAND.get(n); len = n.length; } // "swiggyinstamart", "zomatoonline"
  }
  return best;
}
const BUSINESS = /\b(stores?|mart|traders?|trading|enterprises?|agenc(y|ies)|ltd|limited|pvt|private|llp|inc|company|hotels?|restaurants?|foods?|bakery|bakers|cafe|medicals?|pharma(cy)?|hospitals?|clinic|services?|solutions|tech|technologies|industries|motors|automobiles|textiles?|silks?|jewell?ers?|sweets|mess|bhavan|corner|cent(re|er)|shop(pe)?|supermarket|provisions?|general|kirana|stall|fuels?|petroleum|filling|station|travels|tours|cabs?|digital|online|payments?|india|retail|fashions?|collections?|electronics|mobiles?|hardware|associates|works|school|college|academy|institute|trust|society|foundation|bank|finance|insurance|gym|fitness|salon|parlou?r|spa|studio|labs?|diagnostics|tiffin|canteen|juice|bar|wines?|liquor|chicken|mutton|fish|meat|vegetables?|fruits?|milk|dairy|water|gas|electricity|recharge|bill)\b/i;
const PERSONISH = /^[a-z]+\.?(?:\s+[a-z]+\.?){0,3}$/i;
const MERCHANT_VPA = /^(q\d|paytmqr|bharatpe|gpay-\d|mab\.|merchant|pos\.|upiqr|razorpay|rzp|cashfree|payu|billdesk|ccavenue|\d{12,})/i;
/** Does this look like a person's name (UPI transfer to someone) rather than a shop? */
export function looksLikePerson(name, vpa = "") {
  name = String(name || "").trim();
  if (!PERSONISH.test(name) || name.length < 3 || BUSINESS.test(name) || knownBrand(name)) return false;
  if (vpa && MERCHANT_VPA.test(vpa.split("@")[0])) return false;
  return catFor(name, {}) === "other";
}
/** "UPI/DR/4123/SWIGGY LIMITED/YESB/swiggy@ybl/Pay" → { name: "Swiggy", vpa, person } */
export function cleanMerchant(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const vpa = (/[a-z0-9][\w.]{0,63}@[a-z]{2,20}\b/i.exec(s) || [])[0] || "";
  const brand = knownBrand(s.replace(vpa, " ")) || (vpa && knownBrand(vpa.split("@")[0].replace(/[._]/g, " ")));
  if (brand) return { name: brand, vpa, person: false };
  if (/\b(atm|nwd|cash wdl|cash withdrawal|atw|eaw)\b/i.test(s)) return { name: "ATM cash withdrawal", vpa, person: false, cash: true };
  let core = s;
  if (/^(upi|by transfer-upi|to transfer-upi)/i.test(s) || /\bupi\b/i.test(s)) {
    const parts = s.split(/[\/\-]| {2,}/).map(p => p.trim()).filter(Boolean);
    const cand = parts.filter(p => /[a-z]{3,}/i.test(p) && !BANKS.test(p) && !/@/.test(p) && !/^\d+$/.test(p) && !/^(upi|by transfer|to transfer|transfer|dr|cr|p2m|p2a|payment from ph|payment from|sent using)$/i.test(p) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p));
    core = cand[0] || (vpa ? vpa.split("@")[0] : s);
  } else if (/^(pos|ecom|me dc|vps|vin|pur)\b/i.test(s)) {
    core = s.replace(/^(pos|ecom|me dc si|me dc|vps|vin|pur)\s*/i, "").replace(/^[x\d*]{4,}\s*/i, "").replace(/\s+(in|ind|india|mumbai|bangalore|bengaluru|delhi|chennai|hyderabad|pune|kolkata)\b.*$/i, "");
  } else if (/^(neft|imps|rtgs|nft|mmt)\b/i.test(s)) {
    const parts = s.replace(/^(neft|imps|rtgs|mmt)[\s\-\/]*(cr|dr|inb|ib)?\b/i, "").split(/[\/\-:]| {2,}/).map(p => p.trim()).filter(p => /[a-z]{3,}/i.test(p) && !/^(neft|imps|rtgs|nft|mmt|inb|ib|cr|dr|p2a)$/i.test(p) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p));
    core = parts[0] || s;
  } else if (/^(ach|nach|ecs)\b/i.test(s)) {
    core = s.replace(/^(ach|nach|ecs)[\s\-\/]*(d|dr|debit)?\b[\s\-\/]*/i, "").split(/[\/\-]/)[0];
  }
  core = core.replace(/^(?:(?:imps|neft|upi|rtgs)\s+)?(?:received from|paid to|sent to|money sent to|transfer(?:red)? (?:to|from)|by|to)\s+/i, "").replace(/[@#*]+.*$/, "").replace(/\b[x*\d]{6,}\b/gi, "").replace(/\s{2,}/g, " ").trim().slice(0, 40);
  if (!core) core = vpa ? vpa.split("@")[0] : "Unknown";
  if (/^(paytmqr|bharatpe|q\d{6,}|mab\.|\d{9,})/i.test(core) || /^(paytmqr|bharatpe|q\d{6,})/i.test(vpa)) return { name: "Shop (UPI QR)", vpa, person: false };
  const name = core === core.toUpperCase() || core === core.toLowerCase() ? titleCase(core) : core;
  return { name, vpa, person: looksLikePerson(core, vpa) };
}
const SKIP = [
  [/credit card (bill|payment|due)|cc (bill|payment)|^cc\s+\d|autopay si|bbps.*card|\bcred\b|card ?payment|autopay.*card/i, "Credit card bill — your card spends are tracked separately"],
  [/self transfer|own account|to self\b|sweep|fd booking|fixed deposit|recurring deposit|\brd\b inst/i, "Transfer between your own accounts"],
  [/mutual fund|\bsip\b|zerodha|groww|upstox|kuvera|coin by|\bnps\b|\bppf\b|indmoney|smallcase/i, "Investment"],
];
const payFrom = (s) => /\bupi\b|@/i.test(s) ? "UPI" : /\b(pos|card|ecom|visa|mastercard|rupay|spent)\b/i.test(s) ? "Card" : /\b(neft|imps|rtgs|net ?banking|inb)\b/i.test(s) ? "Net banking" : /\batm|cash\b/i.test(s) ? "Cash" : undefined;

/** Final shape for every importer. `raw` is the whole source text (for skip rules); `desc` names the other side. */
function txn({ date, amount, desc, raw, dir, ref, source, pay, bal }) {
  desc = String(desc || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const m = cleanMerchant(desc), all = `${desc} ${raw || ""}`;
  const skip = dir === "in" ? "Money received" : (SKIP.find(([re]) => re.test(all)) || [])[1];
  if (skip && /card/i.test(skip)) m.name = "Credit card bill";
  if (!ref) ref = (/\b(\d{12})\b/.exec(all) || [])[1];   // UPI RRN
  return { date, amount: r2(Math.abs(amount)), desc, merchant: m.name, vpa: m.vpa, person: m.person, cash: m.cash, dir, ref: ref || "", source,
    pay: pay || (m.cash ? "Cash" : payFrom(all)), skip: skip || null, ...(bal != null ? { bal } : {}) };
}

// ---------- SMS ----------
const SMS_DEBIT = /\b(debited|spent|sent|paid|paying|withdrawn|purchase|txn of|transaction of|payment of|dr\b|debit)\b/i;
const SMS_CREDIT = /\b(credited|received|deposited|refund(ed)?|reversed|reversal|cashback)\b/i;
const SMS_NOISE = /\botp\b|one time password|verification code|will be debited|to be debited|due on|is due|due date|minimum amount due|requested money|collect request|has requested|declined|failed|unsuccessful|not processed|could not be|mandate .*(created|registered)|e-mandate|reminder/i;
export const isNoiseSms = (msg) => SMS_NOISE.test(msg);
/** Split a pasted blob into individual messages: blank lines separate messages, and so does any line that starts a new payment */
export function splitMessages(text) {
  const out = [];
  for (const b of String(text).replace(/\r/g, "").split(/\n\s*\n+/)) {
    let cur = null;
    for (const l of b.split("\n").map(x => x.trim()).filter(Boolean)) {
      const starts = amtRe().test(l) && (SMS_DEBIT.test(l) || SMS_CREDIT.test(l) || SMS_NOISE.test(l));
      if (!cur || (starts && cur.hasAmt)) { cur = { lines: [l], hasAmt: amtRe().test(l) }; out.push(cur); }
      else { cur.lines.push(l); cur.hasAmt ||= amtRe().test(l); }
    }
  }
  return out.map(c => c.lines.join(" ").slice(0, 1000));
}
export function parseSms(text, ref = new Date()) {
  const res = [];
  for (const msg of splitMessages(text)) {
    if (SMS_NOISE.test(msg)) continue;
    const plain = msg.replace(/\b(debit|credit)\s+card\b/gi, "card");
    const amtM = amtRe().exec(msg) || /\b(?:debited|spent|sent|paid|withdrawn)\s+(?:by|for|of|with)?\s*([\d,]+\.\d{1,2})\b/i.exec(msg);
    if (!amtM) continue;
    const amount = num(amtM[1]); if (!(amount > 0)) continue;
    const isDebit = SMS_DEBIT.test(plain), isCredit = SMS_CREDIT.test(plain);
    if (!isDebit && !isCredit) continue;
    const dir = /\b(refund(ed)?|reversed|reversal|cashback)\b/i.test(plain) ? "in" : isDebit && (!isCredit || plain.search(SMS_DEBIT) < plain.search(SMS_CREDIT)) ? "out" : "in";
    // who: "at MERCHANT on", "to VPA x@y", "trf to NAME", "; NAME credited", "Info: UPI/...", "UPI/P2A/../NAME"
    const END = String.raw`(?=\s+(?:on|at|via|using|for|from|ref|refno|upi|avl|bal|txn|not you|if not|info)\b|\s*[.(]|\s*$)`;
    const pats = [
      new RegExp(String.raw`\b(?:at|@)\s+([A-Za-z0-9&'.\- ]{2,40}?)` + END, "i"),
      new RegExp(String.raw`\b(?:to|trf to|transfer to|towards)\s+(?:vpa\s+)?([A-Za-z0-9&'.@_\- ]{2,50}?)` + END, "i"),
      /;\s*([A-Za-z0-9&'.\- ]{2,40}?)\s+credited/i,
      /\b(?:info|desc|remarks?)[:\s]+([^.]{3,60})/i,
      /\b(upi\/(?:p2[am]|dr|cr)\/[^\s]+(?: [A-Z][A-Za-z&.]*){0,4})/i,
      new RegExp(String.raw`\b(?:from|by)\s+(?:vpa\s+)?([A-Za-z0-9&'.@_\- ]{2,50}?)` + END, "i"),
    ];
    let who = "";
    const body = msg.replace(/\b(not you|not u\b|if not|call \d|call us|sms block|to block|to report|report).*$/i, "");
    for (const p of (dir === "in" ? [pats[5], pats[1], pats[3]] : [pats[0], pats[4], pats[2], pats[1], pats[3]])) {
      const m = p.exec(body);
      if (m && !/^(your|a\/?c|ac|account|card|xx|x+\d+|\*+\d+|rs|inr|bank|\d[\d\s-]*$)/i.test(m[1].trim())) { who = m[1].replace(/\s+(not you|call|sms|if not|avl|bal|info).*$/i, "").trim(); break; }
    }
    const vpa = (/[a-z0-9][\w.]{0,63}@[a-z]{2,20}\b/i.exec(msg) || [])[0];
    const refM = /\b(?:upi ref(?:\.? no)?|refno|ref(?:\.? no| no| id)?|rrn|txn id|utr|upi)[:.\s#-]*(\d{8,}|[A-Za-z0-9]*\d{6,}[A-Za-z0-9]*)/i.exec(msg);
    const card = /card|spent/i.test(plain) && !/upi/i.test(msg);
    const t = txn({ date: findDate(msg, ref) || ymdOf(ref), amount, desc: who || vpa || (card ? "Card payment" : "UPI payment"), raw: msg, dir, ref: refM?.[1], source: "sms", pay: card ? "Card" : /upi|vpa|@/i.test(msg) ? "UPI" : undefined });
    t.raw = msg;
    res.push(t);
  }
  return res;
}

// ---------- statements ----------
const BALROW = /opening balance|closing balance|\bb\/f\b|brought forward|carried forward|balance forward|\bc\/f\b/i;
/** Rows of cells (from Excel/CSV) → transactions, by finding the header row */
export function parseTable(rows, source = "bank") {
  rows = rows.map(r => r.map(c => (c == null ? "" : String(c).trim())));
  const isHead = (r) => { const t = r.join(" ").toLowerCase(); return /date/.test(t) && /(narration|description|particulars|remarks|details|transaction)/.test(t) && /(withdraw|debit|dr\b|amount|paid)/.test(t); };
  const h = rows.findIndex(isHead);
  if (h < 0) return [];
  const head = rows[h].map(c => c.toLowerCase().trim()), used = new Set();
  const col = (...res) => { const i = head.findIndex((c, i) => !used.has(i) && res.some(re => re.test(c))); if (i >= 0) used.add(i); return i; };
  const cType = col(/^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|debit\s*\/\s*credit|credit\s*\/\s*debit|txn type|transaction type)$/);
  const cDate = col(/^(txn |transaction |tran |posting )?date/, /date/);
  col(/value date|value dt/);
  const cDr = col(/withdraw|debit|^dr\b|paid out|money out/), cCr = col(/deposit|credit|^cr\b|paid in|money in/);
  const cAmt = col(/^amount|amount\s*\(|txn amount|transaction amount|^amt/), cBal = col(/balance/);
  let cDesc = col(/narration|description|particulars|remarks|details/);
  const cRef = col(/ref|chq|cheque|utr/);
  const body = rows.slice(h + 1);
  if (cDesc < 0) { // e.g. a column just called "Transaction": the free-text column with the most text
    let best = -1, bl = 0;
    head.forEach((_, i) => { if (used.has(i)) return; const l = body.reduce((s, r) => s + (isNaN(num(r[i])) ? (r[i] || "").length : 0), 0); if (l > bl) { bl = l; best = i; } });
    cDesc = best;
  }
  const signed = cAmt >= 0 && body.some(r => num(r[cAmt]) < 0);
  const out = [];
  for (const r of body) {
    const date = parseDate(r[cDate]); if (!date) continue;
    const desc = cDesc >= 0 ? r[cDesc] : "";
    if (BALROW.test(desc)) continue;
    let amount = 0, dir = "out";
    const dr = cDr >= 0 ? Math.abs(num(r[cDr])) : NaN, cr = cCr >= 0 ? Math.abs(num(r[cCr])) : NaN;
    if (dr > 0) { amount = dr; dir = "out"; }
    else if (cr > 0) { amount = cr; dir = "in"; }
    else if (cAmt >= 0) {
      const raw = r[cAmt], v = num(raw), t = cType >= 0 ? r[cType].toLowerCase().trim() : "";
      amount = Math.abs(v);
      if (t) dir = /^(c|cr|credit|deposit|in)\b/.test(t) ? "in" : "out";
      else if (/\bcr\b/i.test(raw)) dir = "in";
      else if (/\bdr\b/i.test(raw)) dir = "out";
      else if (signed) dir = v < 0 ? "out" : "in";
      else dir = "out";
    }
    if (!(amount > 0)) continue;
    const bal = cBal >= 0 ? num(r[cBal]) : NaN;
    out.push(txn({ date, amount, desc, dir, ref: cRef >= 0 ? r[cRef] : "", source, ...(isNaN(bal) ? {} : { bal }) }));
  }
  return out;
}

const UPI_APP = /(paid to|money sent to|sent to|received from|transfer to|bill paid to|bill paid for|recharge of|mobile recharged|recharged|self transfer to)\s+(.+?)\s+(?:(debit|credit|dr|cr)\b|₹|\brs\.?\s*\d|\binr\s*\d|upi transaction|transaction id|utr|paid by|\d{1,2}:\d{2}|$)/i;
function parseUpiApp(lines, source) {
  const blocks = []; let cur = null;
  const startRe = new RegExp(`^\\s*(\\d{1,2}[\\s\\-]?(?:${MONRE})|(?:${MONRE})[a-z]*\\s+\\d{1,2}|\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})`, "i");
  for (const l of lines) {
    const d = startRe.test(l) && findDate(l);
    if (d) { cur = { date: d, lines: [l] }; blocks.push(cur); }
    else if (cur && cur.lines.length < 8) cur.lines.push(l);
  }
  const out = [];
  for (const b of blocks) {
    const t = b.lines.join("  ");
    const m = UPI_APP.exec(t);
    const a = /₹\s*([\d,]+(?:\.\d{1,2})?)/.exec(t) || /(?:\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)\b/i.exec(t);
    if (!m || !a) continue;
    const dir = /received from/i.test(m[1]) || /\b(credit|cr)\b/i.test(m[3] || "") ? "in" : "out";
    const refM = /(?:upi transaction id|transaction id|utr(?: no)?\.?)[:\s]*([A-Za-z0-9]{8,})/i.exec(t);
    const desc = /recharge/i.test(m[1]) ? `Mobile recharge ${m[2]}` : m[2];
    out.push(txn({ date: b.date, amount: num(a[1]), desc, raw: t, dir, ref: refM?.[1], source, pay: "UPI" }));
  }
  return { out, blocks: blocks.length };
}

// amounts like 1,234.56 / 250.00 Cr / (250.00) — never pieces of dates such as 03.10.2026
const AM = /(?<![\d.\/:\-])\(?-?\d[\d,]*\.\d{2}\)?(?:\s?(?:cr|dr)\b)?(?![\d\/.])/gi;
const DATE_TOKEN = new RegExp(`\\b\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}\\b|\\b\\d{1,2}[\\s\\-](?:${MONRE})[a-z]*[\\s\\-,]+\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, "gi");
const LINE_DATE = new RegExp(`^\\s*(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{1,2}[\\s\\-](?:${MONRE})[a-z]*[\\s\\-,]+\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`, "i");
const FOOTER = /page \d|statement|total|generated|computer|this is a|disclaimer|terms|interest|branch|customer|address|ifsc|micr|nomination|summary|registered|gstin|toll free|call us|www\.|http|e-?mail|important|note:|^date\b|abbreviation|legend|^\s*\*/i;

/** Text lines from a PDF statement → transactions (bank, Google Pay, PhonePe, Paytm) */
export function parseStatementLines(lines, source = "bank") {
  lines = lines.map(l => String(l).slice(0, 400));
  // --- UPI apps: "Paid to X … ₹480" blocks that start with a date ---
  if (source !== "bank" || lines.some(l => /\b(paid to|received from)\b/i.test(l))) {
    const { out, blocks } = parseUpiApp(lines, source === "bank" ? "upi-app" : source);
    if (out.length && (source !== "bank" || out.length >= Math.max(2, blocks * 0.6))) return out;
  }
  // --- bank statements: one row per date; amounts at the end (withdrawal / deposit / balance) ---
  const rows = []; let row = null, openBal = null;
  const finish = () => { if (row && row.amts) rows.push(row); row = null; };
  for (const l of lines) {
    const dm = LINE_DATE.exec(l);
    const rest = dm ? l.slice(dm[0].length) : l;
    const clean = rest.replace(DATE_TOKEN, " ");
    const amts = (clean.match(AM) || []).map(x => ({ v: Math.abs(num(x.replace(/cr|dr/i, ""))), cr: /cr\b/i.test(x), dr: /dr\b/i.test(x) }));
    const text = clean.replace(AM, " ").replace(/\s{2,}/g, "  ").trim();
    if (BALROW.test(l)) { finish(); if (amts.length && openBal == null && /opening|b\/f|brought/i.test(l)) openBal = amts[amts.length - 1].v; continue; }
    if (dm) {
      finish();
      const date = parseDate(dm[1]); if (!date) continue;
      row = { date, parts: text ? [text] : [], amts: amts.length ? amts : null };
    } else if (row && !row.amts && amts.length) {           // date on one line, amounts on the next
      row.amts = amts; if (text) row.parts.push(text);
    } else if (row && row.amts && !amts.length && text && row.parts.length < 4 && l.length < 120 && !FOOTER.test(l)) {
      row.parts.push(text);                                    // narration wrapped onto the next line
    } else if (row && (FOOTER.test(l) || amts.length)) finish();
  }
  finish();
  // amount, balance and any explicit direction per row
  for (const r of rows) {
    const a = r.amts;
    r.bal = a.length >= 2 ? a[a.length - 1].v : null;
    const pre = a.length >= 2 ? a.slice(0, -1) : a;
    const nz = pre.map((x, i) => ({ ...x, i })).filter(x => x.v > 0);
    const pick = nz[nz.length - 1] || pre[pre.length - 1];
    r.amount = pick ? pick.v : 0;
    r.dir = pick?.dr ? "out" : pick?.cr ? "in" : null;
    if (!r.dir && pre.length === 2 && nz.length === 1) r.dir = nz[0].i === 0 ? "out" : "in";   // withdrawal | deposit columns with a 0.00
  }
  // work out direction from the running balance, whichever order the statement is printed in
  const fits = (prev, r) => prev == null || r.bal == null ? null : Math.abs(prev - r.amount - r.bal) < 0.011 ? "out" : Math.abs(prev + r.amount - r.bal) < 0.011 ? "in" : null;
  let fwd = 0, rev = 0;
  for (let i = 1; i < rows.length; i++) { if (fits(rows[i - 1].bal, rows[i])) fwd++; }
  for (let i = 0; i < rows.length - 1; i++) { if (fits(rows[i + 1].bal, rows[i])) rev++; }
  const newestFirst = rev > fwd;
  const out = [];
  rows.forEach((r, i) => {
    if (!(r.amount > 0)) return;
    const prevBal = newestFirst ? rows[i + 1]?.bal ?? null : i ? rows[i - 1].bal : openBal;
    const desc = r.parts.join(" ");
    const dir = fits(prevBal, r) || r.dir || (/\b(cr|credit|deposit|salary|refund|received|by transfer|neft cr|imps cr|upi\/cr|interest paid)\b/i.test(desc) ? "in" : "out");
    out.push(txn({ date: r.date, amount: r.amount, desc, dir, source, ...(r.bal != null ? { bal: r.bal } : {}) }));
  });
  return out;
}

const close = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a.includes(b.slice(0, 5)) || b.includes(a.slice(0, 5))); };
const dayGap = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
/** Categorise, flag duplicates against what's already in the app, and pick defaults */
export function prepare(txns, { existing = [], rules = {}, people = {} } = {}) {
  // within one import: only collapse rows we can prove are the same (same UPI ref, same SMS, same running balance)
  const uniq = new Map(), list = [];
  for (const t of txns) {
    const key = t.ref ? `r|${t.ref}|${t.amount}|${t.dir}` : t.raw ? `s|${norm(t.raw)}` : t.bal != null ? `b|${t.date}|${t.amount}|${t.bal}` : null;
    if (key && uniq.has(key)) continue;
    if (key) uniq.set(key, t);
    list.push(t);
  }
  // against expenses already in Palli: each existing expense can match at most one imported row
  const pool = new Map();
  for (const e of existing) { const k = r2(e.amount); (pool.get(k) || pool.set(k, []).get(k)).push(e); }
  const refs = new Map(existing.filter(e => e.src?.ref).map(e => [e.src.ref, e]));
  const used = new Set();
  for (const t of list) {
    // people you've told Palli about ("Subash" → "Gym trainer Subash", Health)
    const who = people[norm(t.merchant)];
    if (who) { if (who.name) t.merchant = who.name; t.knownPerson = true; }
    t.cat = rules[norm(t.merchant)] || (t.cash || (t.person && !who) ? "other" : catFor(t.merchant, rules));
    if (t.dir !== "out") { t.on = false; continue; }
    let hit = t.ref && refs.get(t.ref);
    if (hit && used.has(hit.id)) hit = null;
    if (!hit) {
      const c = (pool.get(r2(t.amount)) || []).filter(e => !used.has(e.id) && !(t.ref && e.src?.ref && e.src.ref !== t.ref));   // different UPI refs = different payments
      hit = c.find(e => e.date === t.date) || c.find(e => dayGap(e.date, t.date) <= 1 && (close(e.what, t.merchant) || close(e.what, t.desc)));
    }
    if (hit) { used.add(hit.id); t.dup = true; t.dupOf = hit.what; }
    t.on = !t.skip && !t.dup;
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
