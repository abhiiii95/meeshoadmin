'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CostPrompt from '@/components/CostPrompt';
import { fmtDate, inr } from '@/lib/format';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => {
  const [y, mo] = String(m).split('-');
  return MONTH_NAMES[+mo - 1] ? `${MONTH_NAMES[+mo - 1]} ${y}` : 'No date';
};

const VIEWS = [
  { key: 'months', label: 'Monthly profit / loss' },
  { key: 'dates', label: 'Payments received' },
  { key: 'orders', label: 'Orders' },
  { key: 'fix', label: 'To fix' },
  { key: 'upload', label: 'Upload Excel' },
];

const TABS = [
  { key: '', label: 'All', cls: '' },
  { key: 'delivered', label: 'Delivered', cls: 'tab-green' },
  { key: 'return', label: 'Customer Return', cls: 'tab-red' },
  { key: 'rto', label: 'RTO', cls: 'tab-amber' },
  { key: 'other', label: 'Shipped / Other', cls: '' },
  { key: 'claim', label: 'Claims', cls: '' },
  { key: 'cancelled', label: 'Cancelled', cls: 'tab-grey' },
];
const STATUS_BADGE = {
  delivered: 'badge-green',
  return: 'badge-red',
  rto: 'badge-amber',
  other: 'badge-grey',
  claim: 'badge-grey',
  cancelled: 'badge-grey',
};

function Rupees({ value, signed }) {
  const color = signed ? (value < 0 ? 'var(--red)' : 'var(--green)') : undefined;
  return <span style={{ color }}>{value < 0 ? `−${inr(-value)}` : inr(value)}</span>;
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <PaymentsView />
    </Suspense>
  );
}

function PaymentsView() {
  const sp = useSearchParams();
  const [view, setView] = useState(VIEWS.some((v) => v.key === sp.get('view')) ? sp.get('view') : 'months');
  const inputRef = useRef(null);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [month, setMonth] = useState('');
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [details, setDetails] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/payments');
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setData(json);
      setLoadError('');
    } else {
      setLoadError(json.error || 'Could not load payments');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setUploadError('');
    setResult(null);
    const form = new FormData();
    form.append('file', file);
    let res;
    try {
      res = await fetch('/api/payments', { method: 'POST', body: form });
    } catch {
      setBusy(false);
      setUploadError('Network error: could not reach the server. Check your internet and try again.');
      return;
    }
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.status === 413) {
      setUploadError('File too large for the server (max ~4 MB).');
      return;
    }
    if (!res.ok) {
      setUploadError(json.error || `Upload failed (server error ${res.status}).`);
      return;
    }
    setResult(json);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
    load();
  }

  async function applyToPanel(m) {
    const body = m.reportType
      ? { subOrderNo: m.subOrderNo, returned: true, returnType: m.reportType, returnCharge: m.returnCharge }
      : { subOrderNo: m.subOrderNo, returned: false };
    const res = await fetch(`/api/orders/${m.orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || 'Could not update the order');
      return;
    }
    load();
  }

  const orders = data?.orders || [];
  const inMonth = month ? orders.filter((o) => o.month === month) : orders;
  const needle = q.trim().toLowerCase();
  const visible = inMonth.filter(
    (o) =>
      (!tab || o.category === tab) &&
      (!needle ||
        [o.subOrderNo, o.sku, o.customer, o.productName].some((v) => (v || '').toLowerCase().includes(needle)))
  );
  const tabCount = (key) => (key ? inMonth.filter((o) => o.category === key).length : inMonth.length);
  const t = data?.totals;
  const fixCount = (data?.mismatches?.length || 0) + (data?.missingCosts?.length || 0);

  async function resync() {
    setSyncing(true);
    const res = await fetch('/api/payments/sync', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    setSyncing(false);
    if (res.ok) setSyncResult(json);
    else setUploadError(json.error || 'Could not update the other sections');
    load();
  }

  return (
    <>
      <div className="page-head">
        <h1>Payments (Excel)</h1>
      </div>

      <div className="tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            className={`tab${view === v.key ? ' on' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
            {v.key === 'fix' && fixCount > 0 && <span className="tab-count">{fixCount}</span>}
          </button>
        ))}
      </div>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {!data && !loadError && <p className="muted">Loading…</p>}

      {view === 'upload' && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <h2>Upload Meesho payment report</h2>
            <p className="muted small" style={{ marginTop: -6 }}>
              Upload the .xlsx file downloaded from Meesho. It updates the Dashboard, Orders, Returns, Products and
              Profit &amp; Loss too. Uploading the same report again won&apos;t count anything twice.
            </p>
            <div className="filters" style={{ margin: 0 }}>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                  setUploadError('');
                }}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button className="btn btn-primary" disabled={!file || busy} onClick={upload}>
                {busy ? 'Reading…' : 'Upload'}
              </button>
            </div>
            {uploadError && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{uploadError}</div>}
            {result && (
              <div className="alert alert-ok" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>{result.fileName}</strong>: {result.orders} orders · {result.inserted} new rows ·{' '}
                {result.updated} already saved
                <div className="small" style={{ marginTop: 6 }}>
                  Orders placed in: {result.orderMonths.map(monthLabel).join(', ') || '—'}
                  <br />
                  Payment dates: {result.paymentDays.map((d) => fmtDate(d)).join(', ') || 'not paid yet'} ·{' '}
                  {inr(result.amount)}
                  <br />
                  Other sections: {result.sync.created} orders added · {result.sync.changes.length} orders updated
                </div>
                <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setView('dates')}>
                  See payments received →
                </button>
              </div>
            )}
            {result?.warnings?.map((w) => (
              <div className="alert alert-error" style={{ marginTop: 8, marginBottom: 0 }} key={w}>{w}</div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h2>Update other sections again</h2>
            <p className="muted small" style={{ marginTop: -6 }}>
              Applies all uploaded reports to Orders, Returns and the Dashboard. You only need this if something looks
              out of date.
            </p>
            <button className="btn" disabled={syncing} onClick={resync}>
              {syncing ? 'Updating…' : 'Update now'}
            </button>
            {syncResult && (
              <div className="alert alert-ok" style={{ marginTop: 12, marginBottom: 0 }}>
                {syncResult.created} orders added · {syncResult.changes.length} orders updated
              </div>
            )}
          </div>

          {data?.uploads?.length > 0 && (
            <>
              <h2 style={{ fontSize: 15 }}>Upload history</h2>
              <ul className="list card">
                {data.uploads.map((u) => (
                  <li key={u._id}>
                    <span>
                      {u.fileName}
                      <div className="muted small">{fmtDate(u.createdAt)}</div>
                    </span>
                    <span className="small nowrap">{u.inserted ?? 0} new · {u.updated ?? 0} already saved</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {data && !orders.length && view !== 'upload' && (
        <div className="card empty">
          No payment report yet.{' '}
          <button className="btn btn-sm" onClick={() => setView('upload')}>Upload Excel</button>
        </div>
      )}

      {t && orders.length > 0 && view === 'months' && (
        <>
          <div className="grid stats">
            <div className="card stat">
              <div className="label">{t.profit < 0 ? 'Net loss' : 'Net profit'}</div>
              <div className="value"><Rupees value={t.profit} signed /></div>
              <div className="sub">after cost, packaging &amp; returns</div>
            </div>
            <div className="card stat">
              <div className="label">Payment received</div>
              <div className="value"><Rupees value={t.settlement} /></div>
              <div className="sub">from Meesho, on {t.orders} orders</div>
            </div>
            <div className="card stat">
              <div className="label">Loss on returns</div>
              <div className="value"><Rupees value={-t.returnLoss} signed /></div>
              <div className="sub">returns, RTO &amp; lost products, after claims</div>
            </div>
            <div className="card stat">
              <div className="label">Claims received</div>
              <div className="value"><Rupees value={t.claims} /></div>
              <div className="sub">paid by Meesho for wrong products</div>
            </div>
          </div>

          {t.missingCost > 0 && (
            <div className="alert alert-error">
              {t.missingCost} order(s) have no product cost, so profit is shown too high.{' '}
              <button className="btn btn-sm" onClick={() => setView('fix')}>Enter cost</button>
            </div>
          )}

          <h2 style={{ fontSize: 15 }}>By the month the order was placed</h2>
          <div className="grid month-cards">
            {data.months.map((m) => (
              <div className="card month-card" key={m.month}>
                <div className="month-head">
                  <strong style={{ fontSize: 16 }}>{monthLabel(m.month)}</strong>
                  <strong className="month-result"><Rupees value={m.profit} signed /></strong>
                </div>
                <div className="small muted">
                  {m.orders} orders · Delivered {m.counts.delivered} · Return {m.counts.return} · RTO {m.counts.rto}
                  {m.counts.other > 0 && ` · Shipped/other ${m.counts.other}`}
                  {m.counts.claim > 0 && ` · Claim ${m.counts.claim}`}
                  {m.counts.cancelled > 0 && ` · Cancelled ${m.counts.cancelled}`}
                </div>

                <ul className="calc">
                  <li><span>Payment received</span><Rupees value={m.settlement} /></li>
                  <li><span>Product cost</span><Rupees value={-m.productCost} /></li>
                  <li><span>Packaging (₹{data.packagingPerOrder} × {m.orders})</span><Rupees value={-m.packaging} /></li>
                  {m.lostValue > 0 && <li><span>Products lost (wrong return)</span><Rupees value={-m.lostValue} /></li>}
                  <li className="total">
                    <span>{m.profit < 0 ? 'Loss' : 'Profit'}</span>
                    <Rupees value={m.profit} signed />
                  </li>
                </ul>
                <div className="small muted">
                  Included above: Meesho shipping <Rupees value={m.shippingCharge} /> · return charges{' '}
                  <Rupees value={m.returnCharge} /> · claims <Rupees value={m.claims} />
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  Loss on returns: <strong><Rupees value={-m.returnLoss} signed /></strong>
                </div>

                <div className="field-label" style={{ marginTop: 10 }}>Payment came on</div>
                {m.payments.length ? (
                  <ul className="calc">
                    {m.payments.map((p) => (
                      <li key={`${p.transactionId}-${p.date}`}>
                        <span>
                          {fmtDate(p.date)} <span className="muted small">· {p.lines} row{p.lines > 1 ? 's' : ''}</span>
                        </span>
                        <Rupees value={p.amount} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="small muted">No payment yet</div>
                )}
                {m.unpaidOrders > 0 && <div className="small" style={{ color: 'var(--amber)' }}>{m.unpaidOrders} order(s) not paid yet</div>}

                <button
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    setMonth(m.month);
                    setTab('');
                    setView('orders');
                  }}
                >
                  Show these orders
                </button>
              </div>
            ))}
          </div>

          <p className="muted small" style={{ marginTop: 12 }}>
            Profit = payment received − product cost of orders kept (delivered / shipped) − ₹{data.packagingPerOrder}{' '}
            packaging per order − products lost to wrong returns. Returned and RTO products come back, so their cost
            isn&apos;t counted. Only rows in the uploaded reports are counted, so upload all your reports. Meesho says
            these amounts are estimates and can change.
          </p>
        </>
      )}

      {t && orders.length > 0 && view === 'dates' && (
        <>
          <h2 style={{ fontSize: 15 }}>By the month the money came</h2>
          <div className="grid month-cards">
            {data.paymentMonths.map((m) => (
              <div className="card month-card" key={m.month}>
                <div className="month-head">
                  <strong style={{ fontSize: 16 }}>{monthLabel(m.month)}</strong>
                  <strong className="month-result"><Rupees value={m.amount} signed /></strong>
                </div>
                <div className="small muted">{m.orders} orders · {m.rows} rows</div>
                <div className="field-label" style={{ marginTop: 10 }}>Payment dates</div>
                <ul className="calc">
                  {m.dates.map((d) => (
                    <li key={d.date}>
                      <span>
                        {fmtDate(d.date)} <span className="muted small">· {d.rows} row{d.rows > 1 ? 's' : ''}</span>
                      </span>
                      <Rupees value={d.amount} />
                    </li>
                  ))}
                </ul>
                <div className="field-label" style={{ marginTop: 10 }}>For orders placed in</div>
                <ul className="calc">
                  {m.orderMonths.map((o) => (
                    <li key={o.month}>
                      <span>{monthLabel(o.month)}</span>
                      <Rupees value={o.amount} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {t && orders.length > 0 && view === 'orders' && (
        <>
          <div className="tabs" role="tablist">
            {TABS.filter((x) => !x.key || tabCount(x.key) > 0 || tab === x.key).map((x) => (
              <button
                key={x.key || 'all'}
                type="button"
                role="tab"
                aria-selected={tab === x.key}
                className={`tab ${x.cls}${tab === x.key ? ' on' : ''}`}
                onClick={() => setTab(x.key)}
              >
                {x.label}
                <span className="tab-count">{tabCount(x.key)}</span>
              </button>
            ))}
          </div>

          <div className="filters">
            <input
              type="search"
              placeholder="Sub order no, SKU, customer, product…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {data.months.map((m) => (
                <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Order date</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Payment date</th>
                  <th className="num">Payment</th>
                  <th className="num">Cost + packaging</th>
                  <th className="num">Profit / loss</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.subOrderNo}>
                    <td className="nowrap half" data-label="Order date">{fmtDate(o.orderDate)}</td>
                    <td data-label="Order" style={{ minWidth: 240 }}>
                      {o.customer && <strong>{o.customer}</strong>}
                      <div className="mono" style={{ wordBreak: 'break-all' }}>{o.subOrderNo}</div>
                      <div className="mono muted">{o.sku}</div>
                      {!o.inPanel && <div className="small" style={{ color: 'var(--amber)' }}>Label not uploaded</div>}
                    </td>
                    <td className="half" data-label="Status">
                      <span className={`badge ${STATUS_BADGE[o.category]}`}>{o.status}</span>
                      {o.wrongProduct && <div className="small" style={{ color: 'var(--red)', marginTop: 2 }}>Wrong product</div>}
                    </td>
                    <td className="small nowrap half" data-label="Payment date">
                      {o.payments.length
                        ? o.payments.map((p) => <div key={`${p.transactionId}${p.status}`}>{fmtDate(p.date)}</div>)
                        : <span className="muted">Not paid yet</span>}
                    </td>
                    <td className="num half" data-label="Payment">
                      <Rupees value={o.settlement} />
                      {o.payments.length > 1 && <div className="muted small">{o.payments.length} rows</div>}
                    </td>
                    <td className="num half" data-label="Cost + packaging">
                      <Rupees value={o.productCost + o.lostValue + o.packaging} />
                      {o.needsCost && <div className="small" style={{ color: 'var(--amber)' }}>Cost missing</div>}
                    </td>
                    <td className="num half" data-label="Profit / loss">
                      <strong><Rupees value={o.profit} signed /></strong>
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-sm" onClick={() => setDetails(o)}>Details</button>
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={8} className="empty">No orders here</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && view === 'fix' && (
        <>
          {data.missingCosts.length > 0 && (
            <CostPrompt
              key={data.missingCosts.map((m) => m.sku).join()}
              items={data.missingCosts}
              title="Enter product cost to get the correct profit"
              onSaved={load}
            />
          )}

          {data.mismatches.length > 0 && (
            <div className="card" style={{ marginBottom: 18, borderColor: '#f0d49a' }}>
              <h2>{data.mismatches.length} order(s) still don&apos;t match your Orders page</h2>
              <p className="muted small" style={{ marginTop: -6 }}>
                These were not changed automatically: the return was marked by you and the report doesn&apos;t show it.
                It may be newer than the report, so check on Meesho.
              </p>
              <ul className="list">
                {data.mismatches.map((m) => (
                  <li key={m.subOrderNo}>
                    <span style={{ minWidth: 0 }}>
                      <span className="mono" style={{ wordBreak: 'break-all' }}>{m.subOrderNo}</span>
                      <div className="small">
                        {m.customer && <strong>{m.customer} · </strong>}
                        Report: {m.reportStatus} · Orders page: {m.panelType || 'Not returned'}
                      </div>
                    </span>
                    <button className="btn btn-sm" style={{ flexShrink: 0, alignSelf: 'center' }} onClick={() => applyToPanel(m)}>
                      {m.reportType ? `Mark as ${m.reportType}` : 'Remove return'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.notInPanel > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <h2>{data.notInPanel} order(s) have no customer name</h2>
              <p className="muted small" style={{ margin: 0 }}>
                They came only from Excel, which has no customer details. They count in orders, returns and profit, but
                not in the Customers page or fraud checks. Upload their label PDF to add the customer.
              </p>
            </div>
          )}

          {fixCount === 0 && !data.notInPanel && <div className="card empty">Nothing to fix 🎉</div>}
        </>
      )}

      {details && <PaymentDetails order={details} onClose={() => setDetails(null)} />}
    </>
  );
}

// Every column Meesho sent for this order, row by row
function PaymentDetails({ order, onClose }) {
  const [lines, setLines] = useState(null);

  useEffect(() => {
    fetch(`/api/payments/${encodeURIComponent(order.subOrderNo)}`)
      .then((r) => r.json())
      .then((d) => setLines(d.lines || []))
      .catch(() => setLines([]));
  }, [order.subOrderNo]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h3 style={{ wordBreak: 'break-all' }}>{order.subOrderNo}</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        <ul className="calc">
          <li><span>Payment received</span><Rupees value={order.settlement} /></li>
          <li><span>Product cost</span><Rupees value={-order.productCost} /></li>
          {order.lostValue > 0 && <li><span>Product lost (wrong return)</span><Rupees value={-order.lostValue} /></li>}
          <li><span>Packaging</span><Rupees value={-order.packaging} /></li>
          <li className="total"><span>{order.profit < 0 ? 'Loss' : 'Profit'}</span><Rupees value={order.profit} signed /></li>
        </ul>
        {order.claimReason && <div className="small">Claim: {order.claimReason}</div>}

        {!lines && <p className="muted">Loading…</p>}
        {lines?.map((l, i) => (
          <section key={l.key}>
            <h4>Report row {i + 1}{l.paymentDate ? ` · paid ${fmtDate(l.paymentDate)}` : ''}</h4>
            <div className="fields">
              {Object.entries(l.raw || {})
                .filter(([, v]) => !['0', '0.0', '-0.0'].includes(String(v)))
                .map(([k, v]) => (
                  <div className="field" key={k}>
                    <div className="field-label">{k}</div>
                    <div style={{ wordBreak: 'break-word' }}>{v}</div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
