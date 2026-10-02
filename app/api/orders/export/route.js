import { dbConnect } from '@/lib/db';
import { buildOrderFilter } from '@/lib/orderFilter';
import Order from '@/models/Order';

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export async function GET(req) {
  await dbConnect();
  const orders = await Order.find(buildOrderFilter(req.nextUrl.searchParams))
    .sort({ orderDate: -1 })
    .lean();

  const header = [
    'Order Date', 'Order No', 'Sub Order No', 'Invoice No', 'Customer', 'Address', 'City', 'State',
    'Pincode', 'Payment', 'Courier', 'Pickup/Drop', 'Pickup Code', 'AWB', 'Destination Code',
    'Return Code', 'Sort Codes', 'SKU', 'Description', 'Size', 'Color', 'Qty', 'Gross', 'Discount',
    'Total', 'Other Charges', 'Order Total', 'Invoice Date', 'Sold By', 'Seller Address',
    'Enrolment No', 'Place of Supply', 'Return To', 'Returned', 'Return Type', 'Return Reason',
    'Returned On', 'Return Charge', 'Wrong Product', 'Product Lost Value', 'Cancelled',
    'Cancel Reason',
  ];
  const rows = [header];
  for (const o of orders) {
    for (const i of o.items) {
      rows.push([
        day(o.orderDate), o.orderNo, i.subOrderNo, o.invoiceNo, o.customer?.name, o.customer?.address,
        o.customer?.city, o.customer?.state, o.customer?.pincode, o.paymentType, o.courier,
        o.serviceType, o.pickupCode, o.awb, o.destinationCode, o.returnCode, (o.sortCodes || []).join(' '),
        i.sku, i.description, i.size, i.color, i.qty, i.grossAmount, i.discount, i.total,
        o.otherCharges, o.totalAmount, day(o.invoiceDate), o.soldBy, o.sellerAddress, o.enrolmentNo,
        o.placeOfSupply, o.returnTo, i.returned ? 'Yes' : 'No', i.returnType, i.returnReason,
        day(i.returnedAt), i.returnCharge || 0, i.wrongProduct ? 'Yes' : 'No', i.lostValue || 0,
        o.cancelled ? 'Yes' : 'No', o.cancelReason,
      ]);
    }
  }
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="meesho-orders-${day(new Date())}.csv"`,
    },
  });
}
