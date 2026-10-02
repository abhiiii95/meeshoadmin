'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/upload', label: 'Upload PDF' },
  { href: '/orders', label: 'Orders' },
  { href: '/customers', label: 'Customers' },
  { href: '/returns', label: 'Returns' },
  { href: '/products', label: 'Products' },
];

export default function Sidebar() {
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        Meesho <span>Admin</span>
      </div>
      {LINKS.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`nav-link${active ? ' active' : ''}`}>
            {l.label}
          </Link>
        );
      })}
      <div className="spacer" />
      <button className="btn btn-ghost" onClick={logout}>
        Log out
      </button>
    </aside>
  );
}
