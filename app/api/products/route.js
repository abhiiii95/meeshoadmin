import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { escapeRegex } from '@/lib/format';
import Order from '@/models/Order';

export async function GET(req) {
  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const top = sp.get('sort') === 'top';

  // ?month=YYYY-MM limits to orders placed in that month
  const match = { status: { $ne: 'cancelled' } };
  const month = /^(\d{4})-(\d{2})$/.exec(sp.get('month') || '');
  if (month) {
    match.orderDate = {
      $gte: new Date(Date.UTC(+month[1], +month[2] - 1, 1)),
      $lt: new Date(Date.UTC(+month[1], +month[2], 1)),
    };
  }

  const pipeline = [
    { $match: match },
    { $unwind: '$items' },
    { $match: { 'items.sku': { $nin: [null, ''] } } },
    {
      $group: {
        _id: '$items.sku',
        description: { $first: '$items.description' },
        orders: { $sum: 1 },
        qty: { $sum: '$items.qty' },
        returnedQty: { $sum: { $cond: ['$items.returned', '$items.qty', 0] } },
        revenue: { $sum: '$items.total' },
        keptRevenue: { $sum: { $cond: ['$items.returned', 0, '$items.total'] } },
        lastOrder: { $max: '$orderDate' },
      },
    },
  ];
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    pipeline.push({ $match: { $or: [{ _id: re }, { description: re }] } });
  }
  pipeline.push(
    { $lookup: { from: 'products', localField: '_id', foreignField: 'sku', as: 'p' } },
    {
      $addFields: {
        imageUrl: { $arrayElemAt: ['$p.imageUrl', 0] },
        purchasePrice: { $arrayElemAt: ['$p.purchasePrice', 0] },
        keptQty: { $subtract: ['$qty', '$returnedQty'] },
      },
    },
    { $project: { p: 0 } },
    { $sort: top ? { keptQty: -1, keptRevenue: -1, _id: 1 } : { lastOrder: -1, qty: -1 } }
  );

  const products = await Order.aggregate(pipeline);
  return NextResponse.json({ products });
}
