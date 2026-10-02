import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { extractPages } from '@/lib/pdf';
import { parsePage, splitLabels } from '@/lib/parser';
import { cloudinaryEnabled, uploadBuffer } from '@/lib/cloudinary';
import Order from '@/models/Order';
import Upload from '@/models/Upload';

export const runtime = 'nodejs';
export const maxDuration = 60;

// New order → insert. Existing order → refresh PDF data but keep return marks.
async function saveOrder(data, result) {
  const existing = await Order.findOne({ orderNo: data.orderNo });
  if (!existing) {
    await Order.create(data);
    result.inserted++;
    return;
  }
  const prev = new Map(existing.items.map((i) => [i.subOrderNo, i]));
  data.items = data.items.map((it) => {
    const p = prev.get(it.subOrderNo);
    if (!p) return it;
    const { returned, returnType, returnReason, returnedAt, returnCharge, wrongProduct, lostValue } = p;
    return { ...it, returned, returnType, returnReason, returnedAt, returnCharge, wrongProduct, lostValue };
  });
  existing.set(data);
  existing.refreshStatus();
  await existing.save();
  result.updated++;
}

export async function GET() {
  await dbConnect();
  const uploads = await Upload.find().sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({ uploads });
}

export async function POST(req) {
  await dbConnect();
  const form = await req.formData();
  const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size > 0);
  if (!files.length) return NextResponse.json({ error: 'No PDF files received' }, { status: 400 });

  const results = [];
  for (const file of files) {
    const result = { fileName: file.name, pages: 0, labels: 0, inserted: 0, updated: 0, failed: [] };
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pages = await extractPages(buffer);
      result.pages = pages.length;

      let pdfUrl = '';
      let pdfPublicId = '';
      if (cloudinaryEnabled) {
        try {
          const up = await uploadBuffer(buffer, {
            folder: 'meesho-labels',
            resource_type: 'raw',
            public_id: `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`,
          });
          pdfUrl = up.secure_url;
          pdfPublicId = up.public_id;
        } catch (err) {
          result.cloudinaryError = err.message;
        }
      }

      const upload = await Upload.create({ fileName: file.name, pdfUrl, pdfPublicId, pages: pages.length });

      for (let i = 0; i < pages.length; i++) {
        const pageNo = i + 1;
        const labels = splitLabels(pages[i]);
        if (!labels.length) {
          if (pages[i].some((it) => it.str?.trim())) {
            result.failed.push({ page: pageNo, reason: 'No Meesho label found on this page' });
          } else {
            result.failed.push({ page: pageNo, reason: 'Page has no text (scanned image / photo PDF?)' });
          }
          continue;
        }
        for (let l = 0; l < labels.length; l++) {
          const where = labels.length > 1 ? `${pageNo} (label ${l + 1})` : String(pageNo);
          result.labels++;
          let parsed;
          try {
            parsed = parsePage(labels[l]);
          } catch (err) {
            result.failed.push({ page: where, reason: `Parse error: ${err.message}` });
            continue;
          }
          if (!parsed?.orderNo) {
            result.failed.push({ page: where, reason: 'Order number not found' });
            continue;
          }
          try {
            await saveOrder({ ...parsed, upload: upload._id, pdfUrl, page: pageNo }, result);
          } catch (err) {
            result.failed.push({ page: where, reason: err.message });
          }
        }
      }

      upload.labels = result.labels;
      upload.inserted = result.inserted;
      upload.updated = result.updated;
      upload.failed = result.failed;
      await upload.save();
    } catch (err) {
      result.failed.push({ page: '-', reason: `Could not read PDF: ${err.message}` });
    }
    results.push(result);
  }

  return NextResponse.json({ results });
}
