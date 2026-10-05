// Boot, routing, navigation, global event wiring.
import { $, LS, I, LOGO, esc, plural, countUp, moneyHero } from "./util.js";
import { Api } from "./api.js";
import * as St from "./store.js";
import { toast, sheet, go, anySheet, whenSettled } from "./ui.js";
import { openCreate, resumeScans } from "./create.js";
import * as V from "./views.js";
import * as V2 from "./views2.js";
import * as IV from "./importview.js";

const TABS = [["home", "Home", I.home], ["spend", "Spend", I.spend], ["create"], ["reports", "Reports", I.reports], ["account", "Account", I.account]];
function drawNav() {
  const r = route().name, badge = St.expenses().filter(e => e.status === "review" || e.status === "failed").length + St.duplicates().size + St.S.inbox.length;
  $("nav").innerHTML = `<div class="nav-in"><div class="brand"><span class="logo">${LOGO}</span><h1>Palli</h1></div>${TABS.map(([k, l, ic]) => k === "create"
    ? `<button type="button" class="nav-create" id="navCreate" aria-label="Create">${I.plus}<span class="lbl">Create</span></button>`
    : `<a class="nav-tab" href="#/${k}" ${r === k || (k === "spend" && r === "expense") || (k === "reports" && r === "report") || (k === "home" && r === "splits") || (k === "account" && r === "import") ? 'aria-current="page"' : ""}>${ic}<span>${l}</span>${k === "home" && badge ? `<span class="badge">${badge}</span>` : ""}</a>`).join("")}</div>`;
}
function route() {
  const h = location.hash.replace(/^#\/?/, ""), [path, qs = ""] = h.split("?"), [name = "home", id] = path.split("/");
  return { name: name || "home", id, params: new URLSearchParams(qs) };
}
let current = null, navs = 0;
function render() {
  const r = route();
  if (current && current !== r.name && current === "spend") V.leaveSpend();
  if (current === "import" && r.name !== "import") IV.leaveImport();
  if (r.name === "spend" && (current !== "spend" || render._nav)) V.spendParams(r.params);
  render._nav = false;
  const changed = current !== r.name || r.id !== render._id;
  current = r.name; render._id = r.id;
  // keep typing state through re-renders
  const a = document.activeElement, keep = a && a.id && $("view").contains(a) ? { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
  const y = scrollY;
  switch (r.name) {
    case "spend": V.spend(); break;
    case "expense": V.detail(r.id); break;
    case "reports": V2.reports(); break;
    case "report": V2.report(r.id); break;
    case "splits": V2.splits(); break;
    case "account": V2.account(); break;
    case "import": IV.importView(r.params); break;
    default: V.home();
  }
  drawNav();
  document.title = { home: "Palli", spend: "Spend · Palli", expense: "Expense · Palli", reports: "Reports · Palli", report: "Report · Palli", splits: "Splits · Palli", account: "Account · Palli", import: "Import · Palli" }[r.name] || "Palli";
  if (changed) { scrollTo(0, 0); const v = $("view"); v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter"); clearTimeout(render._t); render._t = setTimeout(() => v.classList.remove("enter"), 700); } else scrollTo(0, y);
  // totals count up when they change
  document.querySelectorAll("#view [data-count]").forEach(el => { const to = +el.dataset.count, key = r.name + el.className, from = render._counts?.[key] ?? (changed ? 0 : to); (render._counts ||= {})[key] = to; countUp(el, to, moneyHero, from); });
  if (keep) { const el = $(keep.id); if (el && "value" in el) { if (el.value !== keep.v) el.value = keep.v; el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
}
addEventListener("hashchange", () => { navs++; render._nav = true; render(); });
St.on(() => { if (!$("app").hidden) render(); });

// ---- delegated events ----
$("view").addEventListener("click", async (ev) => {
  const g = ev.target.closest("[data-go]");
  if (g && !ev.target.closest("[data-settle-with], [data-d], [data-edit]")) { ev.preventDefault(); go(g.dataset.go); return; }
  const back = ev.target.closest("[data-back]");
  if (back) { navs > 0 ? history.back() : go(back.dataset.back); return; }
  const r = route();
  if (r.name === "home") V.homeClick(ev);
  if (r.name === "spend" && V.spendClick(ev)) return;
  if (r.name === "expense" && await V.detailClick(ev, r.id)) return;
  if (r.name === "reports" && V2.reportsClick(ev)) return;
  if (r.name === "report" && await V2.reportClick(ev, r.id)) return;
  if (r.name === "splits" && await V2.splitsClick(ev)) return;
  if (r.name === "account" && await V2.accountClick(ev)) return;
  if (r.name === "import" && await IV.importClick(ev)) return;
  const row = ev.target.closest(".erow[data-id]");
  if (row) go(`#/expense/${row.dataset.id}`);
});
$("view").addEventListener("input", (ev) => { const n = route().name; if (n === "spend") V.spendInput(ev); if (n === "import") IV.importInput(ev); });
$("view").addEventListener("keydown", (ev) => { if (route().name === "import") IV.importKey(ev); });
$("view").addEventListener("change", (ev) => { const r = route(); if (r.name === "expense") V.detailChange(ev, r.id); if (r.name === "spend") V.insChange(ev); if (r.name === "report") V2.reportChange(ev, r.id); });
$("view").addEventListener("submit", (ev) => { const r = route(); if (r.name === "expense") V.detailSubmit(ev, r.id); if (r.name === "import") IV.importSubmit(ev); });
$("nav").addEventListener("click", (ev) => {
  if (ev.target.closest("#navCreate")) { const r = route(); openCreate(r.name === "report" ? { reportId: r.id, pickExisting: () => V2.pickExpenses(r.id) } : {}); return; }
});
// Route every in-app link through go(), so a panel that is still closing can't undo the navigation
document.addEventListener("click", (ev) => {
  const a = ev.target.closest('a[href^="#/"]'); if (!a || ev.defaultPrevented || ev.metaKey || ev.ctrlKey) return;
  if (anySheet()) { ev.preventDefault(); go(a.getAttribute("href")); }
}, true);

// ---- auth gate ----
function gate(detail) {
  const needAuth = Api.configured && !Api.user && !LS.get("exp:guestMode", false);
  $("auth").hidden = !needAuth; $("app").hidden = needAuth;
  if (needAuth) { V2.authScreen(); setTimeout(() => $("aUser")?.focus(), 50); return; }
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/home");
  render();
  if (detail?.guest && Api.user) whenSettled(() => offerAdopt(detail.guest));
}
function offerAdopt(n) {
  const s = sheet({ title: "Bring your expenses along?", center: true, body: `<p style="margin:0">You added <b>${plural(n, "expense")}</b> on this device before signing in. Add them to <b>${esc(Api.user.username)}</b> so they're backed up and on every device?</p>`,
    foot: `<button class="btn secondary" data-x>Not now</button><button class="btn primary" id="adOk">Add them</button>` });
  s.el.querySelector("#adOk").onclick = () => { const c = St.adoptGuest(); s.close(); toast(`Added ${plural(c, "expense")} to your account`); };
}
addEventListener("app:auth", (e) => gate(e.detail));
addEventListener("api:loggedout", () => { St.switchSpace(); gate(); toast("Please sign in again"); });

// ---- boot ----
// a bank SMS shared into Palli (Android share sheet, or an iPhone Shortcut opening ?sms=…)
{
  const q = new URLSearchParams(location.search), txt = q.get("sms") || [q.get("title"), q.get("text")].filter(Boolean).join("\n");
  if (txt.trim()) { sessionStorage.setItem("exp:sharedSms", txt); history.replaceState(null, "", location.pathname + "#/import"); }
  else if (q.has("shared")) history.replaceState(null, "", location.pathname + "#/import?file=1");
}
St.load(); St.applyTheme();
gate();
resumeScans();
if (Api.user) { St.syncNow(); St.loadPrefs().catch(() => {}); St.checkInbox(); }
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
window.__app = { St, Api };
