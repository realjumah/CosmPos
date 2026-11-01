/* exports.js — share or download sales, stock, receipts and the whole shop as PDF or CSV.
 * Everything is made on the phone (no internet, no outside library).
 *
 *   X.panel(kind)          HTML for the "Share or download" panel on a page   kind = 'sales' | 'stock' | 'all'
 *   X.go(name, share)      run an export using the dates typed in the panel
 *   X.receiptCsv(id,share) one receipt as CSV (used by the receipt window)
 *
 * share = 1  -> open the phone's share sheet (WhatsApp, email, Drive ...). If the device cannot share files, it downloads.
 * share = 0  -> download the file.
 *
 * Data comes from the same `db` object the rest of the app uses. All CSV files are UTF-8 with a byte-order mark and
 * CRLF line ends so Excel, Google Sheets and LibreOffice open them correctly (names with accents, UGX amounts, ...).
 */
(function () {
'use strict';
const X = window.X = window.X || {};
const H = () => X._h;
const xo = { f: '', t: '', low: false, open: {} };            // panel state survives page re-draws

/* ------------------------------------------------------------------ CSV */
const SAFE_NUM = /^[+\-][\d\s().-]+$/;                           // phone numbers such as +256 700 123456 stay as typed
function cell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 100) / 100) : '';
  let s = String(v);
  if (/^[=@\t\r]/.test(s) || (/^[+\-]/.test(s) && !SAFE_NUM.test(s))) s = "'" + s;   // stop spreadsheet "formula" tricks
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const toCsv = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

/* ------------------------------------------------------------------ data sets (arrays of rows, first row = headings) */
const inR = (d, f, t) => (!f || (d || '') >= f) && (!t || (d || '') <= t);
const byDate = (a, b) => ((a.date || '') + (a.time || '')) < ((b.date || '') + (b.time || '')) ? -1 : ((a.date || '') + (a.time || '')) > ((b.date || '') + (b.time || '')) ? 1 : ((+a.no || a.id || 0) - (+b.no || b.id || 0));
const sales = (f, t) => db.S.filter(s => inR(s.date, f, t)).sort(byDate);
const balance = s => s.pay === 'Credit' ? Math.max(0, tot(s) - paid(s)) : 0;

const DS = {
  sales(f, t) {
    const r = [['Date', 'Time', 'Receipt no.', 'Customer', 'Served by', 'Payment method', 'Product', 'Quantity', 'Unit price (UGX)', 'Line total (UGX)', 'Unit cost (UGX)', 'Line cost (UGX)', 'Line profit (UGX)', 'Receipt total (UGX)', 'Paid so far (UGX)', 'Balance owed (UGX)']];
    sales(f, t).forEach(s => s.items.forEach(i => r.push([s.date, s.time || '', s.no, s.cust || 'Walk-in', s.by || '', s.pay, i.n, i.q, i.p, i.q * i.p, i.c, i.q * i.c, i.q * (i.p - i.c), tot(s), paid(s), balance(s)])));
    return r;
  },
  receipts(f, t) {
    const r = [['Date', 'Time', 'Receipt no.', 'Customer', 'Served by', 'Payment method', 'Items', 'Number of lines', 'Total (UGX)', 'Advance used (UGX)', 'Paid so far (UGX)', 'Balance owed (UGX)']];
    sales(f, t).forEach(s => r.push([s.date, s.time || '', s.no, s.cust || 'Walk-in', s.by || '', s.pay, s.items.map(i => i.n + ' x' + i.q + ' @ ' + fm(i.p)).join('; '), s.items.length, tot(s), s.advA || 0, paid(s), balance(s)]));
    return r;
  },
  receipt(s) {
    const r = [['Receipt no.', 'Date', 'Time', 'Customer', 'Served by', 'Payment method', 'Product', 'Quantity', 'Unit price (UGX)', 'Line total (UGX)']];
    s.items.forEach(i => r.push([s.no, s.date, s.time || '', s.cust || 'Walk-in', s.by || '', s.pay, i.n, i.q, i.p, i.q * i.p]));
    r.push([], ['', '', '', '', '', '', 'TOTAL', '', '', tot(s)]);
    if (s.advA) r.push(['', '', '', '', '', '', 'Advance used', '', '', s.advA]);
    if (s.pay === 'Credit') r.push(['', '', '', '', '', '', 'Paid so far', '', '', paid(s)], ['', '', '', '', '', '', 'Balance owed', '', '', balance(s)]);
    return r;
  },
  stock(low) {
    const m = stk(), inn = {}, sold = {};
    db.U.forEach(u => inn[u.n] = (inn[u.n] || 0) + u.q);
    db.S.forEach(s => s.items.forEach(i => sold[i.n] = (sold[i.n] || 0) + i.q));
    const r = [['Code', 'Product', 'Category', 'Unit', 'Opening stock', 'Stock in', 'Sold', 'In stock now', 'Reorder level', 'Status', 'Cost price now (UGX)', 'Selling price (UGX)', 'Profit per unit (UGX)', 'Stock value at cost (UGX)', 'Stock value at selling price (UGX)']];
    stockList(low).forEach(p => {
      const q = m[p.name] || 0, c = costNow(p);
      r.push([p.code || '', p.name, p.cat || '', p.unit || '', p.open || 0, inn[p.name] || 0, sold[p.name] || 0, q, p.re || 0, status(q, p), c, p.price, p.price - c, Math.max(q, 0) * c, Math.max(q, 0) * p.price]);
    });
    return r;
  },
  purchases(f, t) {
    return [['Date', 'Supplier', 'Product', 'Quantity', 'Unit cost (UGX)', 'Transport per unit (UGX)', 'Handling per unit (UGX)', 'Mobile Money charge (UGX)', 'Other costs (UGX)', 'True unit cost (UGX)', 'Total cost (UGX)', 'Bought on credit', 'Paid to supplier (UGX)', 'Still owed (UGX)']]
      .concat(db.U.filter(u => inR(u.date, f, t)).sort(byDate).map(u => [u.date, u.sup || '', u.n, u.q, u.c, u.tr || 0, u.hd || 0, u.mm || 0, u.oth || 0, ul(u), u.q * ul(u), u.cr ? 'Yes' : 'No', u.cr ? sum(u.pays || [], p => p.a) : u.q * u.c, sowed(u)]));
  },
  expenses(f, t) {
    return [['Date', 'Type', 'Description', 'Amount (UGX)']].concat(db.X.filter(x => inR(x.date, f, t)).sort(byDate).map(x => [x.date, x.type || '', x.desc || '', x.amt]));
  },
  customerPayments(f, t) {
    const r = [['Date paid', 'Receipt no.', 'Customer', 'Amount (UGX)']];
    db.S.filter(s => s.pay === 'Credit').forEach(s => (s.pays || []).forEach(p => { if (inR(p.d, f, t)) r.push([p.d, s.no, s.cust || '', p.a]); }));
    return r.slice(0, 1).concat(r.slice(1).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  },
  supplierPayments(f, t) {
    const r = [['Date paid', 'Supplier', 'Product', 'Amount (UGX)', 'Charge (UGX)']];
    db.U.forEach(u => (u.pays || []).forEach(p => { if (inR(p.d, f, t)) r.push([p.d, u.sup || '', u.n, p.a, p.f || 0]); }));
    return r.slice(0, 1).concat(r.slice(1).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  },
  advances(f, t) {
    return [['Date received', 'Customer', 'Goods reserved', 'Amount (UGX)', 'Used in sales (UGX)', 'Balance held (UGX)']]
      .concat(db.A.filter(a => inR(a.date, f, t)).sort(byDate).map(a => [a.date, a.cust, a.desc || '', a.amt, a.amt - abal(a), abal(a)]));
  },
  orders(f, t) {
    return [['Date ordered', 'Customer', 'Phone', 'Item ordered', 'Note', 'Status', 'Date arrived', 'Date collected']]
      .concat((db.O || []).filter(o => inR(o.date, f, t)).sort(byDate).map(o => [o.date, o.cust || '', o.tel || '', o.item || '', o.note || '', OS[OK.indexOf(o.st)] || '', o.arr || '', o.done || '']));
  },
  journal(f, t) {
    return [['Date', 'Product', 'Type', 'Amount (UGX)', 'Quantity deducted', 'Customer', 'Note']]
      .concat((db.J || []).filter(e => inR(e.date, f, t)).sort(byDate).map(e => [e.date, e.n, e.kind === 'out' ? 'Deducted from stock' : 'Money kept aside', e.kind === 'out' ? -e.amt : e.amt, e.q || '', e.cust || '', e.note || '']));
  },
  cashBook(f, t) {
    return [['Date', 'Opening cash (UGX)', 'Counted cash (UGX)', 'Expected cash (UGX)', 'Cash difference (UGX)', 'Note']]
      .concat((db.C || []).filter(z => inR(z.date, f, t)).sort(byDate).map(z => { const e = cbexp(z.date); return [z.date, z.co, z.cc, e.c, z.cc - e.c, z.note || '']; }));
  },
  ownerMoney(f, t) {
    return [['Date', 'What', 'Amount (UGX)', 'Note']]
      .concat((db.M || []).filter(z => inR(z.date, f, t) && !/^x/.test(z.kind)).sort(byDate).map(z => [z.date, KL[KK.indexOf(z.kind)] || z.kind, z.amt, z.desc || '']));
  },
  daily(f, t) {
    const ds = [...new Set([...db.S.map(s => s.date), ...db.X.map(x => x.date)])].filter(d => inR(d, f, t)).sort().reverse();
    return [['Date', 'Receipts', 'Cash sales (UGX)', 'Mobile Money sales (UGX)', 'Credit sales (UGX)', 'Total sales (UGX)', 'Cost of goods (UGX)', 'Gross profit (UGX)', 'Expenses (UGX)', 'Net profit (UGX)']]
      .concat(ds.map(d => { const ss = db.S.filter(s => s.date === d), b = p => sum(ss.filter(s => s.pay === p), tot), x = pl(d); return [d, x.n, b('Cash'), b('Mobile Money'), b('Credit'), x.t, x.c, x.g, x.e, x.net]; }));
  },
  products() {
    return [['Code', 'Product', 'Category', 'Unit', 'Opening stock', 'Reorder level', 'Cost price (UGX)', 'Selling price (UGX)', 'Transport per unit (UGX)', 'Handling per unit (UGX)']]
      .concat(db.P.map(p => [p.code || '', p.name, p.cat || '', p.unit || '', p.open || 0, p.re || 0, p.cost || 0, p.price || 0, p.tr || 0, p.hd || 0]));
  },
  shop() {
    const s = db.shop || {};
    return [['Setting', 'Value'], ['Shop name', s.name || ''], ['Address', s.addr || ''], ['Phone', s.tel || ''], ['Licence / registration no.', s.reg || ''], ['TIN', s.tin || ''], ['Owner / manager', s.mgr || ''], ['Exported on', new Date().toISOString()]];
  }
};
const status = (q, p) => q < 0 ? 'CHECK' : q === 0 ? 'OUT' : q <= (p.re || 0) ? 'REORDER' : 'OK';
function stockList(low) {
  const m = stk();
  return db.P.slice().sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.name.localeCompare(b.name)).filter(p => !low || (m[p.name] || 0) <= (p.re || 0));
}

/* ------------------------------------------------------------------ ZIP (store only, no compression, no library) */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], cen = [], d = new Date();
  const dt = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  let off = 0;
  files.forEach(f => {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(tm), ...u16(dt), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
    parts.push(lh, nm, f.data); cen.push({ nm, crc, sz, off }); off += lh.length + nm.length + sz;
  });
  const start = off;
  cen.forEach(c => {
    const h = new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(tm), ...u16(dt), ...u32(c.crc), ...u32(c.sz), ...u32(c.sz), ...u16(c.nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.off)]);
    parts.push(h, c.nm); off += h.length + c.nm.length;
  });
  parts.push(new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(cen.length), ...u16(cen.length), ...u32(off - start), ...u32(start), 0, 0]));
  return new Blob(parts, { type: 'application/zip' });
}

/* ------------------------------------------------------------------ send: share sheet or download */
let busy = false;
async function send(blob, name, share) {
  if (share) {
    try {
      const f = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    toast('Sharing is not available on this device — downloading instead');
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  toast('File downloaded ✓');
  return true;
}
async function job(label, fn) {
  if (busy) return; busy = true; toast('Preparing ' + label + '…');
  try { await fn(); } catch (e) { console.error(e); alert('Could not make the file: ' + (e && e.message || e)); }
  busy = false;
}
const slug = () => (db.shop.name || 'shop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'shop';
const label = (f, t) => (f || t) ? (f || 'start') + ' to ' + (t || 'today') : 'all dates';
const suffix = (f, t) => (f || t) ? (f || 'start') + '_to_' + (t || td()) : 'all-' + td();
const csvBlob = rows => new Blob([toCsv(rows)], { type: 'text/csv' });

/* ------------------------------------------------------------------ the exports */
const E = {
  salesCsv: (f, t, share) => job('sales CSV', () => send(csvBlob(DS.sales(f, t)), slug() + '-sales-' + suffix(f, t) + '.csv', share)),
  receiptsCsv: (f, t, share) => job('receipts CSV', () => send(csvBlob(DS.receipts(f, t)), slug() + '-receipts-' + suffix(f, t) + '.csv', share)),
  stockCsv: (f, t, share, low) => job('stock CSV', () => send(csvBlob(DS.stock(low)), slug() + (low ? '-reorder-list-' : '-stock-') + td() + '.csv', share)),

  salesPdf: (f, t, share) => job('sales PDF', async () => {
    const h = H(), logo = await h.logoJpeg(), lb = label(f, t), d = h.newA4('Sales ' + lb), ss = sales(f, t);
    h.letter(d, logo, 'Sales report', 'Period: ' + lb + '  ·  made ' + h.nowS());
    const by = p => sum(ss.filter(s => s.pay === p), tot), T = sum(ss, tot), C = sum(ss, cogs);
    d.h2('Summary · ' + lb);
    d.grid([['Total sales', T], ['Receipts', String(ss.length)], ['Cost of goods sold', C], ['Gross profit', T - C], ['Cash sales', by('Cash')], ['Mobile Money sales', by('Mobile Money')], ['Credit sales', by('Credit')]], 3);
    h.secProducts(d, ss);
    h.secSales(d, ss, 'Sales (receipts) · latest first');
    d.para('— End of report —', { size: 8, a: 'c', col: d.T.mut });
    await h.out(d.finish(null, { title: (db.shop.name || '') + ' — Sales ' + lb, author: db.shop.name }), slug() + '-sales-' + suffix(f, t) + '.pdf', share);
  }),

  receiptsPdf: (f, t, share) => job('receipts PDF', async () => {
    const h = H(), logo = await h.logoJpeg(), lb = label(f, t), ss = sales(f, t);
    const d = new h.Doc({ w: 419.53, h: 595.28, m: 30, foot: (db.shop.name || '') + '  ·  Receipts · ' + lb });
    if (!ss.length) d.para('No receipts in this period.', { size: 11, a: 'c', col: d.T.mut });
    ss.forEach((s, i) => { if (i) d.np(); h.rcBuild(d, s, logo, false); });
    await h.out(d.finish(null, { title: (db.shop.name || '') + ' — Receipts ' + lb, author: db.shop.name }), slug() + '-receipts-' + suffix(f, t) + '.pdf', share);
  }),

  stockPdf: (f, t, share, low) => job('stock PDF', async () => {
    const h = H(), logo = await h.logoJpeg(), R = h.R, m = stk(), L = stockList(low), d = h.newA4('Stock ' + td());
    h.letter(d, logo, low ? 'Items to reorder' : 'Stock list', 'Stock on hand on ' + td() + '  ·  made ' + h.nowS());
    let v = 0, sv = 0, rc = 0;
    db.P.forEach(p => { const q = Math.max(m[p.name] || 0, 0); v += q * costNow(p); sv += q * p.price; if ((m[p.name] || 0) <= (p.re || 0)) rc++; });
    d.h2('Summary');
    d.grid([['Products', String(db.P.length)], ['Stock value at cost', v], ['Stock value at selling price', sv], ['Potential gross profit', sv - v], ['Items to reorder', String(rc)]], 3);
    d.h2(low ? 'Items at or below their reorder level' : 'Stock on hand');
    d.table([{ h: 'Product', w: .25 }, { h: 'Category', w: .14 }, { h: 'In stock', w: .11, a: 'r' }, { h: 'Reorder', w: .08, a: 'r' }, { h: 'Cost', w: .09, a: 'r' }, { h: 'Price', w: .09, a: 'r' }, { h: 'Value (cost)', w: .11, a: 'r' }, { h: 'Status', w: .13 }],
      L.map(p => { const q = m[p.name] || 0, c = costNow(p), s = status(q, p); return [p.name, p.cat || '', q + ' ' + (p.unit || ''), String(p.re || 0), R(c), R(p.price), R(Math.max(q, 0) * c), s === 'OK' ? '' : s]; }),
      { size: 7.5, empty: low ? 'Nothing needs reordering.' : 'No products yet.' });
    d.para('— End of list —', { size: 8, a: 'c', col: d.T.mut });
    await h.out(d.finish(null, { title: (db.shop.name || '') + ' — Stock ' + td(), author: db.shop.name }), slug() + (low ? '-reorder-list-' : '-stock-') + td() + '.pdf', share);
  }),

  shopPdf: (f, t, share) => H().run('whole shop report', async () => {
    const b = await H().bizBuild(f, t, false);
    await H().out(b, slug() + '-whole-shop-report-' + suffix(f, t) + '.pdf', share);
  }),

  shopZip: (f, t, share) => job('all records', async () => {
    const enc = new TextEncoder(), lb = label(f, t), F = [];
    const add = (n, rows) => F.push({ name: n, data: enc.encode(toCsv(rows)) });
    add('01-sales-lines.csv', DS.sales(f, t));
    add('02-receipts.csv', DS.receipts(f, t));
    add('03-stock-now.csv', DS.stock(false));
    add('04-products.csv', DS.products());
    add('05-purchases.csv', DS.purchases(f, t));
    add('06-expenses.csv', DS.expenses(f, t));
    add('07-customer-credit-payments.csv', DS.customerPayments(f, t));
    add('08-supplier-payments.csv', DS.supplierPayments(f, t));
    add('09-customer-advances.csv', DS.advances(f, t));
    add('10-customer-orders.csv', DS.orders(f, t));
    add('11-bits-journal.csv', DS.journal(f, t));
    add('12-cash-book.csv', DS.cashBook(f, t));
    add('13-owner-money.csv', DS.ownerMoney(f, t));
    add('14-daily-summary.csv', DS.daily(f, t));
    add('15-shop-details.csv', DS.shop());
    F.push({ name: 'backup-restorable.json', data: enc.encode(JSON.stringify(db)) });
    F.push({ name: 'README.txt', data: enc.encode((db.shop.name || 'Shop') + ' — all records\r\nPeriod: ' + lb + '\r\nMade: ' + new Date().toISOString() + '\r\n\r\nEvery .csv file opens in Excel, Google Sheets or any spreadsheet app.\r\nStock, products and shop details are always the latest; the other files follow the dates chosen.\r\nbackup-restorable.json holds a full copy of the data: in the app go to Setup → Restore from backup and choose it.\r\n') });
    await send(zip(F), slug() + '-all-records-' + suffix(f, t) + '.zip', share);
  }),

  backupJson: (f, t, share) => job('backup file', async () => {
    db.lastBk = Date.now(); save();
    await send(new Blob([JSON.stringify(db)], { type: 'application/json' }), slug() + '-backup-' + td() + '.json', share);
  })
};

X.receiptCsv = (id, share) => { const s = db.S.find(x => x.id == id); if (!s) return; job('receipt CSV', () => send(csvBlob(DS.receipt(s)), 'receipt-' + s.no + '-' + s.date + '.csv', share)); };

/* ------------------------------------------------------------------ the panels (HTML) */
X.go = function (name, share) {
  const f = xo.f, t = xo.t;
  if (f && t && f > t) return alert('The From date must be before the To date.');
  E[name](f, t, !!share, xo.low);
};
X.xd = (k, v) => { xo[k] = v || ''; };
X.xl = v => { xo.low = !!v; };
X.tg = (k, o) => { xo.open[k] = o; };

const dates = () => '<div style="display:flex;gap:6px"><div style="flex:1"><label>From date (optional)</label><input type="date" value="' + xo.f + '" onchange="X.xd(\'f\',this.value)"></div><div style="flex:1"><label>To date (optional)</label><input type="date" value="' + xo.t + '" onchange="X.xd(\'t\',this.value)"></div></div><small style="display:block;margin:-4px 0 6px">Leave both empty to include every date.</small>';
const row = (title, pdf, csv) =>
  '<h3>' + title + '</h3>' +
  (pdf ? '<div class="seg"><button onclick="X.go(\'' + pdf + '\',1)">📄 Share PDF</button><button onclick="X.go(\'' + pdf + '\',0)">⬇ Download PDF</button></div>' : '') +
  (csv ? '<div class="seg"><button onclick="X.go(\'' + csv + '\',1)">📄 Share CSV</button><button onclick="X.go(\'' + csv + '\',0)">⬇ Download CSV</button></div>' : '');

X.panel = function (kind) {
  let title, body;
  if (kind === 'sales') {
    title = '📤 Share or download sales &amp; receipts';
    body = dates() + row('Sales list (items sold, profit)', 'salesPdf', 'salesCsv') + row('Receipts (every receipt, one per page in the PDF)', 'receiptsPdf', 'receiptsCsv');
  } else if (kind === 'stock') {
    title = '📤 Share or download stock';
    body = '<label class="chk" style="display:flex;gap:8px;align-items:center;color:var(--ink);font-size:15px;margin:6px 0"><input type="checkbox" style="width:auto;margin:0" ' + (xo.low ? 'checked' : '') + ' onchange="X.xl(this.checked)"> Only items to reorder (at or below reorder level)</label>' + row('Stock list (what you hold today)', 'stockPdf', 'stockCsv');
  } else {
    title = '📤 Share or download all shop records';
    body = dates() + row('Whole shop report', 'shopPdf', null) + row('All records as CSV files (one .zip)', null, 'shopZip') + '<h3>Backup file (restorable)</h3><div class="seg"><button onclick="X.go(\'backupJson\',1)">📄 Share backup</button><button onclick="X.go(\'backupJson\',0)">⬇ Download backup</button></div><small>To restore a backup, go to Setup → Restore from backup.</small>';
  }
  return '<details class="np xp"' + (xo.open[kind] ? ' open' : '') + ' ontoggle="X.tg(\'' + kind + '\',this.open)" style="margin-top:14px"><summary>' + title + '</summary>' + body + '</details>';
};

X._csv = { toCsv, DS, zip, crc32, stockList, E };
})();
