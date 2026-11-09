import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { syncOrdersFromPayments } from '@/lib/paymentSync';

export const maxDuration = 60;

// Re-applies every uploaded payment report to the orders. ?dryRun=1 only reports the changes.
export async function POST(req) {
  try {
    await dbConnect();
    const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
    return NextResponse.json({ dryRun, ...(await syncOrdersFromPayments({ dryRun })) });
  } catch (err) {
    console.error('Payment sync failed:', err);
    return NextResponse.json({ error: `Server error: ${err.message}` }, { status: 500 });
  }
}
