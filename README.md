# Expenses

Personal expense tracker at https://app.snyp.io

- **Expenses** — grouped by month and day, budget with "left per day", search across stores, restaurants, notes and receipt items.
- **Calendar** — any month of any year (tap the title to jump), daily totals with heat shading, tap a day to see/add expenses.
- **Insights** — day / week / month / year / custom range: total vs previous period, trend chart, categories, top places, top receipt items, payment methods.
- **Receipts** — every expense has an itemised receipt (items, tax & charges, total, with a check that it adds up). Scan a photo to fill it in (on-device OCR).
- **Store search** — instant, offline list of ~1,350 brands (OpenStreetMap name-suggestion-index + curated Indian chains/apps). Delivery apps ask which restaurant.
- **Accounts & sync** — username + password; same data on every device. Offline-first: works without a connection and syncs later.

## Setup for sync
1. Create a Supabase project, turn off *Authentication → Email → Confirm email*.
2. Run `supabase/schema.sql` in the SQL editor.
3. Put the project URL and publishable/anon key in `config.js`.

Data model: one row per expense (`data` JSON), private per user via row-level security.
