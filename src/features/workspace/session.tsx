'use client';

import { LanguageSelect, useLanguage } from './language';

import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  CloudOff,
  Layers3,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DEMO } from '@/lib/local';
import { localizeError } from '@/lib/i18n';
import { Alert, Brand, Link, go } from './ui';

export type Identity = { id: string; email: string; name: string };
const marker = 'auditflow:last-account';
const demoMarker = 'auditflow:demo';
const demoIdentity: Identity = { id: DEMO, email: '', name: 'Alex Morgan' };

function cachedIdentity(): Identity | null {
  try {
    const saved = JSON.parse(localStorage.getItem(marker) ?? 'null');
    return saved &&
      typeof saved.id === 'string' &&
      typeof saved.email === 'string' &&
      typeof saved.name === 'string'
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function useSession() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(
    undefined,
  );
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      const initial = window.setTimeout(() => setIdentity(demoIdentity), 0);
      return () => clearTimeout(initial);
    }
    const offline = window.setTimeout(() => {
      if (!navigator.onLine)
        setIdentity(
          (current) =>
            current ??
            (sessionStorage.getItem(demoMarker) === '1'
              ? demoIdentity
              : cachedIdentity()),
        );
    }, 0);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        go('/recover', true);
      }
      if (session?.user) {
        const user: User = session.user;
        const name = user.user_metadata.display_name;
        const next = {
          id: user.id,
          email: user.email ?? '',
          name:
            (typeof name === 'string' && name.trim().slice(0, 100)) ||
            user.email?.split('@')[0] ||
            'Auditor',
        };
        localStorage.setItem(marker, JSON.stringify(next));
        sessionStorage.removeItem(demoMarker);
        setIdentity(next);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem(marker);
        setIdentity(
          sessionStorage.getItem(demoMarker) === '1' ? demoIdentity : null,
        );
      } else if (event === 'INITIAL_SESSION') {
        if (sessionStorage.getItem(demoMarker) === '1')
          setIdentity(demoIdentity);
        else setIdentity(navigator.onLine ? null : cachedIdentity());
      }
    });
    return () => {
      clearTimeout(offline);
      subscription.unsubscribe();
    };
  }, []);

  return {
    identity,
    recovery,
    endRecovery: () => setRecovery(false),
    enterDemo() {
      sessionStorage.setItem(demoMarker, '1');
      setIdentity(demoIdentity);
      go('/dashboard', true);
    },
    async signOut() {
      if (identity?.id === DEMO) {
        sessionStorage.removeItem(demoMarker);
        setIdentity(null);
        go('/login', true);
        return;
      }
      if (!supabase) return;
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      localStorage.removeItem(marker);
      setIdentity(null);
      go('/login', true);
    },
  };
}

export function AuthScreen({
  path,
  recovering,
  enterDemo,
  endRecovery,
}: {
  path: string;
  recovering: boolean;
  enterDemo: () => void;
  endRecovery: () => void;
}) {
  const { t } = useLanguage();
  const mode =
    path === '/register'
      ? 'register'
      : path === '/recover'
        ? recovering
          ? 'update'
          : 'recover'
        : 'login';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titles = {
    login: t('Welcome back'),
    register: t('Create your account'),
    recover: t('Reset your password'),
    update: t('Choose a new password'),
  };
  const description = {
    login: t('Sign in to your inspection workspace.'),
    register: t(
      'Create a private workspace for your checklists and inspections.',
    ),
    recover: t('We’ll send a reset link to your email address.'),
    update: t('Use at least eight characters.'),
  };
  const actions = {
    login: t('Sign in'),
    register: t('Create account'),
    recover: t('Send reset link'),
    update: t('Update password'),
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '');
    try {
      if (mode === 'recover') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/recover`,
        });
        if (error) throw error;
        setMessage(
          t('If an account exists, check your email for the reset link.'),
        );
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        endRecovery();
        go('/dashboard', true);
      } else if (mode === 'register') {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/dashboard`,
            data: { display_name: String(values.get('name')).trim() },
          },
        });
        if (error) throw error;
        if (data.session) go('/dashboard', true);
        else setMessage(t('Check your email to confirm your account.'));
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        go('/dashboard', true);
      }
    } catch (err) {
      setError(
        localizeError(
          t,
          err,
          navigator.onLine
            ? 'Could not complete the account request. Check the details and try again.'
            : 'Try again once you’re online.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-main">
        <div className="auth-top">
          <Brand />
          <LanguageSelect />
        </div>
        <div className="auth-form">
          <h1>{titles[mode]}</h1>
          <p>{description[mode]}</p>
          {error && <Alert>{error}</Alert>}
          {message && (
            <div className="notice" role="status">
              <Check size={18} />
              {message}
            </div>
          )}
          {supabase ? (
            <form className="stack" onSubmit={submit}>
              {mode === 'register' && (
                <label>
                  {t('Display name')}
                  <input
                    name="name"
                    maxLength={100}
                    autoComplete="name"
                    required
                  />
                </label>
              )}
              {mode !== 'update' && (
                <label>
                  {t('Email address')}
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              {mode !== 'recover' && (
                <label>
                  {t('Password')}
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    minLength={mode === 'login' ? undefined : 8}
                    required
                  />
                </label>
              )}
              {mode === 'login' && (
                <Link className="text-link auth-forgot" href="/recover">
                  {t('Forgot password?')}
                </Link>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? t('Please wait…') : actions[mode]}
              </button>
            </form>
          ) : (
            <div className="notice">
              {t('Connect Supabase to create or sign in to an account.')}
            </div>
          )}
          <div className="auth-links">
            {supabase &&
              mode !== 'update' &&
              (mode === 'login' ? (
                <span>
                  {t('New to AuditFlow?')}{' '}
                  <Link className="text-link" href="/register">
                    {t('Create an account')}
                  </Link>
                </span>
              ) : (
                <Link className="text-link" href="/login">
                  {t('Back to sign in')}
                </Link>
              ))}
            {mode !== 'update' && (
              <button className="button secondary" onClick={enterDemo}>
                {t('Explore the demo')} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>
      <aside className="auth-aside">
        <div className="auth-art" aria-hidden>
          <span />
          <span />
          <span />
          <ClipboardCheck size={85} strokeWidth={1.4} />
        </div>
        <div>
          <h2>{t('From checklist to closeout.')}</h2>
          <p>
            {t(
              'Plan inspections, record what you find, and follow through on corrective actions.',
            )}
          </p>
          <div className="auth-capabilities">
            <span>
              <Layers3 size={17} /> {t('Versioned checklists')}
            </span>
            <span>
              <CloudOff size={17} /> {t('Offline inspections')}
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}
