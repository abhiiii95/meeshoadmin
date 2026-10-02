import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import Order from '@/models/Order';

// Month-wise profit & loss, grouped by order month.
// profit = sales − returned sales − product cost − Meesho return charges − wrong-product losses
export async function GET(req) {
  await dbConnect();
  const year = parseInt(req.nextUrl.searchParams.get('year') || '', 10);

  const match = { orderDate: { $ne: null } };
  if (year) {
    match.orderDate = { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) };
  }

  const isRet = '$items.returned';
  const ifRet = (expr, cond = isRet) => ({ $cond: [cond, expr, 0] });
  const retType = (t) => ({ $and: [isRet, { $eq: ['$items.returnType', t] }] });

  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.sku', foreignField: 'sku', as: 'p' } },
    { $addFields: { unitCost: { $arrayElemAt: ['$p.purchasePrice', 0] } } },
    {
      $group: {
        _id: { y: { $year: '$orderDate' }, m: { $month: '$orderDate' } },
        orderIds: { $addToSet: '$_id' },
        returnedOrderIds: { $addToSet: { $cond: [isRet, '$_id', null] } },
        items: { $sum: '$items.qty' },
        sales: { $sum: '$items.total' },
        returnedSales: { $sum: ifRet('$items.total') },
        rto: { $sum: ifRet(1, retType('RTO')) },
        customerReturns: { $sum: ifRet(1, retType('Customer Return')) },
        wrongProducts: { $sum: ifRet(1, { $and: [isRet, '$items.wrongProduct'] }) },
        returnCharges: { $sum: ifRet({ $ifNull: ['$items.returnCharge', 0] }) },
        lostValue: { $sum: ifRet({ $ifNull: ['$items.lostValue', 0] }, { $and: [isRet, '$items.wrongProduct'] }) },
        // Only kept (not returned) items cost us the product
        productCost: {
          $sum: { $cond: [isRet, 0, { $multiply: [{ $ifNull: ['$unitCost', 0] }, '$items.qty'] }] },
        },
        missingCost: { $sum: { $cond: [{ $and: [{ $not: [isRet] }, { $eq: [{ $ifNull: ['$unitCost', null] }, null] }] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        year: '$_id.y',
        month: '$_id.m',
        orders: { $size: '$orderIds' },
        returnedOrders: {
          $size: { $filter: { input: '$returnedOrderIds', cond: { $ne: ['$$this', null] } } },
        },
        items: 1,
        sales: 1,
        returnedSales: 1,
        rto: 1,
        customerReturns: 1,
        wrongProducts: 1,
        returnCharges: 1,
        lostValue: 1,
        productCost: 1,
        missingCost: 1,
      },
    },
    { $sort: { year: -1, month: -1 } },
  ]);

  const months = rows.map((r) => {
    const netSales = r.sales - r.returnedSales;
    return { ...r, netSales, profit: netSales - r.productCost - r.returnCharges - r.lostValue };
  });

  const keys = ['orders', 'returnedOrders', 'items', 'sales', 'returnedSales', 'netSales', 'rto', 'customerReturns',
    'wrongProducts', 'returnCharges', 'lostValue', 'productCost', 'missingCost', 'profit'];
  const totals = Object.fromEntries(keys.map((k) => [k, months.reduce((s, m) => s + (m[k] || 0), 0)]));

  const years = (await Order.aggregate([
    { $match: { orderDate: { $ne: null } } },
    { $group: { _id: { $year: '$orderDate' } } },
    { $sort: { _id: -1 } },
  ])).map((y) => y._id);

  return NextResponse.json({ months, totals, years });
}
