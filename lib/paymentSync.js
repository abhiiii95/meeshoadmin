// Applies the payment report to the Orders collection, so the dashboard, orders,
// returns, products and P&L all use it. Orders without a label are created from
// the report (no customer details) and are completed if the label is uploaded later.
import { categoryOf, latestStatusLine, orderedLines } from '@/lib/payments';
import { applyReturn } from '@/lib/returns';
import Order from '@/models/Order';
import PaymentLine from '@/models/PaymentLine';
import Product from '@/models/Product';

const WRONG_PRODUCT_RE = /wrong product/i;
const money = (n) => Math.round(n * 100) / 100;

function newItem(sub, lines) {
  const latest = latestStatusLine(lines);
  return {
    sku: latest.sku,
    size: '',
    color: '',
    qty: latest.qty || 1,
    subOrderNo: sub,
    description: latest.productName,
    grossAmount: latest.listingPrice,
    discount: 0,
    total: Math.max(...lines.map((l) => l.saleAmount || 0), 0) || latest.listingPrice || 0,
  };
}

// Returns a description of the change, or null when the item already matches
function applyToItem(order, item, lines, price) {
  const latest = latestStatusLine(lines);
  const category = categoryOf(latest.status);
  const wasReturned = item.returned;
  const before = wasReturned ? item.returnType : 'Not returned';
  const lastPayment = orderedLines(lines).filter((l) => l.paymentDate).pop()?.paymentDate;

  if (category === 'cancelled') {
    if (order.cancelled) return null;
    order.cancelled = true;
    order.cancelReason = 'Cancelled in Meesho payment report';
    order.cancelledAt = lastPayment || new Date();
    applyReturn(item, { returned: false });
    return `${before} → Cancelled`;
  }
  if (order.cancelled) return null; // cancelled by hand: leave it for the user to review

  const claimReason = lines.map((l) => l.claimReason).filter(Boolean).join(' ');
  const wrongFromClaim = WRONG_PRODUCT_RE.test(claimReason);
  const lostFromClaim = typeof price === 'number' ? price * (item.qty || 1) : 0;

  if (category === 'return' || category === 'rto' || (category === 'claim' && !wasReturned)) {
    const returnType = category === 'rto' ? 'RTO' : 'Customer Return';
    const net = lines.reduce((s, l) => s + (l.returnCharge || 0), 0);
    let returnCharge;
    if (returnType === 'RTO' || category === 'claim') returnCharge = 0;
    else if (net < 0) returnCharge = money(-net);
    else if (wasReturned) returnCharge = item.returnCharge;

    const wrongProduct = item.wrongProduct || wrongFromClaim;
    const lostValue = item.lostValue || (wrongProduct ? lostFromClaim : 0);
    const unchanged =
      wasReturned &&
      item.returnType === returnType &&
      item.wrongProduct === wrongProduct &&
      (item.lostValue || 0) === lostValue &&
      (returnCharge === undefined || (item.returnCharge || 0) === returnCharge);
    if (unchanged) return null;

    const returnedAt = item.returnedAt;
    applyReturn(item, { returned: true, returnType, returnReason: item.returnReason, returnCharge, wrongProduct, lostValue });
    item.returnedAt = returnedAt || lastPayment || new Date();
    return `${before} → ${returnType}`;
  }

  if (category === 'claim') {
    if (!wrongFromClaim || item.wrongProduct) return null;
    item.wrongProduct = true;
    item.lostValue = item.lostValue || lostFromClaim;
    return 'Marked wrong product (claim paid)';
  }

  // Delivered / shipped. Remove a return only if the report shows it was reversed;
  // otherwise it may be a newer return than this report knows about.
  const reversed = lines.some((l) => ['return', 'rto'].includes(categoryOf(l.status)));
  if (wasReturned && reversed) {
    applyReturn(item, { returned: false });
    return `${before} → ${latest.status} (return reversed)`;
  }
  return null;
}

// subs: limit to these sub orders. dryRun: report what would change without saving.
export async function syncOrdersFromPayments({ subs, dryRun = false } = {}) {
  const lines = await PaymentLine.find(subs ? { subOrderNo: { $in: subs } } : {}).select('-raw').lean();
  const bySub = new Map();
  for (const l of lines) {
    if (!bySub.has(l.subOrderNo)) bySub.set(l.subOrderNo, []);
    bySub.get(l.subOrderNo).push(l);
  }

  const orderNos = [...new Set([...bySub.keys()].map((s) => s.split('_')[0]))];
  const skus = [...new Set(lines.map((l) => l.sku).filter(Boolean))];
  const [orders, products] = await Promise.all([
    Order.find({ orderNo: { $in: orderNos } }),
    Product.find({ sku: { $in: skus } }).select('sku purchasePrice').lean(),
  ]);
  const prices = new Map(products.map((p) => [p.sku, p.purchasePrice]));
  const byOrderNo = new Map(orders.map((o) => [o.orderNo, o]));

  const summary = { created: 0, updated: 0, changes: [] };
  const touched = new Set();
  const created = new Set();

  for (const [sub, subLines] of bySub) {
    const orderNo = sub.split('_')[0];
    const latest = latestStatusLine(subLines);
    let order = byOrderNo.get(orderNo);
    if (!order) {
      order = new Order({
        orderNo,
        orderDate: latest.orderDate,
        customer: {},
        customerKey: '',
        paymentType: 'Unknown',
        source: 'excel',
        items: [],
      });
      byOrderNo.set(orderNo, order);
      created.add(order);
    }
    let item = order.items.find((i) => i.subOrderNo === sub);
    if (!item) {
      order.items.push(newItem(sub, subLines));
      item = order.items[order.items.length - 1];
      touched.add(order);
    }
    const isNew = created.has(order);
    const change = applyToItem(order, item, subLines, prices.get(item.sku));
    if (change) {
      touched.add(order);
      if (!isNew) summary.changes.push({ subOrderNo: sub, customer: order.customer?.name || '', change });
    }
  }

  summary.created = created.size;
  summary.updated = [...touched].filter((o) => !created.has(o)).length;
  for (const order of touched) {
    if (order.source === 'excel') order.totalAmount = order.items.reduce((s, i) => s + (i.total || 0), 0);
    order.refreshStatus();
    if (!dryRun) await order.save();
  }
  return summary;
}
