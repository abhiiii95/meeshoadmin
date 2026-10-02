'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RETURN_TYPES, defaultReturnCharge } from '@/lib/constants';
import { fmtDate, inr } from '@/lib/format';

export default function ReturnsPage() {
  const [codes, setCodes] = useState('');
  const [returnType, setReturnType] = useState(RETURN_TYPES[0]);
  const [returnCharge, setReturnCharge] = useState(String(defaultReturnCharge(RETURN_TYPES[0])));
  const [returnReason, setReturnReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [returned, setReturned] = useState([]);

  const loadReturned = () =>
    fetch('/api/orders?status=anyReturn&limit=100')
      .then((r) => r.json())
      .then((d) => setReturned(d.orders || []))
      .catch(() => {});

  useEffect(() => {
    loadReturned();
  }, []);

  async function submit(e) {
    e.preventDefault();
    const list = codes.split(/[\s,]+/).filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    const res = await fetch('/api/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: list, returnType, returnReason, returnCharge: Number(returnCharge) || 0 }),
    });
    const data = await res.json().catch(() => ({ results: [] }));
    setBusy(false);
    setResults(data.results);
    setCodes(data.results.filter((r) => !r.found).map((r) => r.code).join('\n'));
    loadReturned();
  }

  const rows = returned.flatMap((o) => o.items.filter((i) => i.returned).map((i) => ({ o, i })));
  rows.sort((a, b) => new Date(b.i.returnedAt || 0) - new Date(a.i.returnedAt || 0));

  return (
    <>
      <div className="page-head">
        <h1>Returns</h1>
      </div>

      <form className="card" onSubmit={submit} style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Mark returns in bulk</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Paste or scan AWB numbers, order numbers or sub order numbers (one per line). AWB / order number marks
          the whole order; a sub order number (e.g. 335290471204175040_1) marks only that item. Charge is per
          item: ₹157 for customer return, ₹0 for RTO.
        </p>
        <p className="small" style={{ margin: 0 }}>
          Wrong product came back? Mark that one from the <Link href="/orders">Orders</Link> page so you can enter
          its purchase value.
        </p>
        <textarea
          rows={6}
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          placeholder={'VL0085541628202\n335290471204175040'}
          className="mono"
        />
        <div className="filters" style={{ margin: 0 }}>
          <select
            value={returnType}
            onChange={(e) => {
              setReturnType(e.target.value);
              setReturnCharge(String(defaultReturnCharge(e.target.value)));
            }}
          >
            {RETURN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={returnCharge}
            onChange={(e) => setReturnCharge(e.target.value)}
            title="Meesho return charge per item"
            placeholder="Charge ₹"
            style={{ width: 110 }}
          />
          <input
            placeholder="Reason (optional)"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Mark returned'}
          </button>
        </div>
        {results && (
          <div>
            <div className="alert alert-ok" style={{ marginBottom: 6 }}>
              {results.filter((r) => r.found).length} marked as returned
            </div>
            {results.some((r) => !r.found) && (
              <div className="alert alert-error">
                Not found (left in the box): {results.filter((r) => !r.found).map((r) => r.code).join(', ')}
              </div>
            )}
          </div>
        )}
      </form>

      <h2 style={{ fontSize: 15 }}>Returned items ({rows.length})</h2>
      <div className="table-wrap">
        <table className="cards">
          <thead>
            <tr>
              <th>Returned on</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Order</th>
              <th>Item</th>
              <th>Reason</th>
              <th className="num">Amount</th>
              <th className="num">Charge</th>
              <th className="num">Product lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, i }) => (
              <tr key={`${o._id}-${i.subOrderNo}`}>
                <td className="nowrap half" data-label="Returned on">{fmtDate(i.returnedAt)}</td>
                <td className="half" data-label="Type">
                  <span className="badge badge-red">{i.returnType || 'Returned'}</span>
                  {i.wrongProduct && <span className="badge badge-red" style={{ marginLeft: 4 }}>Wrong product</span>}
                </td>
                <td data-label="Customer">
                  <strong>{o.customer?.name}</strong>
                  <div className="muted small">{o.customer?.city} {o.customer?.pincode}</div>
                </td>
                <td data-label="Order">
                  <div className="mono">{i.subOrderNo}</div>
                  <div className="muted mono">{o.awb}</div>
                </td>
                <td data-label="Item">
                  <div className="mono">{i.sku}</div>
                  <div className="muted small">{i.size} · {i.color} · Qty {i.qty}</div>
                </td>
                <td className="small half" data-label="Reason">{i.returnReason || <span className="muted">—</span>}</td>
                <td className="num half" data-label="Amount">{inr(i.total)}</td>
                <td className="num half" data-label="Charge" style={{ color: i.returnCharge ? 'var(--red)' : undefined }}>
                  {inr(i.returnCharge)}
                </td>
                <td className="num half" data-label="Product lost" style={{ color: i.lostValue ? 'var(--red)' : undefined }}>
                  {i.wrongProduct ? inr(i.lostValue) : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="empty">No returns yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
