// Reads Meesho's payment report (.xlsx): sheet "Order Payments", with a group
// row, a header row and a formula row above the data. Columns are found by
// header name so a changed column order doesn't break the import.
import ExcelJS from 'exceljs';

const SUB_ORDER_RE = /^\d{6,}_\d+$/;
// Sheet name → first header of its table
const EXTRA_SHEETS = {
  'Ads Cost': 'Deduction Duration',
  'Referral Payments': 'Reward Id',
  'Compensation and Recovery': 'Date',
};

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (v.text !== undefined) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

const toNumber = (s) => {
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// "2026-09-25 14:20:25" or "2026-09-25" → Date, keeping the written day
function toDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : null;
}

function rowCells(row) {
  const cells = [];
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cells[col - 1] = cellText(cell);
  });
  return cells;
}

export async function parsePaymentReport(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('This file could not be opened. Please upload the .xlsx payment report downloaded from Meesho.');
  }

  const sheet = workbook.getWorksheet('Order Payments');
  if (!sheet) throw new Error('"Order Payments" sheet not found. Please upload the payment report from Meesho.');

  const rows = [];
  sheet.eachRow((row) => rows.push(rowCells(row)));
  const headerIdx = rows.findIndex((r) => r.includes('Sub Order No'));
  if (headerIdx < 0) throw new Error('"Sub Order No" column not found. Please upload the payment report from Meesho.');

  // Some headers repeat (e.g. "Fixed Fee"), so later ones get a " #2" suffix in raw
  const seen = {};
  const headers = rows[headerIdx].map((h) => {
    if (!h) return '';
    seen[h] = (seen[h] || 0) + 1;
    return seen[h] > 1 ? `${h} #${seen[h]}` : h;
  });
  const required = ['Order Date', 'Supplier SKU', 'Live Order Status', 'Transaction ID', 'Payment Date', 'Final Settlement Amount'];
  const absent = required.filter((h) => !headers.includes(h));
  if (absent.length) throw new Error(`Columns missing in this report: ${absent.join(', ')}`);

  const occurrences = {};
  const lines = [];
  for (const cells of rows.slice(headerIdx + 1)) {
    const raw = {};
    headers.forEach((h, i) => {
      if (h && cells[i]) raw[h] = cells[i];
    });
    const subOrderNo = raw['Sub Order No'];
    if (!SUB_ORDER_RE.test(subOrderNo || '')) continue; // formula row, blank rows

    const num = (h) => toNumber(raw[h]);
    const transactionId = raw['Transaction ID'] || '';
    const base = `${subOrderNo}|${transactionId}`;
    occurrences[base] = (occurrences[base] || 0) + 1;

    lines.push({
      key: `${base}|${occurrences[base]}`,
      subOrderNo,
      orderDate: toDate(raw['Order Date']),
      month: (raw['Order Date'] || '').slice(0, 7),
      dispatchDate: toDate(raw['Dispatch Date']),
      productName: raw['Product Name'] || '',
      sku: raw['Supplier SKU'] || '',
      catalogId: raw['Catalog ID'] || '',
      status: raw['Live Order Status'] || '',
      priceType: raw['Price Type'] || '',
      listingPrice: num('Listing Price (Incl. taxes)'),
      qty: num('Quantity') || 1,
      transactionId,
      paymentDate: toDate(raw['Payment Date']),
      settlement: num('Final Settlement Amount'),
      saleAmount: num('Total Sale Amount (Incl. Shipping & GST)'),
      saleReturnAmount: num('Total Sale Return Amount (Incl. Shipping & GST)'),
      returnCharge: num('Return Shipping Charge (Incl. GST)'),
      shippingCharge: num('Shipping Charge (Incl. GST)'),
      commission: num('Meesho Commission (Incl. GST)'),
      tcs: num('TCS'),
      tds: num('TDS'),
      compensation: num('Compensation'),
      claims: num('Claims'),
      recovery: num('Recovery'),
      compensationReason: raw['Compensation Reason'] || '',
      claimReason: raw['Claims Reason'] || '',
      recoveryReason: raw['Recovery Reason'] || '',
      raw,
    });
  }
  if (!lines.length) throw new Error('No orders found in the "Order Payments" sheet.');

  // These sheets aren't per order, so they aren't counted. Say so if they have data.
  const warnings = [];
  for (const [name, firstHeader] of Object.entries(EXTRA_SHEETS)) {
    const extra = workbook.getWorksheet(name);
    if (!extra) continue;
    const extraRows = [];
    extra.eachRow((row) => extraRows.push(rowCells(row)));
    const headerRow = extraRows.findIndex((r) => r[0] === firstHeader);
    const hasData = headerRow >= 0 && extraRows.slice(headerRow + 1).some((r) => r[0] && !/^no data/i.test(r[0]));
    if (hasData) warnings.push(`"${name}" sheet has data that is NOT included in this calculation.`);
  }

  return { lines, warnings };
}
