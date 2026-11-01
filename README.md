# Cosmetics Shop POS — offline progressive web app

Sales, receipts, stock, purchases, expenses, credit, advances, orders, cash book and reports for a cosmetics shop (UGX).
**Works completely offline.** There is no server, no account and no cloud: records stay on the device.

Plain HTML/CSS/JavaScript, no build step. Everything the app needs is in this folder.

## Put it on GitHub Pages (about 5 minutes)
All files are in ONE folder (no sub-folders), so the GitHub web uploader accepts them.
1. On github.com create a new repository (e.g. `shop-pos`).
2. Click **Add file → Upload files**, select **all the files** inside the unzipped folder (not the zip itself) and **Commit changes**.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
4. After 1-2 minutes open `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/` on the phone while online, then Chrome menu → **Install app** / **Add to Home screen**. After that it opens with no internet.

Never upload backup files (`.json`, backup PDFs, `.zip`) to a public repository: they contain your sales.

## Pages
- **Home** – today's sales and profit, 7-day chart, items to reorder, shortcuts.
- **Sell** – cart, cash / Mobile Money / credit, receipts (A4 or 58 mm), sales history.
- **Stock** – products, prices, stock levels and values, price list.
- **Money** – purchases, expenses, credit, advances, suppliers, orders, journal, cash book.
- **Reports** – daily and monthly profit and cash reports.
- **Setup** – shop details, receipt look, lists, backup and restore, Excel export.

## Share / download records (PDF and CSV)
| Where | What |
|---|---|
| Sell → *Share or download sales & receipts* | sales list and all receipts, for a date range, PDF or CSV |
| Stock → *Share or download stock* | full stock list or only items to reorder, PDF or CSV |
| Reports → *Share or download all shop records* | whole-shop PDF report, every table as CSV in one `.zip`, restorable backup `.json` |
| Any receipt window | that receipt as PDF or CSV |
| Setup | backup `.json` / backup PDF, restore from either, Excel export |

"Share" opens the phone's share sheet (WhatsApp, email, Drive). Where a device cannot share files, the file downloads instead.
CSV files are UTF-8 with BOM so Excel opens them correctly.

## Backups
Records live in the browser (localStorage plus an IndexedDB copy). Clearing the browser's site data erases them,
so download a backup every evening (Setup, or Reports → backup). Restore: **Setup → Restore from backup** (accepts `.json`, a backup PDF, or the `.json` inside the `.zip`).

## Publishing an update
Edit the files, then change `VERSION` in `sw.js` so phones fetch the new version. Phones update on the next open while online.

## Files
`index.html` · `app.css` · `app.js` (app) · `pdf.js` (PDF writer, receipts, reports) · `exports.js` (CSV, ZIP, share panels) ·
`finder.js` (search/filter) · `pwa.js` · `sw.js` (offline cache) · `xlsx.min.js` (SheetJS, Excel export) · `manifest.webmanifest` · icons (`icon*.png`, `icon.svg`, `apple-touch-icon.png`)

Brand colours are the CSS variables at the top of `app.css`.
