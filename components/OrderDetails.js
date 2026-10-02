'use client';

import StatusBadge from '@/components/StatusBadge';
import { fmtDate, inr } from '@/lib/format';

function Field({ label, value, mono }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className={mono ? 'mono' : ''}>{value || value === 0 ? value : <span className="muted">—</span>}</div>
    </div>
  );
}

// Everything read from the label PDF for one order
export default function OrderDetails({ order: o, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h3>
            Order {o.orderNo} <StatusBadge status={o.status} />
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {o.pdfUrl && (
              <a className="btn btn-sm" href={o.pdfUrl} target="_blank" rel="noreferrer">
                Open PDF (page {o.page})
              </a>
            )}
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <section>
          <h4>Shipping label</h4>
          <div className="fields">
            <Field label="Payment" value={o.paymentText || o.paymentType} />
            <Field label="Courier" value={o.courier} />
            <Field label="Pickup / Drop" value={[o.serviceType, o.pickupCode].filter(Boolean).join(' ')} />
            <Field label="AWB / Tracking no." value={o.awb} mono />
            <Field label="Destination code" value={o.destinationCode} mono />
            <Field label="Return code" value={o.returnCode} mono />
            <Field label="Sort codes" value={o.sortCodes?.join('  ·  ')} mono />
          </div>
        </section>

        <section className="fields fields-2">
          <div>
            <h4>Customer address</h4>
            <strong>{o.customer?.name}</strong>
            <div>{o.customer?.address}</div>
            <div className="muted small">
              City: {o.customer?.city || '—'} · State: {o.customer?.state || '—'} · Pincode: {o.customer?.pincode || '—'}
            </div>
          </div>
          <div>
            <h4>If undelivered, return to</h4>
            <div>{o.returnTo || <span className="muted">—</span>}</div>
          </div>
        </section>

        <section>
          <h4>Product details</h4>
          <div className="table-wrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Size</th>
                  <th className="num">Qty</th>
                  <th>Color</th>
                  <th>Sub order no.</th>
                  <th className="num">Gross</th>
                  <th className="num">Discount</th>
                  <th className="num">Total</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.subOrderNo || i.sku}>
                    <td className="mono" data-label="SKU">{i.sku}</td>
                    <td className="small" data-label="Description">{i.description}</td>
                    <td className="half" data-label="Size">{i.size}</td>
                    <td className="num half" data-label="Qty">{i.qty}</td>
                    <td className="half" data-label="Color">{i.color}</td>
                    <td className="mono half" data-label="Sub order no.">{i.subOrderNo}</td>
                    <td className="num half" data-label="Gross">{inr(i.grossAmount)}</td>
                    <td className="num half" data-label="Discount">{inr(i.discount)}</td>
                    <td className="num half" data-label="Total">{inr(i.total)}</td>
                    <td className="small half" data-label="Return">
                      {i.returned ? (
                        <>
                          <span className="badge badge-red">{i.returnType || 'Returned'}</span>
                          <div className="muted">{fmtDate(i.returnedAt)}</div>
                          {i.returnReason && <div>{i.returnReason}</div>}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6}><strong>Other charges</strong></td>
                  <td className="num half" data-label="Gross">{inr(o.otherChargesGross)}</td>
                  <td className="num half" data-label="Discount">{inr(o.otherChargesDiscount)}</td>
                  <td className="num half" data-label="Total">{inr(o.otherCharges)}</td>
                  <td className="half"></td>
                </tr>
                <tr>
                  <td colSpan={8} className="half">
                    <strong>Order total</strong>
                  </td>
                  <td className="num half">
                    <strong>{inr(o.totalAmount)}</strong>
                  </td>
                  <td className="hide-mobile"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h4>
            {o.invoiceTitle || 'Invoice'} {o.invoiceCopy && <span className="muted small">({o.invoiceCopy})</span>}
          </h4>
          <div className="fields">
            <Field label="Order no." value={o.orderNo} mono />
            <Field label="Invoice no." value={o.invoiceNo} mono />
            <Field label="Order date" value={fmtDate(o.orderDate)} />
            <Field label="Invoice date" value={fmtDate(o.invoiceDate)} />
            <Field label="Sold by" value={o.soldBy} />
            <Field label="Seller address" value={o.sellerAddress} />
            <Field label="Enrolment no." value={o.enrolmentNo} mono />
            {o.gstin && <Field label="GSTIN" value={o.gstin} mono />}
            <Field label="Bill to / Ship to" value={o.billTo} />
            <Field label="Place of supply" value={o.placeOfSupply} />
          </div>
          {o.invoiceNote && <p className="muted small">{o.invoiceNote}</p>}
        </section>
      </div>
    </div>
  );
}
