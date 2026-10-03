// Parses one page of a Meesho shipping label + invoice into an order object.
// Works on positioned text items so the two-column label header and the
// multi-line product description can be separated reliably.

import { addressKey } from './identity.js';

const AMOUNT_RE = /Rs\.?\s*(-?[\d,]+(?:\.\d+)?)/gi;
const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
const SUB_ORDER_RE = /\d{6,}_\d+/;

const toNum = (s) => parseFloat(String(s ?? '').replace(/,/g, '')) || 0;

function amounts(text) {
  return [...text.matchAll(AMOUNT_RE)].map((m) => toNum(m[1]));
}

function parseDate(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s || '');
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

function groupLines(items, tol = 3) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str).join(' ');
  }
  return lines;
}

// Same customer = same name + pincode
export function customerKey(name, pincode) {
  return `${String(name || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${pincode || ''}`;
}

function parseCustomer(leftLines) {
  const caIdx = leftLines.findIndex((t) => /^Customer Address/i.test(t));
  const ruIdx = leftLines.findIndex((t) => /^If undelivered/i.test(t));
  const start = caIdx >= 0 ? caIdx + 1 : 0;
  const end = ruIdx > start ? ruIdx : leftLines.length;
  const block = leftLines.slice(start, end);

  // Label text and name may share a line
  const inline = caIdx >= 0 ? leftLines[caIdx].replace(/^Customer Address\s*/i, '').trim() : '';
  if (inline) block.unshift(inline);

  const name = (block[0] || '').trim();
  const addressLines = block.slice(1);
  const address = addressLines.join(', ');
  const pins = address.match(/\b\d{6}\b/g);
  const pincode = pins ? pins[pins.length - 1] : '';

  let state = '';
  let city = '';
  const lastLine = addressLines[addressLines.length - 1] || '';
  const parts = lastLine.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^\d{6}$/.test(parts[parts.length - 1])) {
    state = parts[parts.length - 2] || '';
    city = parts[parts.length - 3] || '';
  }

  const returnTo = ruIdx >= 0 ? leftLines.slice(ruIdx + 1).join(', ') : '';
  return { name, address, city, state, pincode, returnTo };
}

// Right side of the label: payment, courier, pickup/drop, codes, AWB.
// Anything not recognised is kept in sortCodes so nothing is lost.
function parseLabelRight(rightLines) {
  const used = new Set();
  const take = (i) => {
    used.add(i);
    return rightLines[i];
  };

  // Header is "Prepaid: Do not collect cash" or, for COD, "Check the payable amount on the app"
  let payIdx = rightLines.findIndex((t) => /Prepaid|COD|payable|collect/i.test(t));
  if (payIdx < 0 && rightLines.length) payIdx = 0;
  const paymentText = payIdx >= 0 ? take(payIdx) : '';
  const paymentType = /prepaid/i.test(paymentText) || !paymentText ? 'Prepaid' : 'COD';

  let courier = '';
  let serviceType = '';
  let pickupCode = '';
  const courierIdx = rightLines.findIndex((t, i) => !used.has(i) && /\b(Pickup|Drop)\b/i.test(t));
  if (courierIdx >= 0) {
    const m = take(courierIdx).match(/^(.*?)\b(Pickup|Drop)\b\s*(.*)$/i);
    courier = m[1].trim();
    serviceType = m[2];
    pickupCode = m[3].trim();
    // "Xpress Bees" on one line, "Pickup" on the next
    for (let i = courierIdx - 1; !courier && i >= 0; i--) if (!used.has(i)) courier = take(i).trim();
  } else {
    const i = rightLines.findIndex((t, idx) => !used.has(idx));
    if (i >= 0) courier = take(i).trim();
  }

  const codes = {};
  rightLines.forEach((t, i) => {
    const m = t.match(/^(Destination Code|Return Code)\s*:?\s*(.*)$/i);
    if (!m || used.has(i)) return;
    take(i);
    let value = m[2].trim();
    if (!value && i + 1 < rightLines.length && !used.has(i + 1)) value = take(i + 1).trim();
    codes[/^Dest/i.test(m[1]) ? 'destinationCode' : 'returnCode'] = value;
  });

  let awb = '';
  for (let i = rightLines.length - 1; i >= 0 && !awb; i--) {
    if (used.has(i)) continue;
    const tok = rightLines[i].split(/\s+/).find((x) => /^[A-Z]{0,5}\d{8,22}[A-Z]{0,3}$/i.test(x));
    if (tok) {
      awb = tok;
      if (rightLines[i].trim() === tok) used.add(i);
    }
  }

  const sortCodes = rightLines.filter((_, i) => !used.has(i)).map((t) => t.trim()).filter(Boolean);

  return {
    paymentType,
    paymentText,
    courier,
    serviceType,
    pickupCode,
    destinationCode: codes.destinationCode || '',
    returnCode: codes.returnCode || '',
    awb,
    sortCodes,
  };
}

// Invoice header block: "BILL TO / SHIP TO" (left) and "Sold by" (right)
function parseBill(items) {
  const billHdr = items.find((i) => /^BILL TO/i.test(i.str));
  const soldByItem = items.find((i) => /^Sold by/i.test(i.str));
  const descHdr = items.find((i) => /^Description$/i.test(i.str));
  const empty = { billTo: '', placeOfSupply: '', soldBy: '', sellerAddress: '', enrolmentNo: '' };
  if (!billHdr && !soldByItem) return empty;

  const topY = Math.max(billHdr?.y ?? -Infinity, soldByItem?.y ?? -Infinity) + 1;
  const bottomY = descHdr ? descHdr.y + 1 : -Infinity;
  const region = items.filter((i) => i.y <= topY && i.y > bottomY);
  const splitX = soldByItem ? soldByItem.x - 2 : Infinity;

  const clean = (s) => s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  let billTo = clean(
    groupLines(region.filter((i) => i.x < splitX))
      .map((l) => l.text)
      .join(' ')
      .replace(/^BILL TO\s*\/\s*SHIP TO\s*/i, '')
  );
  const pos = billTo.match(/,?\s*Place\s+of\s+Supply\s*:\s*(.+)$/i);
  const placeOfSupply = pos ? pos[1].trim() : '';
  if (pos) billTo = billTo.slice(0, pos.index).trim();

  const right = groupLines(region.filter((i) => i.x >= splitX)).map((l) => l.text);
  const soldBy = clean((right[0] || '').replace(/^Sold by\s*:?\s*/i, ''));
  const stop = right.findIndex((t, i) => i > 0 && /Enrolment|GSTIN|Order No/i.test(t));
  const sellerAddress = clean(right.slice(1, stop > 0 ? stop : right.length).join(', '));
  const enrol = right.join(' ').match(/Enrolment No\.?\s*[-:]?\s*([A-Z0-9]+)/i);

  return { billTo, placeOfSupply, soldBy, sellerAddress, enrolmentNo: enrol ? enrol[1] : '' };
}

function colName(str) {
  if (/^SKU/i.test(str)) return 'sku';
  if (/^Size/i.test(str)) return 'size';
  if (/^Qty/i.test(str)) return 'qty';
  if (/^Colou?r/i.test(str)) return 'color';
  if (/^Order/i.test(str)) return 'subOrderNo';
  return null;
}

// Fallback for a single text row like "SKU Free Size 1 Black 123_1"
function parseRowTokens(text) {
  const m = text.match(SUB_ORDER_RE);
  if (!m) return null;
  const tokens = text.slice(0, m.index).trim().split(/\s+/);
  const sku = tokens.shift() || '';
  let qtyIdx = -1;
  tokens.forEach((t, i) => {
    if (/^\d+$/.test(t)) qtyIdx = i;
  });
  return {
    sku,
    size: qtyIdx >= 0 ? tokens.slice(0, qtyIdx).join(' ') : '',
    qty: qtyIdx >= 0 ? parseInt(tokens[qtyIdx], 10) : 1,
    color: qtyIdx >= 0 ? tokens.slice(qtyIdx + 1).join(' ') : tokens.join(' '),
    subOrderNo: m[0],
  };
}

function parseProductRows(lines) {
  const hdrIdx = lines.findIndex((l) => /\bSKU\b/i.test(l.text) && /Order No/i.test(l.text));
  if (hdrIdx < 0) return [];
  let endIdx = lines.findIndex((l, i) => i > hdrIdx && /INVOICE|BILL OF SUPPLY/i.test(l.text));
  if (endIdx < 0) endIdx = lines.length;
  const rowLines = lines.slice(hdrIdx + 1, endIdx);

  const cols = lines[hdrIdx].items
    .map((i) => ({ name: colName(i.str), x: i.x }))
    .filter((c) => c.name);

  if (cols.length < 4) {
    return rowLines.map((l) => parseRowTokens(l.text)).filter(Boolean);
  }

  const rows = [];
  for (const line of rowLines) {
    if (SUB_ORDER_RE.test(line.text) || !rows.length) rows.push({});
    const row = rows[rows.length - 1];
    for (const it of line.items) {
      const col = cols.filter((c) => c.x <= it.x + 4).pop() || cols[0];
      row[col.name] = row[col.name] ? `${row[col.name]} ${it.str}` : it.str;
    }
  }
  return rows
    .filter((r) => r.subOrderNo && SUB_ORDER_RE.test(r.subOrderNo))
    .map((r) => ({
      sku: (r.sku || '').trim(),
      size: (r.size || '').trim(),
      qty: parseInt(r.qty, 10) || 1,
      color: (r.color || '').trim(),
      subOrderNo: r.subOrderNo.match(SUB_ORDER_RE)[0],
    }));
}

function parseInvoiceProducts(lines) {
  const hdrIdx = lines.findIndex((l) => /^Description\b/i.test(l.text) && /Total/i.test(l.text));
  if (hdrIdx < 0) return [];
  let endIdx = lines.findIndex((l, i) => i > hdrIdx && /^(Other Charges|Total\b)/i.test(l.text));
  if (endIdx < 0) endIdx = lines.length;
  const region = lines.slice(hdrIdx + 1, endIdx).flatMap((l) => l.items);

  const qtyHdr = lines[hdrIdx].items.find((i) => /^Qty/i.test(i.str));
  const descMaxX = qtyHdr ? qtyHdr.x - 3 : null;
  const descItems = descMaxX != null ? region.filter((i) => i.x < descMaxX) : [];
  const numItems = descMaxX != null ? region.filter((i) => i.x >= descMaxX) : region;

  const products = groupLines(numItems)
    .filter((l) => /Rs\.?\s*\d/i.test(l.text))
    .map((l) => {
      const amts = amounts(l.text);
      const pre = l.text.slice(0, l.text.search(/Rs\.?\s*\d/i)).trim();
      const qtyMatch = pre.match(/(\d+)\s*$/);
      return {
        y: l.y,
        desc: descMaxX == null && qtyMatch ? [pre.slice(0, qtyMatch.index).trim()] : [],
        qty: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
        grossAmount: amts[0] || 0,
        discount: amts.length > 2 ? amts[1] : 0,
        total: amts[amts.length - 1] || 0,
      };
    });

  // Attach wrapped description lines to the nearest amount row
  for (const dl of groupLines(descItems)) {
    if (!products.length) break;
    let best = products[0];
    for (const p of products) if (Math.abs(p.y - dl.y) < Math.abs(best.y - dl.y)) best = p;
    best.desc.push(dl.text);
  }

  return products.map(({ y, desc, ...p }) => ({
    ...p,
    description: desc.join(' ').replace(/\s+/g, ' ').trim(),
  }));
}

// A page can hold several labels (side by side and/or stacked).
// Each "Customer Address" heading marks the top-left corner of one label.
export function splitLabels(rawItems) {
  const items = rawItems.filter((i) => i.str && i.str.trim());
  const anchors = items.filter((i) => /^Customer Address/i.test(i.str.trim()));
  if (anchors.length <= 1) return anchors.length ? [items] : [];

  const uniq = (vals, tol) =>
    vals.reduce((acc, v) => (acc.some((a) => Math.abs(a - v) <= tol) ? acc : [...acc, v]), []);
  const cols = uniq(anchors.map((a) => a.x), 20).sort((a, b) => a - b);
  const rows = uniq(anchors.map((a) => a.y), 20).sort((a, b) => b - a);
  const idx = (list, v) => list.findIndex((x) => Math.abs(x - v) <= 20);

  // Reading order: top row first, left to right
  const sorted = [...anchors].sort((a, b) => idx(rows, a.y) - idx(rows, b.y) || a.x - b.x);
  return sorted.map((a) => {
    const c = idx(cols, a.x);
    const r = idx(rows, a.y);
    const xMin = cols[c] - 10;
    const xMax = c + 1 < cols.length ? cols[c + 1] - 10 : Infinity;
    const yMax = rows[r] + 20;
    const yMin = r + 1 < rows.length ? rows[r + 1] + 20 : -Infinity;
    return items.filter((i) => i.x >= xMin && i.x < xMax && i.y <= yMax && i.y > yMin);
  });
}

export function parsePage(rawItems) {
  const items = rawItems
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ ...i, str: i.str.replace(/\s+/g, ' ').trim() }));
  const lines = groupLines(items);
  const rawText = lines.map((l) => l.text).join('\n');
  if (!/Customer Address/i.test(rawText)) return null;

  // Top label area is two columns: customer (left) and courier (right).
  // The right column starts with the payment header on the same line as "Customer Address".
  const pd = items.find((i) => /^Product Details/i.test(i.str));
  const top = items.filter((i) => i.y > (pd ? pd.y + 1 : -Infinity));
  const ca = top.find((i) => /^Customer Address/i.test(i.str));
  const payItem = ca
    ? top
        .filter((i) => Math.abs(i.y - ca.y) <= 6 && i.x > ca.x + 80)
        .sort((a, b) => a.x - b.x)[0]
    : top.find((i) => /^(Prepaid|COD)\b/i.test(i.str));
  let splitX;
  if (payItem) splitX = payItem.x - 2;
  else {
    const xs = top.map((i) => i.x);
    splitX = (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  const leftLines = groupLines(top.filter((i) => i.x < splitX)).map((l) => l.text);
  const rightLines = groupLines(top.filter((i) => i.x >= splitX)).map((l) => l.text);

  const { returnTo, ...customer } = parseCustomer(leftLines);
  const label = parseLabelRight(rightLines);
  const rows = parseProductRows(lines);
  const invoiceProducts = parseInvoiceProducts(lines);

  let orderNo = rows[0]?.subOrderNo.split('_')[0] || '';
  if (!orderNo) {
    const m = rawText.match(/Order No\.?\s*\n?\s*(\d{10,})/i);
    if (m) orderNo = m[1];
  }

  // Bill line looks like "335290471204175040 9ckpx2746 26.09.2026 26.09.2026"
  let invoiceNo = '';
  let dates = [];
  const billLine =
    lines.find(
      (l) =>
        orderNo &&
        l.text.includes(orderNo) &&
        /\d{2}\.\d{2}\.\d{4}/.test(l.text) &&
        !SUB_ORDER_RE.test(l.text)
    ) || lines.find((l) => (l.text.match(/\d{2}\.\d{2}\.\d{4}/g) || []).length >= 2);
  if (billLine) {
    const tokens = billLine.text.split(/\s+/);
    dates = tokens.filter((t) => DATE_RE.test(t));
    const idx = tokens.indexOf(orderNo);
    const candidate =
      idx >= 0 ? tokens[idx + 1] : tokens.find((t) => !DATE_RE.test(t) && t !== orderNo);
    if (candidate && !DATE_RE.test(candidate)) invoiceNo = candidate;
  }
  if (!invoiceNo) {
    const m = rawText.match(/Invoice No\.?\s*:?\s*([A-Za-z0-9\-/]+)/i);
    if (m && !/^(Order|Invoice)$/i.test(m[1])) invoiceNo = m[1];
  }
  if (!dates.length) dates = (rawText.match(/\b\d{2}\.\d{2}\.\d{4}\b/g) || []).slice(0, 2);

  const bill = parseBill(items);
  const gstin = (rawText.match(/GSTIN\s*[-:]?\s*([0-9A-Z]{15})/i) || [])[1] || '';
  const otherLine = lines.find((l) => /^Other Charges/i.test(l.text));
  const otherAmts = otherLine ? amounts(otherLine.text) : [];
  const totalLine = lines.filter((l) => /^Total\b/i.test(l.text)).pop();
  const titleItem = items.find((i) => /INVOICE|BILL OF SUPPLY/i.test(i.str));
  const copyItem = items.find((i) => /^(Original|Duplicate|Triplicate)\b/i.test(i.str));
  const invoiceNote = totalLine
    ? lines
        .filter((l) => l.y < totalLine.y)
        .map((l) => l.text)
        .join(' ')
        .trim()
    : '';

  const baseItems = rows.length
    ? rows
    : invoiceProducts.map(() => ({ sku: '', size: '', color: '', qty: 1, subOrderNo: '' }));
  const orderItems = baseItems.map((r, i) => {
    const p = invoiceProducts[i] || {};
    return {
      ...r,
      description: p.description || '',
      grossAmount: p.grossAmount || 0,
      discount: p.discount || 0,
      total: p.total || 0,
    };
  });

  const itemsTotal = orderItems.reduce((s, i) => s + i.total, 0);
  const totalAmount = totalLine ? (amounts(totalLine.text).pop() ?? itemsTotal) : itemsTotal;

  return {
    orderNo,
    invoiceNo,
    orderDate: parseDate(dates[0]),
    invoiceDate: parseDate(dates[1] || dates[0]),
    customer,
    customerKey: customerKey(customer.name, customer.pincode),
    addressKey: addressKey(customer),
    returnTo,
    ...label,
    ...bill,
    gstin,
    invoiceTitle: titleItem ? titleItem.str : '',
    invoiceCopy: copyItem ? copyItem.str : '',
    items: orderItems,
    otherChargesGross: otherAmts[0] || 0,
    otherChargesDiscount: otherAmts.length > 2 ? otherAmts[1] : 0,
    otherCharges: otherAmts[otherAmts.length - 1] || 0,
    totalAmount,
    invoiceNote,
    rawText,
  };
}
