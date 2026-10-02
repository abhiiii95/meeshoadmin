import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { buildOrderFilter } from '@/lib/orderFilter';
import { IS_CANCELLED, IS_RETURNED, NOT_CANCELLED, countIf, sumIf } from '@/lib/agg';
import Order from '@/models/Order';
import Product from '@/models/Product';

const SORTS = {
  newest: { orderDate: -1, _id: -1 },
  oldest: { orderDate: 1, _id: 1 },
  amount: { totalAmount: -1 },
};

export async function GET(req) {
  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter = buildOrderFilter(sp);
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '25', 10)));
  const sort = SORTS[sp.get('sort')] || SORTS.newest;

  const [orders, total, couriers, [summary]] = await Promise.all([
    Order.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
    Order.distinct('courier'),
    // Totals for everything matching the current search/filters
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          orders: countIf(NOT_CANCELLED),
          cancelledOrders: countIf(IS_CANCELLED),
          returnedOrders: countIf(IS_RETURNED),
          returnedItems: {
            $sum: { $size: { $filter: { input: '$items', cond: '$$this.returned' } } },
          },
          amount: sumIf(NOT_CANCELLED, '$totalAmount'),
          returnedAmount: { $sum: '$returnedAmount' },
          customers: { $addToSet: '$customerKey' },
        },
      },
      { $addFields: { customers: { $size: '$customers' } } },
    ]),
  ]);

  // How many times each customer on this page has ordered / returned overall
  const keys = [...new Set(orders.map((o) => o.customerKey))];
  const counts = await Order.aggregate([
    { $match: { customerKey: { $in: keys } } },
    {
      $group: {
        _id: '$customerKey',
        orders: countIf(NOT_CANCELLED),
        returns: countIf(IS_RETURNED),
        cancelled: countIf(IS_CANCELLED),
      },
    },
  ]);
  const customerStats = Object.fromEntries(counts.map((c) => [c._id, c]));

  const skus = [...new Set(orders.flatMap((o) => o.items.map((i) => i.sku)).filter(Boolean))];
  const products = await Product.find({ sku: { $in: skus } }).lean();
  const images = Object.fromEntries(products.map((p) => [p.sku, p.imageUrl]));
  const prices = Object.fromEntries(products.map((p) => [p.sku, p.purchasePrice]));

  return NextResponse.json({
    orders,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    summary: summary || { orders: 0, cancelledOrders: 0, returnedOrders: 0, returnedItems: 0, amount: 0, returnedAmount: 0, customers: 0 },
    customerStats,
    images,
    prices,
    couriers: couriers.filter(Boolean).sort(),
  });
}
