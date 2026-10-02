'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/upload', label: 'Upload PDF' },
  { href: '/orders', label: 'Orders' },
  { href: '/customers', label: 'Customers' },
  { href: '/returns', label: 'Returns' },
  { href: '/pnl', label: 'Profit & Loss' },
  { href: '/products', label: 'Products' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer after navigating
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock page scroll and allow Esc while the drawer is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const current = LINKS.find((l) => (l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)));

  return (
    <>
      {/* Mobile top bar */}
      <header className="topbar">
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="topbar-title">{current?.label || 'Meesho Admin'}</span>
        <Link href="/upload" className="topbar-action">
          + Upload
        </Link>
      </header>

      <div className={`drawer-overlay${open ? ' show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          Meesho <span>Admin</span>
          <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
            ×
          </button>
        </div>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`nav-link${current?.href === l.href ? ' active' : ''}`}>
            {l.label}
          </Link>
        ))}
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </aside>
    </>
  );
}
