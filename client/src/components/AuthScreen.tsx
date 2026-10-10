import React, { useState } from 'react';
import { Activity, ArrowRight, LockKeyhole, Shield, UserRound } from 'lucide-react';
import { AuthResponse, UserRole } from '../types';

interface AuthScreenProps {
  onAuthenticate: (response: AuthResponse, portal: UserRole) => void;
  onSubmit: (values: {
    mode: 'login' | 'register';
    email: string;
    password: string;
    display_name?: string;
    phone_number?: string;
  }) => Promise<AuthResponse>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticate, onSubmit }) => {
  const [portal, setPortal] = useState<UserRole>('survivor');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectPortal = (nextPortal: UserRole) => {
    setPortal(nextPortal);
    setMode('login');
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await onSubmit({
        mode,
        email,
        password,
        display_name: displayName,
        phone_number: phone || undefined,
      });
      if (response.user.role !== portal) {
        throw new Error(`This account belongs to the ${response.user.role} portal. Select that portal to continue.`);
      }
      onAuthenticate(response, portal);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0B0F17] px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center">
        <header className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-950/60 text-red-300">
            <Activity className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-wide">u-SHA-jua</p>
            <p className="text-sm text-slate-400">Community disaster response</p>
          </div>
        </header>

        <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-[#101827] shadow-2xl md:grid-cols-[1.1fr_0.9fr]">
          <section className="flex flex-col justify-between bg-[#111c2b] p-6 sm:p-10">
            <div>
              <p className="max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
                Reports reach the people ready to respond.
              </p>
              <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">
                Share a hazard report, follow its response status, or coordinate verified incidents as an operations administrator.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => selectPortal('survivor')}
                aria-pressed={portal === 'survivor'}
                className={`min-h-16 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  portal === 'survivor'
                    ? 'border-blue-400/70 bg-blue-950/50'
                    : 'border-white/10 bg-slate-900/50 hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4 text-blue-300" /> Survivor portal
                </span>
                <span className="mt-1 block text-xs text-slate-400">Report and track your own cases</span>
              </button>
              <button
                type="button"
                onClick={() => selectPortal('admin')}
                aria-pressed={portal === 'admin'}
                className={`min-h-16 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  portal === 'admin'
                    ? 'border-amber-400/70 bg-amber-950/40'
                    : 'border-white/10 bg-slate-900/50 hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="h-4 w-4 text-amber-300" /> Admin portal
                </span>
                <span className="mt-1 block text-xs text-slate-400">Triage and dispatch all reports</span>
              </button>
            </div>
            <p className="mt-6 text-xs leading-5 text-slate-400">
              For immediate danger, contact local emergency services. This platform does not replace emergency dispatch.
            </p>
          </section>

          <section className="p-6 sm:p-10">
            <div className="mb-6 flex items-center gap-2 text-slate-300">
              <LockKeyhole className="h-4 w-4" />
              <span className="text-sm font-medium">{portal === 'admin' ? 'Restricted operations access' : 'Private survivor account'}</span>
            </div>
            <h1 className="text-2xl font-bold">{mode === 'register' ? 'Create your account' : 'Sign in'}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {portal === 'admin'
                ? 'Use the administrator account provisioned by your organization.'
                : 'Your reports and contact details are visible only to you and authorized administrators.'}
            </p>

            {portal === 'admin' && (
              <p className="mt-4 rounded-lg bg-amber-950/40 px-3 py-2 text-xs leading-5 text-amber-100">
                Administrator accounts are provisioned by the system operator. Survivor registration cannot grant admin access.
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {portal === 'survivor' && mode === 'register' && (
                <>
                  <div>
                    <label htmlFor="signup-name" className="mb-1 block text-xs font-medium text-slate-200">Full name</label>
                    <input
                      id="signup-name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={120}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-phone" className="mb-1 block text-xs font-medium text-slate-200">Phone number (optional)</label>
                    <input
                      id="signup-phone"
                      type="tel"
                      autoComplete="tel"
                      pattern="^\+[1-9]\d{7,14}$"
                      placeholder="+2547XXXXXXXX"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Use international format if you want to receive SMS updates.</p>
                  </div>
                </>
              )}
              <div>
                <label htmlFor="auth-email" className="mb-1 block text-xs font-medium text-slate-200">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="mb-1 block text-xs font-medium text-slate-200">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'register' ? 12 : 1}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
                {mode === 'register' && <p className="mt-1 text-[11px] text-slate-400">Use at least 12 characters.</p>}
              </div>

              {error && <p role="alert" className="rounded-lg bg-red-950/70 px-3 py-2 text-sm text-red-200">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? 'Please wait…' : mode === 'register' ? 'Create survivor account' : 'Sign in'}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {portal === 'survivor' && (
              <p className="mt-5 text-center text-sm text-slate-400">
                {mode === 'login' ? 'New to u-SHA-jua?' : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                  className="font-semibold text-blue-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {mode === 'login' ? 'Create an account' : 'Sign in'}
                </button>
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
