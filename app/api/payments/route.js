import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { parsePaymentReport } from '@/lib/paymentReport';
import { syncOrdersFromPayments } from '@/lib/paymentSync';
import { buildPaymentReport } from '@/lib/payments';
import PaymentLine from '@/models/PaymentLine';
import PaymentUpload from '@/models/PaymentUpload';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    await dbConnect();
    return NextResponse.json(await buildPaymentReport());
  } catch (err) {
    console.error('Payments failed:', err);
    return NextResponse.json({ error: `Server error: ${err.message}` }, { status: 500 });
  }
}

// Upload a Meesho payment report. Uploading the same report again only updates its rows.
export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file !== 'object' || !file.size) {
      return NextResponse.json({ error: 'No file received' }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name || '')) {
      return NextResponse.json({ error: 'Please upload an .xlsx file' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = await parsePaymentReport(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    await dbConnect();
    const upload = await PaymentUpload.create({ fileName: file.name, lines: parsed.lines.length, warnings: parsed.warnings });
    const result = await PaymentLine.bulkWrite(
      parsed.lines.map((line) => ({
        replaceOne: { filter: { key: line.key }, replacement: { ...line, upload: upload._id }, upsert: true },
      }))
    );

    // Rows that were waiting for payment are replaced once the payment appears
    const paidSubs = parsed.lines.filter((l) => l.transactionId).map((l) => l.subOrderNo);
    await PaymentLine.deleteMany({ subOrderNo: { $in: paidSubs }, transactionId: '' });

    upload.inserted = result.upsertedCount;
    upload.updated = parsed.lines.length - result.upsertedCount;
    await upload.save();

    // Update orders, returns, dashboard etc. from this report
    const subs = [...new Set(parsed.lines.map((l) => l.subOrderNo))];
    const sync = await syncOrdersFromPayments({ subs });

    const days = (field) =>
      [...new Set(parsed.lines.map((l) => l[field]).filter(Boolean).map((d) => d.toISOString().slice(0, 10)))].sort();
    return NextResponse.json({
      fileName: file.name,
      lines: parsed.lines.length,
      orders: subs.length,
      inserted: upload.inserted,
      updated: upload.updated,
      warnings: parsed.warnings,
      orderMonths: [...new Set(parsed.lines.map((l) => l.month).filter(Boolean))].sort(),
      paymentDays: days('paymentDate'),
      amount: Math.round(parsed.lines.reduce((s, l) => s + l.settlement, 0) * 100) / 100,
      sync,
    });
  } catch (err) {
    console.error('Payment upload failed:', err);
    return NextResponse.json({ error: `Server error: ${err.message}` }, { status: 500 });
  }
}
