// Turn bank SMS, UPI app statements and bank statements into transactions.
// Everything runs on-device; files never leave the phone.
import { norm, r2, pad } from "./util.js";
import { STORE_IDX, catFor } from "./cats.js";

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const AMT = String.raw`(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)`;
const monOf = (w) => { w = String(w).toLowerCase(); return MON[w.slice(0, 4)] || MON[w.slice(0, 3)] || 0; };
const num = (s) => parseFloat(String(s).replace(/[,₹\s]|rs\.?|inr/gi, ""));

/** Parse many Indian date styles → "YYYY-MM-DD" (DD/MM first, as Indian banks write them) */
export function parseDate(s, ref = new Date()) {
  if (!s) return null;
  s = String(s).trim();
  let m, y, mo, d;
  const fix = (yy) => (yy < 100 ? 2000 + yy : yy);
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s))) [d, mo, y] = [+m[1], +m[2], fix(+m[3])];
  else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-.]*([a-z]{3,9})[\s,\-.']*(\d{2,4})/i.exec(s)) && monOf(m[2])) { d = +m[1]; mo = monOf(m[2]); y = fix(+m[3]); }
  else if ((m = /^([a-z]{3,9})[\s.]+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(s)) && monOf(m[1])) { mo = monOf(m[1]); d = +m[2]; y = +m[3]; }
  else if (/^\d{5}(\.\d+)?$/.test(s)) { const dt = new Date(Math.round((+s - 25569) * 864e5)); return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`; } // Excel serial
  else return null;
  if (mo > 12 && d <= 12) [d, mo] = [mo, d];
  if (!(y > 1990 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
const findDate = (text) => {
  const pats = [/\b\d{4}-\d{1,2}-\d{1,2}\b/, /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/, /\b\d{1,2}[\s\-]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-,']*\d{2,4}\b/i, /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i];
  for (const p of pats) { const m = p.exec(text); if (m) { const d = parseDate(m[0]); if (d) return d; } }
  return null;
};

// ---------- merchant clean-up ----------
const BANKS = /^(yesb|hdfc|icic|sbin|utib|kkbk|punb|barb|idib|cnrb|ubin|indb|ioba|ucba|fdrl|kvbl|idfb|aubl|paytm|ybl|ibl|axl|okaxis|okhdfcbank|okicici|oksbi|apl|upi|p2m|p2a|dr|cr|pay|payment|collect|na|null|upiintent|sent using paytm upi)$/i;
const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Upi|Atm|Emi|Ltd|Pvt|Llp|Ola|Hdfc|Icici|Sbi|Lic)\b/g, w => w.toUpperCase().replace("LTD", "Ltd").replace("PVT", "Pvt").replace("LLP", "LLP").replace("OLA", "Ola"));
const brandByNorm = (() => { const list = STORE_IDX.filter(s => s.n.length >= 4).sort((a, b) => b.n.length - a.n.length); return list; })();
/** Known brand inside a messy narration ("SWIGGY LIMITED", "swiggy.instamart@ybl") */
export function knownBrand(text) {
  const n = norm(text);
  if (n.length < 3) return null;
  for (const s of brandByNorm) if (n.includes(s.n)) return s.name;
  return null;
}
const PERSONISH = /^[a-z]+(?:\s+[a-z]+){0,3}$/i;
/** "UPI/DR/4123/SWIGGY LIMITED/YESB/swiggy@ybl/Pay" → { name: "Swiggy", vpa, person } */
export function cleanMerchant(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim(), vpa = (/[a-z0-9][\w.]{1,}@[a-z]{2,}/i.exec(s) || [])[0] || "";
  const brand = knownBrand(s.replace(vpa, " ")) || (vpa && knownBrand(vpa.split("@")[0]));
  if (brand) return { name: brand, vpa, person: false };
  let core = s;
  if (/^(upi|by transfer-upi|to transfer-upi)/i.test(s) || /\bupi\b/i.test(s)) {
    const parts = s.split(/[\/\-]| {2,}/).map(p => p.trim()).filter(Boolean);
    const cand = parts.filter(p => /[a-z]{3,}/i.test(p) && !BANKS.test(p) && !/@/.test(p) && !/^\d+$/.test(p) && !/^(upi|by transfer|to transfer|transfer|dr|cr|p2m|p2a)$/i.test(p) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p));
    core = cand[0] || (vpa ? vpa.split("@")[0] : s);
  } else if (/^(pos|ecom|me dc|vps|vin|pur)\b/i.test(s)) {
    core = s.replace(/^(pos|ecom|me dc si|me dc|vps|vin|pur)\s*/i, "").replace(/^[x\d*]{4,}\s*/i, "").replace(/\s+(in|ind|india|mumbai|bangalore|bengaluru|delhi|chennai|hyderabad|pune|kolkata)\b.*$/i, "");
  } else if (/^(neft|imps|rtgs|nft|mmt)\b/i.test(s)) {
    const parts = s.replace(/^(neft|imps|rtgs|mmt)[\s\-\/]*(cr|dr|inb|ib)?\b/i, "").split(/[\/\-:]| {2,}/).map(p => p.trim()).filter(p => /[a-z]{3,}/i.test(p) && !/^(neft|imps|rtgs|nft|mmt|inb|ib|cr|dr|p2a)$/i.test(p) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p));
    core = parts[0] || s;
  } else if (/^(ach|nach|ecs)\b/i.test(s)) {
    core = s.replace(/^(ach|nach|ecs)[\s\-\/]*(d|dr|debit)?[\s\-\/]*/i, "").split(/[\/\-]/)[0];
  }
  if (/\b(atm|nwd|cash wdl|cash withdrawal|atw|eaw)\b/i.test(s)) return { name: "ATM cash withdrawal", vpa, person: false, cash: true };
  core = core.replace(/[@#*]+.*$/, "").replace(/\b\d{6,}\b/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 40);
  if (!core) core = vpa ? vpa.split("@")[0] : "Unknown";
  if (/^(paytmqr|bharatpe|q\d{6,}|mab\.|\d{9,})/i.test(core) || /^(paytmqr|bharatpe|q\d{6,})/i.test(vpa)) return { name: "Shop (UPI QR)", vpa, person: false };
  const person = !!vpa && /^(\d{10}|[a-z]+\.?[a-z]*\d*)$/i.test(vpa.split("@")[0]) && PERSONISH.test(core) && !knownBrand(core);
  return { name: core === core.toUpperCase() || core === core.toLowerCase() ? titleCase(core) : core, vpa, person };
}
const SKIP = [
  [/credit card (bill|payment|due)|cc (bill|payment)|^cc\s+\d|autopay si|bbps.*card|\bcred\b|card ?payment|autopay.*card/i, "Credit card bill — your card spends are tracked separately"],
  [/self transfer|own account|to self\b|sweep|fd booking|fixed deposit|recurring deposit|\brd\b inst/i, "Transfer between your own accounts"],
  [/mutual fund|\bsip\b|zerodha|groww|upstox|kuvera|coin by|nps|ppf|indmoney|smallcase/i, "Investment"],
];
const payFrom = (s) => /\bupi\b|@/i.test(s) ? "UPI" : /\b(pos|card|ecom|visa|mastercard|rupay|spent)\b/i.test(s) ? "Card" : /\b(neft|imps|rtgs|net ?banking|inb)\b/i.test(s) ? "Net banking" : /\batm|cash\b/i.test(s) ? "Cash" : undefined;

/** Final shape for every importer */
function txn({ date, amount, desc, dir, ref, source, pay }) {
  const m = cleanMerchant(desc), skip = dir === "in" ? "Money received" : (SKIP.find(([re]) => re.test(desc)) || [])[1];
  if (skip && /card/i.test(skip)) m.name = "Credit card bill";
  return { date, amount: r2(amount), desc: String(desc).replace(/\s+/g, " ").trim(), merchant: m.name, vpa: m.vpa, person: m.person, cash: m.cash, dir, ref: ref || "", source,
    pay: pay || (m.cash ? "Cash" : payFrom(desc)), skip: skip || null };
}

// ---------- SMS ----------
const SMS_DEBIT = /\b(debited|spent|sent|paid|withdrawn|purchase|txn of|transaction of|dr\b|debit)\b/i;
const SMS_CREDIT = /\b(credited|received|deposited|refund(ed)?|reversed|cashback)\b/i;
const SMS_NOISE = /\botp\b|one time password|will be debited|due on|is due|minimum amount due|requested money|collect request|declined|failed|unsuccessful|not processed|e-mandate|mandate .* created|available (bal|limit)[^.]*$/i;
/** Split a pasted blob into individual messages */
export function splitMessages(text) {
  const blocks = String(text).replace(/\r/g, "").split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
    const lines = b.split("\n").map(l => l.trim()).filter(Boolean);
    const amountLines = lines.filter(l => new RegExp(AMT, "i").test(l) && (SMS_DEBIT.test(l) || SMS_CREDIT.test(l)));
    if (amountLines.length > 1 && amountLines.length === lines.filter(l => new RegExp(AMT, "i").test(l)).length) out.push(...lines.filter(l => new RegExp(AMT, "i").test(l)));
    else out.push(lines.join(" "));
  }
  return out;
}
export function parseSms(text, ref = new Date()) {
  const res = [];
  for (const msg of splitMessages(text)) {
    if (SMS_NOISE.test(msg) && !/\b(debited|spent|sent)\b/i.test(msg.replace(/will be debited/i, ""))) continue;
    const amtM = new RegExp(AMT, "i").exec(msg) || /\b(?:debited|spent|sent|paid)\s+(?:by|for|of|with)?\s*([\d,]+\.\d{1,2})\b/i.exec(msg);
    if (!amtM) continue;
    const amount = num(amtM[1]); if (!(amount > 0)) continue;
    const isDebit = SMS_DEBIT.test(msg), isCredit = SMS_CREDIT.test(msg);
    if (!isDebit && !isCredit) continue;
    const dir = isDebit && (!isCredit || msg.search(SMS_DEBIT) < msg.search(SMS_CREDIT)) ? "out" : "in";
    // who: "to VPA x@y", "to NAME on", "at MERCHANT on", "trf to NAME", "; NAME credited", "Info: UPI/..."
    let who = "";
    const pats = [
      /\b(?:at|@)\s+([A-Za-z0-9&'.\- ]{2,40}?)\s+(?:on|via|using|for|\.|ref|avl|txn)\b/i,
      /\b(?:to|trf to|transfer to|towards)\s+(?:vpa\s+)?([A-Za-z0-9&'.@_\- ]{2,50}?)\s+(?:on|ref|upi|via|for|from|\.|\(|avl|txn|not you)/i,
      /;\s*([A-Za-z0-9&'.\- ]{2,40}?)\s+credited/i,
      /\b(?:info|desc|remarks?)[:\s]+([^.]{3,60})/i,
      /\b(upi\/(?:p2[am]|dr|cr)\/[^\s]+(?: [A-Z][A-Za-z&.]*){0,4})/i,
      /\b(?:from|by)\s+(?:vpa\s+)?([A-Za-z0-9&'.@_\- ]{2,50}?)\s+(?:on|ref|upi|via|\.|\(|avl)/i,
    ];
    for (const p of (dir === "in" ? [pats[5], pats[1], pats[3]] : pats.slice(0, 5))) { const m = p.exec(msg); if (m && !/^(your|a\/?c|ac|account|card|xx|x+\d+|\*+\d+|rs|inr)\b/i.test(m[1].trim())) { who = m[1].replace(/\s+(not you|call|sms|if not|avl|bal|info).*$/i, "").trim(); break; } }
    const refM = /\b(?:upi ref(?:\.? no)?|refno|ref(?:\.? no| no| id)?|rrn|txn id|utr|upi)[:.\s#-]*(\d{8,}|[A-Za-z0-9]*\d{6,}[A-Za-z0-9]*)/i.exec(msg);
    const date = findDate(msg) || `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-${pad(ref.getDate())}`;
    const t = txn({ date, amount, desc: who || msg.slice(0, 60), dir, ref: refM?.[1] || (/\b(\d{12})\b/.exec(msg) || [])[1], source: "sms", pay: /card|spent/i.test(msg) && !/upi/i.test(msg) ? "Card" : /upi|vpa|@/i.test(msg) ? "UPI" : undefined });
    t.raw = msg;
    res.push(t);
  }
  return res;
}

// ---------- statements ----------
/** Rows of cells (from Excel/CSV) → transactions, by finding the header row */
export function parseTable(rows, source = "bank") {
  rows = rows.map(r => r.map(c => (c == null ? "" : String(c).trim())));
  const isHead = (r) => { const t = r.join(" ").toLowerCase(); return /date/.test(t) && /(narration|description|particulars|remarks|details|transaction)/.test(t) && /(withdraw|debit|dr\b|amount|paid)/.test(t); };
  const h = rows.findIndex(isHead);
  if (h < 0) return [];
  const head = rows[h].map(c => c.toLowerCase());
  const col = (...res) => head.findIndex(c => res.some(re => re.test(c)));
  const cDate = col(/^(txn |transaction |value )?date/, /date/), cDesc = col(/narration|description|particulars|remarks|details|transaction details/);
  const cDr = col(/withdraw|debit|^dr\b|paid out|money out/), cCr = col(/deposit|credit|^cr\b|paid in|money in/), cAmt = col(/^amount|amount \(|txn amount|transaction amount/), cType = col(/^(dr\/cr|cr\/dr|type|debit\/credit)$/, /dr ?\/ ?cr|cr ?\/ ?dr/), cRef = col(/ref|chq|cheque|utr/);
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const date = parseDate(r[cDate]); if (!date) continue;
    let amount = 0, dir = "out";
    if (cDr >= 0 && num(r[cDr]) > 0) { amount = num(r[cDr]); dir = "out"; }
    else if (cCr >= 0 && num(r[cCr]) > 0) { amount = num(r[cCr]); dir = "in"; }
    else if (cAmt >= 0) {
      const raw = r[cAmt]; amount = Math.abs(num(raw));
      const t = cType >= 0 ? r[cType].toLowerCase() : "";
      dir = /cr|credit|in/.test(t) || /\bcr\b|^\+/i.test(raw) ? "in" : /dr|debit|out/.test(t) || /\bdr\b|^-|^\(/i.test(raw) ? "out" : "out";
    }
    if (!(amount > 0)) continue;
    out.push(txn({ date, amount, desc: r[cDesc] || "", dir, ref: cRef >= 0 ? r[cRef] : "", source }));
  }
  return out;
}

/** Text lines from a PDF statement → transactions (bank, Google Pay, PhonePe, Paytm) */
export function parseStatementLines(lines, source = "bank") {
  const text = lines.join("\n");
  // --- UPI apps: "Paid to X ... ₹480" style, grouped by date blocks ---
  if (/paid to|received from|google pay|phonepe|paytm/i.test(text) && /(paid to|received from|money sent to)/i.test(text)) {
    const out = [], blocks = []; let cur = null;
    for (const l of lines) {
      const d = findDate(l);
      if (d && (/^\s*(\d{1,2}[\s\-]?[a-z]{3}|[a-z]{3}\s+\d{1,2}|\d{1,2}[\/\-.]\d{1,2})/i.test(l))) { cur = { date: d, lines: [l] }; blocks.push(cur); }
      else if (cur) cur.lines.push(l);
    }
    for (const b of blocks) {
      const t = b.lines.join(" ");
      const m = /(paid to|money sent to|sent to|received from|transfer to|bill paid to|recharge of)\s+(.+?)\s+(?:(debit|credit|dr|cr)\b|₹|rs\.?|inr|upi transaction|transaction id|paid by|\d+:\d+)/i.exec(t);
      const a = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(t);
      if (!m || !a) continue;
      const dir = /received from/i.test(m[1]) || /\b(credit|cr)\b/i.test(m[3] || "") ? "in" : "out";
      const refM = /(?:upi transaction id|transaction id|utr(?: no)?)[:\s]*([A-Za-z0-9]{8,})/i.exec(t);
      out.push(txn({ date: b.date, amount: num(a[1]), desc: m[2], dir, ref: refM?.[1], source: source === "bank" ? "upi-app" : source, pay: "UPI" }));
    }
    if (out.length) return out;
  }
  // --- bank statements: lines starting with a date, ending in amounts (+ balance) ---
  const out = []; let prevBal = null, pending = null;
  const AM = /-?[\d,]+\.\d{2}(?:\s*(?:cr|dr))?/gi;
  const flush = () => { if (pending) { out.push(pending.t); pending = null; } };
  for (const l of lines) {
    const dm = /^\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\-][a-z]{3}[\s\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(l);
    const amts = (l.match(AM) || []).map(x => ({ v: num(x.replace(/cr|dr/i, "")), cr: /cr/i.test(x), dr: /dr/i.test(x) }));
    if (dm && amts.length) {
      flush();
      const date = parseDate(dm[1]); if (!date) continue;
      let desc = l.slice(dm[0].length).replace(AM, " ").replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, " ").replace(/\s{2,}/g, "  ").trim();
      let amount, dir, bal = null;
      if (amts.length >= 2) { bal = amts[amts.length - 1].v; amount = amts[amts.length - 2].v; }
      else amount = amts[0].v;
      const last = amts[amts.length >= 2 ? amts.length - 2 : 0];
      if (last.dr) dir = "out"; else if (last.cr && amts.length === 1) dir = "in";
      else if (prevBal != null && bal != null) dir = bal < prevBal - 0.001 ? "out" : "in";
      else dir = /\b(cr|credit|deposit|salary|refund|received|by transfer|neft cr|imps cr|upi\/cr)\b/i.test(desc) ? "in" : "out";
      if (bal != null) prevBal = bal;
      if (!(amount > 0)) continue;
      pending = { t: txn({ date, amount, desc, dir, source }) };
    } else if (pending && !dm && !/opening balance|closing balance|page \d|statement|account (no|number)|^date\b/i.test(l) && l.length < 120) {
      pending.t = txn({ ...pending.t, desc: `${pending.t.desc} ${l}` });   // narration wrapped onto the next line
    }
  }
  flush();
  return out;
}

/** Categorise, flag duplicates against what's already in the app, and pick defaults */
export function prepare(txns, { existing = [], rules = {} } = {}) {
  const seen = new Map();
  for (const e of existing) { const k = `${e.amount}`; (seen.get(k) || seen.set(k, []).get(k)).push(e); }
  const refs = new Set(existing.map(e => e.src?.ref).filter(Boolean));
  const uniq = new Map();
  for (const t of txns) {
    const key = `${t.date}|${t.amount}|${t.ref || norm(t.desc)}|${t.dir}`;
    if (uniq.has(key)) continue; uniq.set(key, t);
    t.cat = t.cash ? "other" : t.person ? "other" : catFor(t.merchant, rules);
    const near = (seen.get(`${t.amount}`) || []).find(e => Math.abs((new Date(e.date) - new Date(t.date)) / 864e5) <= 1);
    t.dup = (t.ref && refs.has(t.ref)) || !!near;
    t.dupOf = near?.what;
    t.on = t.dir === "out" && !t.skip && !t.dup;
  }
  return [...uniq.values()].sort((a, b) => b.date.localeCompare(a.date));
}
