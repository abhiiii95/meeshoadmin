'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { inr, pct } from '@/lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Money({ value, signed }) {
  const color = signed ? (value < 0 ? 'var(--red)' : 'var(--green)') : undefined;
  return <span style={{ color }}>{value < 0 ? `−${inr(-value)}` : inr(value)}</span>;
}

export default function PnlPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    fetch(`/api/pnl${year ? `?year=${year}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load profit & loss'));
  }, [year]);

  const t = data?.totals;
  const years = data?.years?.length ? data.years : [Number(year)];
  const returns = (r) => r.rto + r.customerReturns;

  return (
    <>
      <div className="page-head">
        <h1>Profit &amp; Loss</h1>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
          <option value="">All years</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}

      {t && (
        <>
          {t.missingCost > 0 && (
            <div className="alert alert-error">
              Purchase price is missing for {t.missingCost} sold item(s), so their cost isn&apos;t counted and profit
              is shown higher than it really is. <Link href="/products">Set purchase prices →</Link>
            </div>
          )}

          <div className="grid stats">
            <div className="card stat">
              <div className="label">Profit</div>
              <div className="value"><Money value={t.profit} signed /></div>
              <div className="sub">after returns, cost &amp; charges</div>
            </div>
            <div className="card stat">
              <div className="label">Orders</div>
              <div className="value">{t.orders}</div>
              <div className="sub">
                {t.items} pcs · {pct(t.orders ? t.returnedOrders / t.orders : 0)} returned
                {t.cancelled > 0 && ` · ${t.cancelled} cancelled`}
              </div>
            </div>
            <div className="card stat">
              <div className="label">Returns</div>
              <div className="value">{returns(t)}</div>
              <div className="sub">
                RTO {t.rto} · Customer {t.customerReturns}
                {t.wrongProducts > 0 && ` · Wrong ${t.wrongProducts}`}
              </div>
            </div>
            <div className="card stat">
              <div className="label">Net sales</div>
              <div className="value">{inr(t.netSales)}</div>
              <div className="sub">{inr(t.sales)} sold − {inr(t.returnedSales)} returned</div>
            </div>
            <div className="card stat">
              <div className="label">Product cost</div>
              <div className="value">{inr(t.productCost)}</div>
              <div className="sub">items kept by customers</div>
            </div>
            <div className="card stat">
              <div className="label">Return losses</div>
              <div className="value" style={{ color: 'var(--red)' }}>{inr(t.returnCharges + t.lostValue)}</div>
              <div className="sub">
                Meesho charge {inr(t.returnCharges)} · Wrong product {inr(t.lostValue)}
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 15 }}>Month-wise</h2>
          <div className="table-wrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Orders</th>
                  <th className="num">Returns</th>
                  <th className="num">Sales</th>
                  <th className="num">Returned sales</th>
                  <th className="num">Net sales</th>
                  <th className="num">Product cost</th>
                  <th className="num">Meesho return charge</th>
                  <th className="num">Wrong product loss</th>
                  <th className="num">Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={`${m.year}-${m.month}`}>
                    <td className="card-title">
                      <strong>{MONTHS[m.month - 1]} {m.year}</strong>
                      {m.missingCost > 0 && (
                        <div className="small" style={{ color: 'var(--amber)' }}>{m.missingCost} item(s) without cost</div>
                      )}
                    </td>
                    <td className="num half" data-label="Orders">
                      <Link href={`/orders?from=${m.year}-${String(m.month).padStart(2, '0')}-01&to=${m.year}-${String(m.month).padStart(2, '0')}-${new Date(Date.UTC(m.year, m.month, 0)).getUTCDate()}`}>
                        {m.orders}
                      </Link>
                      <div className="muted small">
                        {m.items} pcs{m.cancelled > 0 && ` · ${m.cancelled} cancelled`}
                      </div>
                    </td>
                    <td className="num half" data-label="Returns">
                      <strong style={{ color: returns(m) ? 'var(--red)' : undefined }}>{returns(m)}</strong>
                      <div className="muted small">
                        RTO {m.rto} · Cust {m.customerReturns}
                        {m.wrongProducts > 0 && ` · Wrong ${m.wrongProducts}`}
                      </div>
                    </td>
                    <td className="num half" data-label="Sales">{inr(m.sales)}</td>
                    <td className="num half" data-label="Returned sales">−{inr(m.returnedSales)}</td>
                    <td className="num half" data-label="Net sales">{inr(m.netSales)}</td>
                    <td className="num half" data-label="Product cost">−{inr(m.productCost)}</td>
                    <td className="num half" data-label="Meesho return charge" style={{ color: m.returnCharges ? 'var(--red)' : undefined }}>
                      −{inr(m.returnCharges)}
                    </td>
                    <td className="num half" data-label="Wrong product loss" style={{ color: m.lostValue ? 'var(--red)' : undefined }}>
                      −{inr(m.lostValue)}
                    </td>
                    <td className="num" data-label="Profit">
                      <strong><Money value={m.profit} signed /></strong>
                    </td>
                  </tr>
                ))}
                {!data.months.length && (
                  <tr>
                    <td colSpan={10} className="empty">No orders in this period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="muted small" style={{ marginTop: 12 }}>
            Profit = Net sales (invoice value of orders not returned) − product cost of those items − Meesho return
            charges (₹157 per customer return, ₹0 for RTO) − purchase value of products lost when a wrong product came
            back. Returns are counted in the month the order was placed. Cancelled orders are not counted in sales or
            profit.
          </p>
        </>
      )}
    </>
  );
}
