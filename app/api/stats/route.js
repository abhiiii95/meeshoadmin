import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { EMPTY_TABS, IS_CANCELLED, IS_RETURNED, NOT_CANCELLED, TAB_GROUP, countIf, sumIf } from '@/lib/agg';
import Order from '@/models/Order';
import Upload from '@/models/Upload';

export async function GET() {
  await dbConnect();

  const [totals] = await Order.aggregate([
    {
      $group: {
        _id: null,
        orders: countIf(NOT_CANCELLED),
        cancelled: countIf(IS_CANCELLED),
        returnedOrders: countIf(IS_RETURNED),
        items: sumIf(NOT_CANCELLED, { $sum: '$items.qty' }),
        revenue: sumIf(NOT_CANCELLED, '$totalAmount'),
        returnedAmount: { $sum: '$returnedAmount' },
        cod: countIf({ $and: [NOT_CANCELLED, { $eq: ['$paymentType', 'COD'] }] }),
      },
    },
  ]);

  const [customerTotals] = await Order.aggregate([
    { $match: { status: { $ne: 'cancelled' } } },
    { $group: { _id: '$customerKey', orders: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        customers: { $sum: 1 },
        repeat: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } },
      },
    },
  ]);

  const topReturners = await Order.aggregate([
    { $match: { status: { $in: ['partial', 'returned'] } } },
    {
      $group: {
        _id: '$customerKey',
        name: { $first: '$customer.name' },
        city: { $first: '$customer.city' },
        pincode: { $first: '$customer.pincode' },
        returns: { $sum: 1 },
      },
    },
    { $sort: { returns: -1 } },
    { $limit: 5 },
  ]);

  const topReturnedSkus = await Order.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.returned': true } },
    { $group: { _id: '$items.sku', returns: { $sum: '$items.qty' } } },
    { $sort: { returns: -1 } },
    { $limit: 5 },
  ]);

  const [tabs] = await Order.aggregate([{ $group: { _id: null, ...TAB_GROUP } }]);

  const recentUploads = await Upload.find().sort({ createdAt: -1 }).limit(5).lean();

  return NextResponse.json({
    totals: totals || { orders: 0, cancelled: 0, returnedOrders: 0, items: 0, revenue: 0, returnedAmount: 0, cod: 0 },
    customers: customerTotals || { customers: 0, repeat: 0 },
    tabs: tabs || EMPTY_TABS,
    topReturners,
    topReturnedSkus,
    recentUploads,
  });
}
