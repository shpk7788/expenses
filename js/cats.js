// Categories, merchant database, payment methods, currencies.
import { norm } from "./util.js";

export const CATS = [
  ["food", "Food & dining", "🍔", "#f97316"], ["groceries", "Groceries", "🛒", "#22c55e"], ["shopping", "Shopping", "🛍️", "#a855f7"],
  ["transport", "Transport", "🚕", "#3b82f6"], ["fuel", "Fuel", "⛽", "#ef4444"], ["bills", "Bills & utilities", "💡", "#eab308"],
  ["rent", "Rent & EMI", "🏦", "#0ea5e9"], ["entertainment", "Entertainment", "🎬", "#ec4899"], ["health", "Health", "💊", "#14b8a6"],
  ["travel", "Travel", "✈️", "#06b6d4"], ["personal", "Personal care", "💇", "#f43f5e"], ["home", "Home", "🏠", "#84cc16"],
  ["education", "Education", "📚", "#6366f1"], ["gifts", "Gifts & donations", "🎁", "#d946ef"], ["services", "Services", "🧰", "#64748b"],
  ["other", "Other", "🧾", "#94a3b8"],
].map(([id, name, emoji, color]) => ({ id, name, emoji, color }));
export const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
export const cat = (id) => CAT[id] || CAT.other;

export const PAYS = ["UPI", "Card", "Cash", "Net banking", "Wallet"];

// ECB-backed (auto rate) currencies first, then manual-rate ones
export const AUTO_FX = new Set(["USD", "EUR", "GBP", "SGD", "THB", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "MYR", "IDR", "NZD", "KRW", "PHP", "SEK", "NOK", "DKK", "ZAR", "TRY", "PLN", "CZK", "HUF", "ILS", "MXN", "BRL"]);
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "THB", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "MYR", "IDR", "LKR", "NPR", "SAR", "QAR", "OMR", "KWD", "BHD", "VND", "NZD", "KRW", "PHP", "ZAR", "TRY", "SEK", "NOK", "DKK", "BDT", "MVR"];
export const CUR_NAMES = { INR: "Indian rupee", USD: "US dollar", EUR: "Euro", GBP: "British pound", AED: "UAE dirham", SGD: "Singapore dollar", THB: "Thai baht", JPY: "Japanese yen", AUD: "Australian dollar", CAD: "Canadian dollar", CHF: "Swiss franc", CNY: "Chinese yuan", HKD: "Hong Kong dollar", MYR: "Malaysian ringgit", IDR: "Indonesian rupiah", LKR: "Sri Lankan rupee", NPR: "Nepalese rupee", SAR: "Saudi riyal", QAR: "Qatari riyal", OMR: "Omani rial", KWD: "Kuwaiti dinar", BHD: "Bahraini dinar", VND: "Vietnamese dong", NZD: "New Zealand dollar", KRW: "South Korean won", PHP: "Philippine peso", ZAR: "South African rand", TRY: "Turkish lira", SEK: "Swedish krona", NOK: "Norwegian krone", DKK: "Danish krone", BDT: "Bangladeshi taka", MVR: "Maldivian rufiyaa" };

// ---- merchants (stores.js: [name, category label, india-flag]) ----
const STORE_CAT = {};
[["food", "Food delivery,Restaurant,Fast food,Cafe,Dessert,Bakery,Pastry,Confectionery,Chocolate,Tea,Coffee,Food court,Deli,Bar,Pub,Ice cream"],
 ["groceries", "Groceries,Dairy,Greengrocer,Butcher,Seafood,Supermarket,Convenience,General,Alcohol,Beverages,Health food,Frozen food,Spices"],
 ["fuel", "Fuel,Charging station,Car wash"], ["transport", "Transport,Bicycle rental,Car rental"],
 ["travel", "Travel,Hotel,Travel agency,Motel,Hostel,Guest house"], ["bills", "Bills & utilities,Gas"],
 ["entertainment", "Entertainment,Cinema,Video,Video games,Bowling alley,Amusement arcade"],
 ["health", "Pharmacy,Health,Fitness,Optician,Laboratory,Nutrition supplements,Medical supply,Clinic,Hospital,Dentist,Doctors,Sports centre,Hearing aids"],
 ["personal", "Personal care,Cosmetics,Hairdresser,Beauty,Perfumery,Laundry,Dry cleaning,Massage"],
 ["home", "Furniture,Houseware,Doityourself,Paint,Kitchen,Interior decoration,Appliance,Bed,Vacuum cleaner,Groundskeeping,Hardware,Garden centre,Lighting,Bathroom furnishing,Curtain,Flooring"],
 ["education", "Books,Stationery,Newsagent"], ["services", "Services"], ["gifts", "Gift"]]
  .forEach(([c, list]) => list.split(",").forEach(n => STORE_CAT[n] = c));

export const STORE_IDX = (window.STORES || []).map(([name, label, india]) => ({ name, label, india, n: norm(name), words: name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) }));
const STORE_BY = new Map(STORE_IDX.map(s => [s.n, s]));
export const FOOD_PLACE = new Set(["Restaurant", "Fast food", "Cafe", "Dessert", "Bakery", "Pastry", "Food court", "Confectionery", "Chocolate", "Deli", "Tea"]);
const DELIVERY = new Set(["swiggy", "zomato", "eatsure", "magicpin", "ubereats", "eatclub"]);
STORE_IDX.forEach(s => { if (s.label === "Food delivery") DELIVERY.add(s.n); });
export const isDelivery = (m) => DELIVERY.has(norm(m));

const KEYWORDS = [
  ["rent", /\b(rent|emi|loan|mortgage|society|maintenance)\b/i],
  ["bills", /\b(electric|electricity|water|gas|wifi|wi-fi|internet|broadband|recharge|bill|insurance|dth|postpaid|prepaid)\b/i],
  ["transport", /\b(uber|ola|auto|rickshaw|cab|taxi|metro|bus|train|parking|toll|rapido)\b/i],
  ["fuel", /\b(petrol|diesel|fuel|cng)\b/i],
  ["groceries", /\b(grocer|groceries|vegetables?|veggies|milk|fruits?|kirana|eggs)\b/i],
  ["food", /\b(lunch|dinner|breakfast|coffee|tea|chai|snacks?|food|biryani|pizza|burger|restaurant|cafe|dosa|meal)\b/i],
  ["entertainment", /\b(movie|cinema|netflix|concert|game|games|subscription)\b/i],
  ["health", /\b(doctor|medicine|medicines|pharma|pharmacy|hospital|gym|clinic|dental|lab test)\b/i],
  ["personal", /\b(salon|haircut|spa|parlour|parlor|laundry)\b/i],
  ["education", /\b(books?|course|tuition|school|college|fees|exam)\b/i],
  ["travel", /\b(flight|hotel|trip|holiday|vacation|airbnb)\b/i],
  ["gifts", /\b(gift|donation|charity|temple|wedding)\b/i],
  ["home", /\b(maid|cook|furniture|repair|plumber|electrician)\b/i],
  ["shopping", /\b(clothes|shoes|shirt|dress|amazon|flipkart)\b/i],
];
// rules: user-learned { normMerchant: catId }
export function catFor(merchant, rules = {}) {
  const n = norm(merchant);
  if (!n) return "other";
  if (rules[n] && CAT[rules[n]]) return rules[n];
  let s = STORE_BY.get(n);
  if (!s) { // "Starbucks NYC", "DMart Koramangala" → longest known brand at the start
    const words = merchant.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (let k = words.length - 1; k >= 1 && !s; k--) { const pre = norm(words.slice(0, k).join("")); if (pre.length >= 3) s = STORE_BY.get(pre); }
  }
  if (s) return STORE_CAT[s.label] || "shopping";
  for (const [c, re] of KEYWORDS) if (re.test(merchant)) return c;
  return "other";
}

export function rankStores(q, { filter = null, exclude = new Set(), limit = 7 } = {}) {
  const nq = norm(q), ql = q.toLowerCase().trim(), scored = [];
  if (!nq) return [];
  for (const s of STORE_IDX) {
    if (exclude.has(s.n) || (filter && !filter(s))) continue;
    const score = s.n === nq ? -1 : s.n.startsWith(nq) ? 0 : s.words.some(w => w.startsWith(ql) || w.startsWith(nq)) ? 1
      : nq.length >= 3 && s.words.some(w => w.includes(nq)) ? 2 : null;
    if (score === null) continue;
    scored.push([score * 2 + (s.india ? 0 : 1), s]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  return scored.slice(0, limit).map(([, s]) => ({ name: s.name, sub: s.label }));
}
