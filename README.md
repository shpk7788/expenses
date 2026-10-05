# Palli — app.snyp.io

A personal expense tracker modelled on Expensify, built for India.

**Home** — month spend (counts up), overall + per-category budgets with "₹/day left" and over-budget alerts, to-dos (receipts to review, possible duplicates, money friends owe you, reports to claim), recent expenses.
**Create (+)** — Fast manual entry (amount → merchant → Enter; date chips; extras under "More details"), Scan receipts (several at once; saved instantly and read in the background, photo + line items kept), Manual (any currency, converted to ₹ at that day's rate), Distance (km × ₹/km, round trips), Split with friends (equal or exact), New report.
**Spend** — search across merchants, items, notes, tags and friends; filters for date (incl. Indian financial year), category, payment method, amount, receipt, report, type, status; bulk select → recategorise / add to report / export / delete. Calendar (any month of any year) and Insights (day/week/month/year/FY/custom).
**Expense detail** — receipt photo, every field editable, itemised receipt with tax & charges, duplicate warnings, notes + automatic change history.
**Reports** — group expenses, Open → Submitted → Reimbursed, CSV and printable PDF with receipt photos.
**Splits** — balances per friend, settle up, UPI payment requests.
**Account** — username/password sync across devices, budget, default currency, UPI ID, distance rates, theme, learned categories, CSV import/export.

## Importing bank statements and SMS
- **Account → Import statement or SMS** (or **+ → Import**): bank statements (PDF, Excel, CSV; locked PDFs ask for the password), Google Pay / PhonePe / Paytm statement PDFs, pasted bank SMS, or a Palli CSV backup. Everything is parsed on the device (`js/importer.js`), sorted into categories, checked for duplicates, and shown for review before anything is saved.
- **Shared into Palli**: on Android (installed app) share a bank SMS or statement file to Palli; or open `https://app.snyp.io/?sms=<text>`.
- **Automatic bank alerts**: run the "automatic bank alerts" part of `supabase/schema.sql`, then Account → Automatic bank alerts. An iPhone Shortcuts automation or an Android SMS forwarder posts each alert to `rpc/ingest_sms` with a private token; Palli shows "N new bank alerts" for one-tap review.

## Stack
Plain HTML/CSS/ES modules (no build). Supabase for auth, data (`expenses` table, row-level security) and receipt photos (private `receipts` bucket). Receipt OCR runs on-device with Tesseract.js. Merchant list from OpenStreetMap's name-suggestion-index + curated Indian brands (`tools/build_stores.py`).

## Setup
Run `supabase/schema.sql` in the Supabase SQL editor, turn off *Confirm email*, and put the project URL + publishable key in `config.js`.

## Testing
End-to-end suite (Playwright, mocked Supabase/FX/OCR CDN) covers every feature on 320/390/768/1280px in light and dark: `node full.mjs <width> <light|dark> <label>`.
