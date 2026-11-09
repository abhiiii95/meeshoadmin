// Turns payment report rows into orders and month-wise profit & loss.
// Uses the money Meesho actually settled, unlike the invoice-based P&L page.
import { PACKAGING_COST } from '@/lib/constants';
import Order from '@/models/Order';
import PaymentLine from '@/models/PaymentLine';
import PaymentUpload from '@/models/PaymentUpload';
import Product from '@/models/Product';

const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const time = (d) => (d ? new Date(d).getTime() : Infinity); // not paid yet = latest
const sum = (list, field) => list.reduce((s, x) => s + (x[field] || 0), 0);

export function categoryOf(status) {
  const s = String(status || '').toLowerCase();
  if (!s) return 'claim'; // Meesho leaves status blank on claim-only rows
  if (s === 'rto' || s.includes('rto')) return 'rto';
  if (s.includes('return')) return 'return';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('deliver')) return 'delivered';
  return 'other'; // Shipped etc.
}

const emptyCounts = () => ({ delivered: 0, return: 0, rto: 0, other: 0, cancelled: 0, claim: 0 });
const SOLD = new Set(['delivered', 'other']);
const CAME_BACK = new Set(['return', 'rto', 'claim']);

export const orderedLines = (lines) => [...lines].sort((a, b) => time(a.paymentDate) - time(b.paymentDate));

// The latest row with a status decides where the order stands now
export function latestStatusLine(lines) {
  const ordered = orderedLines(lines);
  return [...ordered].reverse().find((l) => l.status) || ordered[ordered.length - 1];
}

// Money received per payment month, whichever month the orders were placed in
function buildPaymentMonths(lines) {
  const months = new Map();
  for (const l of lines) {
    if (!l.paymentDate) continue;
    const iso = new Date(l.paymentDate).toISOString();
    const key = iso.slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, amount: 0, rows: 0, subs: new Set(), orderMonths: new Map(), dates: new Map() });
    const m = months.get(key);
    m.amount += l.settlement;
    m.rows++;
    m.subs.add(l.subOrderNo);
    m.orderMonths.set(l.month, (m.orderMonths.get(l.month) || 0) + l.settlement);
    const d = m.dates.get(iso) || { date: l.paymentDate, amount: 0, rows: 0 };
    d.amount += l.settlement;
    d.rows++;
    m.dates.set(iso, d);
  }
  return [...months.values()]
    .map((m) => ({
      month: m.month,
      amount: money(m.amount),
      rows: m.rows,
      orders: m.subs.size,
      orderMonths: [...m.orderMonths].map(([month, amount]) => ({ month, amount: money(amount) })).sort((a, b) => b.month.localeCompare(a.month)),
      dates: [...m.dates.values()].map((d) => ({ ...d, amount: money(d.amount) })).sort((a, b) => new Date(b.date) - new Date(a.date)),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

function buildOrder(subOrderNo, lines, prices, panel) {
  const ordered = orderedLines(lines);
  const latest = latestStatusLine(lines);
  const category = categoryOf(latest.status);
  const qty = latest.qty || 1;
  const unitCost = prices.get(latest.sku);
  const hasCost = typeof unitCost === 'number';

  const settlement = sum(lines, 'settlement');
  const claims = sum(lines, 'claims');
  const claimReason = lines.map((l) => l.claimReason).filter(Boolean).join(' ').trim();
  const wrongProduct = Boolean(panel?.wrongProduct) || /wrong product/i.test(claimReason);

  const productCost = SOLD.has(category) && hasCost ? unitCost * qty : 0;
  // Came back as something else: our product is gone
  const lostValue =
    CAME_BACK.has(category) && wrongProduct
      ? panel?.lostValue > 0
        ? panel.lostValue
        : hasCost
          ? unitCost * qty
          : 0
      : 0;
  const needsCost =
    !hasCost && (SOLD.has(category) || (CAME_BACK.has(category) && wrongProduct && !(panel?.lostValue > 0)));
  const packaging = category === 'cancelled' ? 0 : PACKAGING_COST;
  const profit = settlement - productCost - lostValue - packaging;

  return {
    subOrderNo,
    orderDate: latest.orderDate,
    month: latest.month,
    productName: latest.productName,
    sku: latest.sku,
    qty,
    status: latest.status || 'Claim',
    category,
    customer: panel?.customer || '',
    inPanel: Boolean(panel) && !panel.fromExcel,
    netSale: money(sum(lines, 'saleAmount') + sum(lines, 'saleReturnAmount')),
    shippingCharge: money(sum(lines, 'shippingCharge')),
    returnCharge: money(sum(lines, 'returnCharge')),
    claims: money(claims),
    claimReason,
    settlement: money(settlement),
    productCost: money(productCost),
    lostValue: money(lostValue),
    packaging,
    profit: money(profit),
    wrongProduct: wrongProduct && CAME_BACK.has(category),
    needsCost,
    paid: lines.some((l) => l.paymentDate),
    payments: ordered
      .filter((l) => l.paymentDate)
      .map((l) => ({ date: l.paymentDate, transactionId: l.transactionId, amount: money(l.settlement), status: l.status })),
  };
}

// Where the report and the panel disagree about a return
function findMismatch(order, panel) {
  if (!panel || panel.cancelled || order.category === 'claim') return null;
  const reportType = order.category === 'return' ? 'Customer Return' : order.category === 'rto' ? 'RTO' : '';
  const panelType = panel.returned ? panel.returnType : '';
  if (reportType === panelType) return null;
  return {
    subOrderNo: order.subOrderNo,
    orderId: panel.orderId,
    customer: panel.customer,
    sku: order.sku,
    reportStatus: order.status,
    reportType,
    panelType,
    returnCharge: Math.abs(Math.min(order.returnCharge, 0)),
    settlement: order.settlement,
  };
}

function newMonth(month) {
  return {
    month,
    orders: 0,
    counts: emptyCounts(),
    netSale: 0,
    shippingCharge: 0,
    returnCharge: 0,
    claims: 0,
    settlement: 0,
    productCost: 0,
    lostValue: 0,
    packaging: 0,
    returnLoss: 0, // what returns, RTO and lost products cost us, after claims
    profit: 0,
    unpaidOrders: 0,
    missingCost: 0,
    payments: new Map(),
  };
}

function addToMonth(m, o) {
  m.orders++;
  m.counts[o.category]++;
  for (const f of ['netSale', 'shippingCharge', 'returnCharge', 'claims', 'settlement', 'productCost', 'lostValue', 'packaging', 'profit']) {
    m[f] += o[f];
  }
  if (CAME_BACK.has(o.category)) m.returnLoss -= o.profit;
  if (!o.paid) m.unpaidOrders++;
  if (o.needsCost) m.missingCost++;
  for (const p of o.payments) {
    const key = `${new Date(p.date).toISOString().slice(0, 10)}|${p.transactionId}`;
    const entry = m.payments.get(key) || { date: p.date, transactionId: p.transactionId, amount: 0, lines: 0 };
    entry.amount += p.amount;
    entry.lines++;
    m.payments.set(key, entry);
  }
}

function finishMonth(m) {
  const out = { ...m };
  for (const f of ['netSale', 'shippingCharge', 'returnCharge', 'claims', 'settlement', 'productCost', 'lostValue', 'returnLoss', 'profit']) {
    out[f] = money(m[f]);
  }
  out.payments = [...m.payments.values()]
    .map((p) => ({ ...p, amount: money(p.amount) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return out;
}

export async function buildPaymentReport() {
  const [lines, uploads] = await Promise.all([
    PaymentLine.find().select('-raw').sort({ orderDate: -1, _id: -1 }).lean(),
    PaymentUpload.find().sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  const subs = [...new Set(lines.map((l) => l.subOrderNo))];
  const skus = [...new Set(lines.map((l) => l.sku).filter(Boolean))];
  const [products, panelOrders] = await Promise.all([
    Product.find({ sku: { $in: skus } }).select('sku purchasePrice').lean(),
    Order.find({ 'items.subOrderNo': { $in: subs } }).select('customer cancelled items source').lean(),
  ]);
  const prices = new Map(products.map((p) => [p.sku, p.purchasePrice]));
  const panel = new Map();
  for (const o of panelOrders) {
    for (const i of o.items) {
      panel.set(i.subOrderNo, {
        orderId: o._id,
        fromExcel: o.source === 'excel',
        customer: o.customer?.name || '',
        cancelled: Boolean(o.cancelled),
        returned: Boolean(i.returned),
        returnType: i.returnType || '',
        wrongProduct: Boolean(i.wrongProduct),
        lostValue: i.lostValue || 0,
      });
    }
  }

  const bySub = new Map();
  for (const l of lines) {
    if (!bySub.has(l.subOrderNo)) bySub.set(l.subOrderNo, []);
    bySub.get(l.subOrderNo).push(l);
  }
  const orders = [...bySub].map(([sub, list]) => buildOrder(sub, list, prices, panel.get(sub)));
  orders.sort((a, b) => new Date(b.orderDate || 0) - new Date(a.orderDate || 0));

  const months = new Map();
  const total = newMonth('all');
  for (const o of orders) {
    if (!months.has(o.month)) months.set(o.month, newMonth(o.month));
    addToMonth(months.get(o.month), o);
    addToMonth(total, o);
  }

  const missing = new Map();
  for (const o of orders) if (o.needsCost && o.sku) missing.set(o.sku, o.productName);

  return {
    months: [...months.values()].map(finishMonth).sort((a, b) => b.month.localeCompare(a.month)),
    totals: finishMonth(total),
    paymentMonths: buildPaymentMonths(lines),
    orders,
    mismatches: orders.map((o) => findMismatch(o, panel.get(o.subOrderNo))).filter(Boolean),
    notInPanel: orders.filter((o) => !o.inPanel).length,
    missingCosts: [...missing].map(([sku, description]) => ({ sku, description })),
    packagingPerOrder: PACKAGING_COST,
    uploads,
  };
}
