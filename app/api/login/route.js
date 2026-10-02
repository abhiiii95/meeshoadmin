import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkCredentials, createSession } from '@/lib/session';

export async function POST(req) {
  const { email = '', password = '' } = await req.json().catch(() => ({}));
  if (!checkCredentials(email, password)) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(email.trim().toLowerCase()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
