import { escapeRegex } from '@/lib/format';

// Orders page tabs
export const TABS = ['delivered', 'customerReturn', 'rto', 'cancelled'];

export function tabFilter(tab) {
  switch (tab) {
    case 'delivered':
      return { status: 'active' };
    case 'customerReturn':
      return { items: { $elemMatch: { returned: true, returnType: 'Customer Return' } }, status: { $ne: 'cancelled' } };
    case 'rto':
      return { items: { $elemMatch: { returned: true, returnType: 'RTO' } }, status: { $ne: 'cancelled' } };
    case 'cancelled':
      return { status: 'cancelled' };
    default:
      return null;
  }
}

// Builds a Mongo filter for orders from URL search params.
// withTab: false leaves out the tab (used for the per-tab counts).
export function buildOrderFilter(sp, { withTab = true } = {}) {
  const base = buildBaseFilter(sp);
  const tab = withTab ? tabFilter(sp.get('tab')) : null;
  return tab ? { $and: [base, tab] } : base;
}

function buildBaseFilter(sp) {
  const filter = {};
  const q = (sp.get('q') || '').trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { 'customer.name': re },
      { 'customer.pincode': re },
      { 'customer.city': re },
      { orderNo: re },
      { invoiceNo: re },
      { awb: re },
      { 'items.sku': re },
      { 'items.subOrderNo': re },
      { 'items.description': re },
    ];
  }

  const status = sp.get('status');
  if (status === 'anyReturn') filter.status = { $in: ['partial', 'returned'] };
  else if (['active', 'partial', 'returned', 'cancelled'].includes(status)) filter.status = status;

  const payment = sp.get('payment');
  if (payment) filter.paymentType = payment;

  const courier = sp.get('courier');
  if (courier) filter.courier = courier;

  const customerKey = sp.get('customerKey');
  if (customerKey) filter.customerKey = customerKey;

  const sku = sp.get('sku');
  if (sku) filter['items.sku'] = sku;

  const from = sp.get('from');
  const to = sp.get('to');
  if (from || to) {
    filter.orderDate = {};
    if (from) filter.orderDate.$gte = new Date(`${from}T00:00:00Z`);
    if (to) filter.orderDate.$lte = new Date(`${to}T23:59:59Z`);
  }
  return filter;
}
