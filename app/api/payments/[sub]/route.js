import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import PaymentLine from '@/models/PaymentLine';

// Every report row for one sub order, with all its columns
export async function GET(req, { params }) {
  const { sub } = await params;
  await dbConnect();
  const lines = await PaymentLine.find({ subOrderNo: sub }).sort({ paymentDate: 1 }).lean();
  return NextResponse.json({ lines });
}
