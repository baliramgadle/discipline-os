import { useState } from 'react';

type AuthFormProps = {
  mode: 'login' | 'register';
  onSubmit: (payload: { name?: string; username?: string; email: string; password: string }) => Promise<{ emailVerificationStatus?: string } | void>;
  onRequestPasswordReset: (email: string) => Promise<{ message: string }>;
  onResetPassword: (token: string, password: string) => Promise<{ message: string }>;
  onVerifyEmail: (token: string) => Promise<{ message: string }>;
  onRecoveryModeChange: (active: boolean) => void;
  isBusy?: boolean;
};

const initialState = { name: '', username: '', email: '', password: '' };

export function AuthForm({
  mode,
  onSubmit,
  onRequestPasswordReset,
  onResetPassword,
  onVerifyEmail,
  onRecoveryModeChange,
  isBusy = false,
}: AuthFormProps) {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetting, setResetting] = useState(() => new URLSearchParams(window.location.search).has('reset_token'));
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset_token') ?? '');
  const [verifyToken, setVerifyToken] = useState(() => new URLSearchParams(window.location.search).get('verify_token') ?? '');
  const loginIdentifier = mode === 'login' && !resetting;

  const onChange = (field: keyof typeof initialState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setNotice('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (verifyToken) {
      try {
        const result = await onVerifyEmail(verifyToken);
        setNotice(result.message);
        setVerifyToken('');
        onRecoveryModeChange(false);
        const url = new URL(window.location.href);
        url.searchParams.delete('verify_token');
        window.history.replaceState({}, '', url);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Email verification failed.');
      }
      return;
    }

    if (resetting) {
      try {
        if (resetToken) {
          if (form.password.length < 8) {
            setError('Use at least eight characters, including an uppercase letter and a number.');
            return;
          }
          const result = await onResetPassword(resetToken, form.password);
          setNotice(result.message);
          setResetting(false);
          onRecoveryModeChange(false);
          setResetToken('');
          const url = new URL(window.location.href);
          url.searchParams.delete('reset_token');
          window.history.replaceState({}, '', url);
        } else {
          if (!form.email.trim()) {
            setError('Enter your account email address.');
            return;
          }
          const result = await onRequestPasswordReset(form.email.trim());
          setNotice(result.message);
        }
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Password recovery failed.');
      }
      return;
    }

    if (!form.email || !form.password || (mode === 'register' && (!form.name.trim() || !form.username.trim()))) {
      setError('Please complete the required fields.');
      return;
    }

    try {
      const result = await onSubmit({
        name: mode === 'register' ? form.name.trim() : undefined,
        username: mode === 'register' ? form.username.trim() : undefined,
        email: form.email.trim(),
        password: form.password,
      });
      if (result?.emailVerificationStatus === 'sent') {
        setNotice('Account created. A verification link was sent to your email.');
      } else if (result?.emailVerificationStatus === 'delivery-failed') {
        setNotice('Account created, but the verification email could not be delivered. Use Profile to request another link.');
      } else if (result?.emailVerificationStatus === 'email-provider-not-configured') {
        setNotice('Account created. Email verification is pending because email delivery is not configured.');
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Authentication failed.',
      );
    }
  };

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="card-header">
        <span className="eyebrow accent">Access</span>
        <h2>{verifyToken ? 'Verify your email' : resetting ? (resetToken ? 'Choose a new password' : 'Reset your password') : mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
      </div>

      {!resetting && !verifyToken && mode === 'register' && (
        <label>
          Full name
          <input
            type="text"
            value={form.name}
            onChange={(event) => onChange('name', event.target.value)}
            placeholder="Alex Morgan"
          />
        </label>
      )}

      {!resetting && !verifyToken && mode === 'register' && (
        <label>
          Username
          <input
            type="text"
            value={form.username}
            onChange={(event) => onChange('username', event.target.value)}
            placeholder="alex_morgan"
            minLength={3}
            maxLength={50}
            autoComplete="username"
          />
        </label>
      )}
      {verifyToken && (
        <>
          <p className="muted">Confirm the email address associated with your account.</p>
          <button type="button" className="primary-button" disabled={isBusy} onClick={() => {
            void onVerifyEmail(verifyToken).then((result) => {
              setNotice(result.message);
              setVerifyToken('');
              onRecoveryModeChange(false);
              const url = new URL(window.location.href);
              url.searchParams.delete('verify_token');
              window.history.replaceState({}, '', url);
            }).catch((verifyError: unknown) => {
              setError(verifyError instanceof Error ? verifyError.message : 'Email verification failed.');
            });
          }}>Verify email</button>
        </>
      )}

      {!verifyToken && (!resetting || !resetToken) && <label>
        {loginIdentifier ? 'Email or username' : 'Email'}
        <input
          type={loginIdentifier ? 'text' : 'email'}
          value={form.email}
          onChange={(event) => onChange('email', event.target.value)}
          placeholder={loginIdentifier ? 'you@discipline-os.com or username' : 'you@discipline-os.com'}
          autoComplete={loginIdentifier ? 'username' : 'email'}
        />
      </label>}

      {!verifyToken && (!resetting || Boolean(resetToken)) && <label>
        Password
        <input
          type="password"
          value={form.password}
          onChange={(event) => onChange('password', event.target.value)}
          placeholder="••••••••"
          autoComplete={resetting ? 'new-password' : 'current-password'}
        />
      </label>}

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="platform-notice" role="status">{notice}</div>}

      {!resetting && !verifyToken && (
        <button type="submit" className="primary-button" disabled={isBusy}>
          {isBusy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      )}
      {resetting && !verifyToken && (
        <button type="submit" className="primary-button" disabled={isBusy}>
          {isBusy ? 'Please wait…' : resetToken ? 'Update password' : 'Send reset link'}
        </button>
      )}
      {mode === 'login' && !resetting && (
        <button type="button" className="auth-link" onClick={() => { setResetting(true); onRecoveryModeChange(true); setError(''); setNotice(''); }}>
          Forgot password?
        </button>
      )}
      {resetting && (
        <button type="button" className="auth-link" onClick={() => { setResetting(false); onRecoveryModeChange(false); setError(''); setNotice(''); }}>
          Back to sign in
        </button>
      )}
    </form>
  );
}
