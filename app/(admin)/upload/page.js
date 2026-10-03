'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import RiskBadge from '@/components/RiskBadge';
import RiskModal from '@/components/RiskModal';
import { fmtDate } from '@/lib/format';

export default function UploadPage() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const loadHistory = () =>
    fetch('/api/upload')
      .then((r) => r.json())
      .then((d) => setHistory(d.uploads || []))
      .catch(() => {});

  useEffect(() => {
    loadHistory();
  }, []);

  function pick(list) {
    const pdfs = [...list].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setFiles(pdfs);
    setResults(null);
    setError(pdfs.length ? '' : 'Please choose PDF files');
  }

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setError('');
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    let res;
    try {
      res = await fetch('/api/upload', { method: 'POST', body: form });
    } catch {
      setBusy(false);
      setError('Network error: could not reach the server. Check your internet / Wi-Fi and try again.');
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok || !data.results) {
      setError(data.error || `Upload failed (server error ${res.status}). Please try again.`);
      return;
    }
    setResults(data.results);
    setAlerts(data.alerts || []);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = '';
    loadHistory();
  }

  return (
    <>
      <div className="page-head">
        <h1>Upload Meesho label PDF</h1>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
        >
          <strong>Drop label PDFs here or click to choose</strong>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Each page is read as one order. Uploading an order again refreshes its data (return marks are kept).
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="small">{files.map((f) => f.name).join(', ')}</span>
            <button className="btn btn-primary" onClick={upload} disabled={busy}>
              {busy ? 'Reading PDF…' : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {results && alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 18, borderColor: 'var(--red)' }}>
          <h2 style={{ color: 'var(--red)' }}>
            ⚠ {alerts.length} risky customer{alerts.length > 1 ? 's' : ''} in this upload
          </h2>
          <p className="muted small" style={{ marginTop: -6 }}>
            Check these before packing. Record a packing video for proof, or cancel the order on Meesho if it looks
            fake.
          </p>
          {alerts.map((a) => (
            <div key={a.orderNo} className={`alert-card ${a.level}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  <strong>{a.name}</strong>{' '}
                  <span className="muted small">
                    · {a.city} {a.pincode} · AWB {a.awb}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <RiskBadge risk={a} />
                  <button className="btn btn-sm" onClick={() => setOpenKey(a.customerKey)}>
                    Details
                  </button>
                </span>
              </div>
              <ul>
                {a.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {results && alerts.length === 0 && (
        <div className="alert alert-ok">✓ No risky customers found in this upload.</div>
      )}

      {openKey && <RiskModal customerKey={openKey} onClose={() => setOpenKey(null)} />}

      {results && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Result</h2>
          {results.map((r) => (
            <div key={r.fileName} style={{ marginBottom: 10 }}>
              <div className={`alert ${r.failed.length ? 'alert-error' : 'alert-ok'}`}>
                <strong>{r.fileName}</strong>: {r.pages} page(s) · {r.labels} label(s) found · {r.inserted} new order(s) saved ·{' '}
                {r.updated} existing order(s) updated
                {r.failed.length > 0 && ` · ${r.failed.length} failed`}
              </div>
              {r.failed.map((f, i) => (
                <div key={i} className="small muted">
                  Page {f.page}: {f.reason}
                </div>
              ))}
              {r.cloudinaryError && (
                <div className="small muted">PDF not saved to Cloudinary: {r.cloudinaryError}</div>
              )}
            </div>
          ))}
          <Link href="/orders" className="btn">
            View orders →
          </Link>
        </div>
      )}

      <h2 style={{ fontSize: 15 }}>Upload history</h2>
      <div className="table-wrap">
        <table className="cards">
          <thead>
            <tr>
              <th>Date</th>
              <th>File</th>
              <th className="num">Pages</th>
              <th className="num">New</th>
              <th className="num">Updated</th>
              <th className="num">Failed</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {history.map((u) => (
              <tr key={u._id}>
                <td className="nowrap half" data-label="Date">{fmtDate(u.createdAt)}</td>
                <td className="half" data-label="File">{u.fileName}</td>
                <td className="num half" data-label="Pages">{u.pages}</td>
                <td className="num half" data-label="New">{u.inserted}</td>
                <td className="num half" data-label="Updated">{u.updated ?? u.duplicates ?? 0}</td>
                <td className="num half" data-label="Failed">{u.failed?.length || 0}</td>
                <td className="row-actions">{u.pdfUrl ? <a href={u.pdfUrl} target="_blank" rel="noreferrer">Open</a> : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan={7} className="empty">No uploads yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
