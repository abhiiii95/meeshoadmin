import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { escapeRegex } from '@/lib/format';
import Order from '@/models/Order';

export async function GET(req) {
  await dbConnect();
  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  const pipeline = [
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.sku',
        description: { $first: '$items.description' },
        orders: { $sum: 1 },
        qty: { $sum: '$items.qty' },
        returnedQty: { $sum: { $cond: ['$items.returned', '$items.qty', 0] } },
        revenue: { $sum: '$items.total' },
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
    { $addFields: { imageUrl: { $arrayElemAt: ['$p.imageUrl', 0] } } },
    { $project: { p: 0 } },
    { $sort: { qty: -1 } }
  );

  const products = await Order.aggregate(pipeline);
  return NextResponse.json({ products });
}
