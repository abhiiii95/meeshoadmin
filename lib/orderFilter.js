import { escapeRegex } from '@/lib/format';

// Builds a Mongo filter for orders from URL search params
export function buildOrderFilter(sp) {
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
  else if (['active', 'partial', 'returned'].includes(status)) filter.status = status;

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
