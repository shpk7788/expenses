# Expenses — app.snyp.io

A personal expense tracker modelled on Expensify, built for India.

**Home** — month spend, budget with "₹/day left", to-dos (receipts to review, possible duplicates, money friends owe you, reports to claim), recent expenses.
**Create (+)** — Scan receipts (several at once; saved instantly and read in the background, photo + line items kept), Manual (any currency, converted to ₹ at that day's rate), Distance (km × ₹/km, round trips), Split with friends (equal or exact), New report.
**Spend** — search across merchants, items, notes, tags and friends; filters for date (incl. Indian financial year), category, payment method, amount, receipt, report, type, status; bulk select → recategorise / add to report / export / delete. Calendar (any month of any year) and Insights (day/week/month/year/FY/custom).
**Expense detail** — receipt photo, every field editable, itemised receipt with tax & charges, duplicate warnings, notes + automatic change history.
**Reports** — group expenses, Open → Submitted → Reimbursed, CSV and printable PDF with receipt photos.
**Splits** — balances per friend, settle up, UPI payment requests.
**Account** — username/password sync across devices, budget, default currency, UPI ID, distance rates, theme, learned categories, CSV import/export.

## Stack
Plain HTML/CSS/ES modules (no build). Supabase for auth, data (`expenses` table, row-level security) and receipt photos (private `receipts` bucket). Receipt OCR runs on-device with Tesseract.js. Merchant list from OpenStreetMap's name-suggestion-index + curated Indian brands (`tools/build_stores.py`).

## Setup
Run `supabase/schema.sql` in the Supabase SQL editor, turn off *Confirm email*, and put the project URL + publishable key in `config.js`.
