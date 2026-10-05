# Expenses

A simple expense tracker at https://app.snyp.io

- Add what it was for and the amount; the date defaults to today.
- Tap any expense to edit it.
- Store search is instant and offline: your own history plus a built-in list of ~1,350 brands
  (each brand once). The list comes from OpenStreetMap's name-suggestion-index plus a curated
  list of Indian chains and apps — regenerate with `tools/build_stores.py`.
- Scan a receipt photo to fill in store, amount, date and the line items (on-device OCR with Tesseract.js).
  Expenses with items show a receipt icon that opens the itemised list.
- Data is stored in your browser (localStorage). Use Export CSV to back up, Import to restore.
