import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { escapeRegex } from '@/lib/format';
import { IS_CANCELLED, IS_RETURNED, NOT_CANCELLED, countIf, sumIf } from '@/lib/agg';
import Order from '@/models/Order';

const SORTS = {
  orders: { orders: -1, lastOrder: -1 },
  returns: { returnedOrders: -1, orders: -1 },
  returnRate: { returnRate: -1, returnedOrders: -1 },
  spent: { totalSpent: -1 },
  last: { lastOrder: -1 },
  name: { name: 1 },
};

export async function GET(req) {
  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '25', 10)));
  const minOrders = parseInt(sp.get('minOrders') || '0', 10);
  const minReturns = parseInt(sp.get('minReturns') || '0', 10);
  const q = (sp.get('q') || '').trim();

  const match = {};
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    match.$or = [{ name: re }, { pincode: re }, { city: re }, { state: re }];
  }
  if (minOrders > 0) match.orders = { $gte: minOrders };
  if (minReturns > 0) match.returnedOrders = { $gte: minReturns };

  const [result] = await Order.aggregate([
    {
      $group: {
        _id: '$customerKey',
        name: { $first: '$customer.name' },
        address: { $first: '$customer.address' },
        city: { $first: '$customer.city' },
        state: { $first: '$customer.state' },
        pincode: { $first: '$customer.pincode' },
        orders: countIf(NOT_CANCELLED),
        cancelledOrders: countIf(IS_CANCELLED),
        returnedOrders: countIf(IS_RETURNED),
        items: sumIf(NOT_CANCELLED, { $size: '$items' }),
        returnedItems: {
          $sum: { $size: { $filter: { input: '$items', cond: '$$this.returned' } } },
        },
        codOrders: countIf({ $and: [NOT_CANCELLED, { $eq: ['$paymentType', 'COD'] }] }),
        totalSpent: sumIf(NOT_CANCELLED, '$totalAmount'),
        returnedAmount: { $sum: '$returnedAmount' },
        firstOrder: { $min: '$orderDate' },
        lastOrder: { $max: '$orderDate' },
      },
    },
    {
      $addFields: {
        returnRate: { $cond: [{ $gt: ['$orders', 0] }, { $divide: ['$returnedOrders', '$orders'] }, 0] },
      },
    },
    { $match: match },
    { $sort: SORTS[sp.get('sort')] || SORTS.orders },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const total = result.total[0]?.n || 0;
  return NextResponse.json({
    customers: result.rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
