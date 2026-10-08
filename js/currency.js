// Currency picking for the expense and money-in sheets: quick chips for the currencies you use, auto rate to ₹.
import { esc, money, today, dShort, I } from "./util.js";
import { CURRENCIES, CUR_NAMES, AUTO_FX } from "./cats.js";
import { pickList } from "./ui.js";
import { fxRateInfo } from "./media.js";

// "HK$", "CN¥", "A$" — never a bare "$" that could be mistaken for US dollars
export const sym = (c) => { try { const v = new Intl.NumberFormat("en", { style: "currency", currency: c, currencyDisplay: "symbol" }).formatToParts(0).find(p => p.type === "currency").value; return v === c ? `${c} ` : v; } catch { return `${c} `; } };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const recentCurs = () => read("exp:recentCur", []);
/** Remember a currency you just used (travel: it stays the default for 2 days) */
export function rememberCur(c, def = "INR") {
  if (!c) return;
  if (c !== "INR") write("exp:recentCur", [c, ...recentCurs().filter(x => x !== c)].slice(0, 4));
  const l = read("exp:lastCur", null), fresh = l && l.c === c && Date.now() - l.t < 48 * 36e5;
  write("exp:lastCur", c === def ? null : { c, t: Date.now(), n: fresh ? (l.n || 1) + 1 : 1 });
}
export const forgetTrip = () => { try { localStorage.removeItem("exp:lastCur"); } catch {} };
/** Currency a new entry starts in: on a trip (2+ entries in the same foreign currency within 2 days) that one, else your default */
export function startCur(def = "INR") { const l = read("exp:lastCur", null); return l && (l.n || 1) >= 2 && Date.now() - l.t < 48 * 36e5 ? l.c : def; }

/** Wire up the currency button, quick chips and the "≈ ₹" line. state = { cur, rate, def }; onChange(cur, rate) */
export function mountCurrency({ btn, chips, conv, amt, dateInput, state, onChange }) {
  const label = (c) => sym(c).trim() === c ? esc(c) : `${esc(sym(c))} ${esc(c)}`;
  const drawBtn = () => { btn.innerHTML = `<span>${label(state.cur)}</span>${I.down}`; btn.setAttribute("aria-label", `Currency: ${CUR_NAMES[state.cur] || state.cur}. Change`); };
  const drawChips = () => {
    if (!chips) return;
    const list = [...new Set(["INR", state.def, ...recentCurs(), state.cur].filter(Boolean))].slice(0, 5);
    chips.innerHTML = list.map(c => `<button type="button" class="chip cur-chip" data-cur="${c}" aria-pressed="${c === state.cur}">${label(c)}</button>`).join("")
      + `<button type="button" class="chip cur-chip" data-cur="__more">${I.globe}<span>Other currency</span></button>`;
  };
  const amount = () => parseFloat(amt.value) || 0;
  const drawConv = async (fetchRate) => {
    if (state.cur === "INR") { conv.hidden = true; conv.innerHTML = ""; return; }
    conv.hidden = false;
    if (fetchRate || !state.rate) {
      conv.innerHTML = `<span>Getting the ${esc(state.cur)} → ₹ rate…</span>`;
      const asked = state.cur, info = AUTO_FX.has(asked) ? await fxRateInfo(asked, dateInput?.value || today()) : { rate: null };
      if (asked !== state.cur) return;   // switched again meanwhile
      if (info.rate) state.rate = info.rate;
      state.stale = info.rate && info.stale ? info.stale : null;
    }
    conv.innerHTML = `<span>≈ <b>${money(amount() * (state.rate || 0))}</b> at</span><input id="fRate" class="fx-rate" type="number" inputmode="decimal" step="0.0001" min="0" value="${state.rate ? +(+state.rate).toFixed(4) : ""}" placeholder="rate" aria-label="Exchange rate to rupees"><span>₹ per ${esc(state.cur)}${!state.rate ? (AUTO_FX.has(state.cur) ? " — couldn't get today's rate, enter it" : " — enter the rate") : ""}</span>${state.stale ? `<small class="fx-stale">No connection — using your last ${esc(state.cur)} rate (${esc(dShort(state.stale))}). Edit it if needed.</small>` : ""}`;
    conv.querySelector(".fx-rate").oninput = (ev) => { conv.querySelector(".fx-stale")?.remove(); state.rate = parseFloat(ev.target.value) || null; conv.querySelector("b").textContent = money(amount() * (state.rate || 0)); onChange?.(state.cur, state.rate); };
    onChange?.(state.cur, state.rate);
  };
  const setCur = (c) => { if (!c || c === state.cur) return; state.cur = c; state.rate = null; drawBtn(); drawChips(); onChange?.(c, null); drawConv(true); };
  const pickOther = async () => {
    const v = await pickList({ title: "Currency", value: state.cur, search: true, options: CURRENCIES.map(c => ({ value: c, label: sym(c).trim() === c ? c : `${sym(c)} ${c}`, sub: CUR_NAMES[c] + (c !== "INR" && !AUTO_FX.has(c) ? " · enter rate yourself" : "") })) });
    setCur(v);
  };
  btn.onclick = pickOther;
  chips?.addEventListener("click", (ev) => { const b = ev.target.closest("[data-cur]"); if (!b) return; b.dataset.cur === "__more" ? pickOther() : setCur(b.dataset.cur); });
  amt.addEventListener("input", () => { const b = conv.querySelector("b"); if (b) b.textContent = money(amount() * (state.rate || 0)); });
  dateInput?.addEventListener("change", () => { if (state.cur !== "INR" && AUTO_FX.has(state.cur)) drawConv(true); });
  drawBtn(); drawChips();
  if (state.cur !== "INR") drawConv(!state.rate);
  return { setCur };
}
