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

  // Cancelled orders: no sale, no cost, no charge — only counted
  const cancelledRows = await Order.aggregate([
    { $match: { ...match, status: 'cancelled' } },
    { $group: { _id: { y: { $year: '$orderDate' }, m: { $month: '$orderDate' } }, n: { $sum: 1 } } },
  ]);
  const cancelledBy = Object.fromEntries(cancelledRows.map((c) => [`${c._id.y}-${c._id.m}`, c.n]));

  const rows = await Order.aggregate([
    { $match: { ...match, status: { $ne: 'cancelled' } } },
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
    const cancelled = cancelledBy[`${r.year}-${r.month}`] || 0;
    delete cancelledBy[`${r.year}-${r.month}`];
    return { ...r, cancelled, netSales, profit: netSales - r.productCost - r.returnCharges - r.lostValue };
  });
  // Months that only have cancelled orders
  for (const [key, n] of Object.entries(cancelledBy)) {
    const [y, m] = key.split('-').map(Number);
    months.push({
      year: y, month: m, orders: 0, returnedOrders: 0, items: 0, sales: 0, returnedSales: 0, netSales: 0,
      rto: 0, customerReturns: 0, wrongProducts: 0, returnCharges: 0, lostValue: 0, productCost: 0,
      missingCost: 0, profit: 0, cancelled: n,
    });
  }
  months.sort((a, b) => b.year - a.year || b.month - a.month);

  const keys = ['orders', 'cancelled', 'returnedOrders', 'items', 'sales', 'returnedSales', 'netSales', 'rto', 'customerReturns',
    'wrongProducts', 'returnCharges', 'lostValue', 'productCost', 'missingCost', 'profit'];
  const totals = Object.fromEntries(keys.map((k) => [k, months.reduce((s, m) => s + (m[k] || 0), 0)]));

  const years = (await Order.aggregate([
    { $match: { orderDate: { $ne: null } } },
    { $group: { _id: { $year: '$orderDate' } } },
    { $sort: { _id: -1 } },
  ])).map((y) => y._id);

  return NextResponse.json({ months, totals, years });
}
