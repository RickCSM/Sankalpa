import { useState, useCallback, type CSSProperties } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import BrandImage from '@/components/BrandImage';

function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    if (!captchaInput.trim()) {
      setError('Captcha is required.');
      return;
    }

    if (captchaInput !== captcha) {
      setError('Invalid captcha. Please try again.');
      refreshCaptcha();
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(username, password);
      if (result.ok) {
        navigate('/', { replace: true });
      } else {
        setError(result.message);
        refreshCaptcha();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="login-page"
      style={{
        ['--login-bg-local' as string]: `url(${import.meta.env.BASE_URL}images/login.jpg)`,
      } as CSSProperties}
    >
      <BrandImage
        className="login-circle-pattern"
        file="circle-pattern.png"
        alt=""
      />

      <div className="login-bg">
        <BrandImage file="login.jpg" alt="" />
      </div>

      <div className="login-map">
        <BrandImage file="map-big.png" alt="" />
      </div>

      <div className="login-card">
        <div className="login-header">
          <BrandImage file="odisha-logo.png" alt="Logo" />
          <h4>Sankalpa Odisha</h4>
          <p>Government of Odisha</p>
          <div className="login-divider">
            <span className="line dark"></span>
            <span className="line light"></span>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <input type="text" placeholder="Enter Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>

          <div className="form-group password-group">
            <input type={showPassword ? 'text' : 'password'} placeholder="Enter Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
              <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
            </button>
          </div>

          <div className="captcha-area">
            <input className="captcha-input" type="text" placeholder="Enter Captcha" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} />
            <div className="captcha-box">{captcha}</div>
            <button type="button" className="refresh-captcha" onClick={refreshCaptcha} title="Refresh Captcha">
              <i className="bi bi-arrow-clockwise"></i>
            </button>
          </div>

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-ocac">
          Developed and Maintained by{' '}
          <a href="https://www.ocac.in/" target="_blank" rel="noopener noreferrer">
            <BrandImage file="ocac.png" alt="OCAC" />
            OCAC
          </a>
        </div>
      </div>
    </div>
  );
}
