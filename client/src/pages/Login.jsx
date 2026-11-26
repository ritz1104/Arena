import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, MonitorPlay } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from '../components/ui/Bits.jsx';
import Particles from '../components/ui/Particles.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={loc.state?.from || '/admin'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      nav(loc.state?.from || '/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      <Particles count={70} />
      <motion.form
        onSubmit={submit}
        className="card glow-border"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        style={{ width: 'min(420px, 100%)', padding: 32, display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <Logo size="lg" />
          <p className="muted upper small" style={{ marginTop: 12, letterSpacing: '0.3em' }}>Host sign in</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="notice danger">{error}</div>}
        <button className={`btn primary lg ${busy ? 'loading' : ''}`} disabled={busy}>
          <LogIn /> {busy ? 'Signing in…' : 'Enter the Arena'}
        </button>
        <a className="btn ghost sm" href="/arena/live" style={{ alignSelf: 'center' }}>
          <MonitorPlay /> Open audience screen
        </a>
      </motion.form>
    </div>
  );
}
