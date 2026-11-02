import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { user, login, register } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/account';
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setError(''); setBusy(true);
    try {
      if (mode === 'login') await login(f.email, f.password);
      else await register(f);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="container narrow">
        <h1 className="h1">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to place orders and follow their progress.' : 'One account for all your orders, invoices and deliveries.'}</p>
        <form className="form form--card" onSubmit={submit}>
          {mode === 'register' && <label className="form__wide">Full name<input name="name" required autoComplete="name" /></label>}
          <label className="form__wide">Email<input name="email" type="email" required autoComplete="email" /></label>
          {mode === 'register' && <label className="form__wide">Phone<input name="phone" type="tel" autoComplete="tel" /></label>}
          <label className="form__wide">Password<input name="password" type="password" required minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {error && <p className="form-error form__wide">{error}</p>}
          <button className="btn btn--primary btn--lg form__wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <p className="form__wide small">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <button type="button" className="link link--strong" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
