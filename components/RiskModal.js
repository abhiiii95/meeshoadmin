'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import RiskBadge from '@/components/RiskBadge';
import StatusBadge from '@/components/StatusBadge';
import { fmtDate, inr, pct } from '@/lib/format';

// Full risk report for one customer, with "Mark as fraud"
export default function RiskModal({ customerKey, onClose, onChanged }) {
  const [key, setKey] = useState(customerKey);
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const res = await fetch(`/api/customers/check?customerKey=${encodeURIComponent(key)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.customers?.[0]) setError('Customer not found');
    setC(data.customers?.[0] || null);
  }, [key]);

  useEffect(() => {
    setC(null);
    load();
  }, [load]);

  async function setFraud(on) {
    setSaving(true);
    const res = on
      ? await fetch('/api/customers/flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerKey: key, reason }),
        })
      : await fetch(`/api/customers/flag?customerKey=${encodeURIComponent(key)}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || 'Could not save');
      return;
    }
    setReason('');
    await load();
    onChanged?.();
  }

  const r = c?.risk;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h3>Customer check</h3>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {!c && !error && <p className="muted">Loading…</p>}

        {c && (
          <>
            <section className={`risk-panel risk-panel-${r.level}`}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 17 }}>{c.name}</strong>
                <RiskBadge risk={r} showLow />
              </div>
              <div className="small">{c.address}</div>
              <div className="muted small">
                {[c.city, c.state].filter(Boolean).join(', ')} · Pincode {c.pincode || '—'}
              </div>

              <ul className="reasons">
                {r.reasons.length ? (
                  r.reasons.map((x) => <li key={x}>{x}</li>)
                ) : (
                  <li className="ok">No warning signs found</li>
                )}
              </ul>
              {(r.level === 'high' || r.level === 'fraud') && (
                <div className="tip">
                  Tip: record a packing video before shipping, so you have proof if a wrong / empty product comes
                  back. If the order looks fake, cancel it from Meesho.
                </div>
              )}
            </section>

            <section>
              <h4>History</h4>
              <div className="fields">
                <Stat label="Orders" value={c.orders} sub={c.cancelledOrders ? `${c.cancelledOrders} cancelled` : ''} />
                <Stat label="Customer returns" value={c.customerReturns} bad={c.customerReturns > 0} />
                <Stat label="RTO" value={c.rto} sub={c.codRto ? `${c.codRto} COD refused` : ''} bad={c.rto > 0} />
                <Stat label="Wrong product" value={c.wrongProducts} bad={c.wrongProducts > 0} />
                <Stat label="Return rate" value={pct(c.returnRate)} bad={c.returnRate >= 0.5} />
                <Stat label="Money lost" value={inr(c.lossAmount)} bad={c.lossAmount > 0} />
                <Stat label="Total spent" value={inr(c.totalSpent)} />
                <Stat label="First / last order" value={fmtDate(c.firstOrder)} sub={fmtDate(c.lastOrder)} />
              </div>
            </section>

            {r.links.length > 0 && (
              <section>
                <h4>Possible same person</h4>
                <ul className="list">
                  {r.links.map((l) => (
                    <li key={l.customerKey}>
                      <button type="button" className="link-btn" onClick={() => setKey(l.customerKey)}>
                        {l.name}
                        <span className="muted small"> · {l.why}</span>
                      </button>
                      <span className="small nowrap">
                        {l.flagged && <span className="badge risk risk-fraud" style={{ marginRight: 6 }}>⚠ Fraud</span>}
                        {l.orders} orders · {l.returns} returns
                        {l.wrongProducts > 0 && ` · ${l.wrongProducts} wrong`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {c.recentOrders?.length > 0 && (
              <section>
                <h4>Recent orders</h4>
                <ul className="list">
                  {c.recentOrders.map((o) => (
                    <li key={o._id}>
                      <span>
                        <span className="mono">{o.orderNo}</span>
                        <div className="muted small">
                          {fmtDate(o.orderDate)} · {o.paymentType} · {o.items.map((i) => i.sku).join(', ')}
                        </div>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <StatusBadge status={o.status} />
                        <div className="small">{inr(o.totalAmount)}</div>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="risk-actions">
              {r.flagged ? (
                <button className="btn" disabled={saving} onClick={() => setFraud(false)}>
                  {saving ? 'Saving…' : 'Remove fraud mark'}
                </button>
              ) : (
                <div className="filters" style={{ margin: 0 }}>
                  <input
                    placeholder="Reason (e.g. sent back empty box)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <button className="btn btn-danger-solid" disabled={saving} onClick={() => setFraud(true)}>
                    {saving ? 'Saving…' : '⚠ Mark as fraud'}
                  </button>
                </div>
              )}
              <Link className="btn" href={`/orders?customerKey=${encodeURIComponent(key)}`} onClick={onClose}>
                View all orders →
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, bad }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div style={{ fontWeight: 600, color: bad ? 'var(--red)' : undefined }}>{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
