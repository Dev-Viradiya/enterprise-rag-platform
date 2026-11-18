import { useState, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import { 
  Eye, EyeOff, ShieldCheck, ArrowRight, ShieldAlert, 
  Lock, CheckCircle2, Building2, Server, 
  Sparkles, KeyRound, Cpu, Key, RefreshCw, Check
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function Auth() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  // Mode: 'login' | 'change_password'
  const [authMode, setAuthMode] = useState('login');

  // Shared / Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Change Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract detected domain for business multi-tenant preview
  const detectedDomain = useMemo(() => {
    if (!email || !email.includes('@')) return null;
    const parts = email.split('@');
    if (parts[1] && parts[1].includes('.')) {
      return parts[1].toLowerCase();
    }
    return null;
  }, [email]);

  // Handle Login submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const fd = new URLSearchParams();
      fd.append('username', email);
      fd.append('password', password);
      const res = await api.post('/login', fd);
      login(res.data.access_token);
      navigate('/');
    } catch (err) {
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          setError(detail);
        } else if (Array.isArray(detail)) {
          setError(detail.map(d => d.msg || d.message || JSON.stringify(d)).join(', '));
        } else {
          setError(JSON.stringify(detail));
        }
      } else if (!err.response) {
        setError('Cannot connect to backend server. Please verify that FastAPI is running on http://localhost:8000.');
      } else {
        setError(err.message || 'An error occurred during sign in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1: Verify Old/Current Password
  const handleVerifyOldPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !oldPassword) {
      setError('Please provide both your work email and current password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/verify-password', {
        email: email.trim(),
        old_password: oldPassword
      });
      setIsVerified(true);
      setSuccess('Old password verified successfully! You can now set your new password.');
    } catch (err) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (!err.response) {
        setError('Cannot connect to backend server. Verify that FastAPI is running on port 8000.');
      } else {
        setError(err.message || 'Failed to verify old password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Set New Password & Update in Database
  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newPassword || !confirmPassword) {
      setError('Please enter and confirm your new password.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    if (newPassword === oldPassword) {
      setError('New password must be different from your old password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/change-password', {
        email: email.trim(),
        old_password: oldPassword,
        new_password: newPassword
      });

      // Reset change password fields
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsVerified(false);

      // Switch to sign in tab with email preserved
      setAuthMode('login');
      setPassword('');
      setSuccess('Password updated successfully in the database! Please sign in with your new password.');
    } catch (err) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (!err.response) {
        setError('Cannot connect to backend server. Verify that FastAPI is running on port 8000.');
      } else {
        setError(err.message || 'Failed to update password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch tabs cleanly
  const switchTab = (mode) => {
    setAuthMode(mode);
    setError('');
    setSuccess('');
    if (mode === 'login') {
      setIsVerified(false);
    }
  };

  // Fill Updated Central Super Admin Credentials into Form Fields
  const handleFillSuperAdmin = async () => {
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      // Fetch active credentials from backend
      const res = await api.get('/auth/central-admin-credentials');
      setEmail(res.data.email);
      setPassword(res.data.password);
      setAuthMode('login');
      setSuccess('Central Super Admin credentials filled. Click "Sign In to Workspace" to proceed.');
    } catch (err) {
      // Fallback
      setEmail('superadmin@ragplatform.com');
      setPassword('123456');
      setAuthMode('login');
      setSuccess('Central Super Admin credentials filled. Click "Sign In to Workspace" to proceed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const businessPillars = [
    {
      icon: ShieldCheck,
      title: 'Central Admin Provisioning',
      desc: 'Organization admins and team members are securely created and assigned initial credentials by the Central Super Admin.',
      accent: '#6366f1'
    },
    {
      icon: Cpu,
      title: 'Pinecone Vector RAG Pipeline',
      desc: 'Enterprise document chunking with all-MiniLM-L6-v2 embeddings and real-time Groq LLaMA 3.3 70B inference.',
      accent: '#06b6d4'
    },
    {
      icon: Lock,
      title: 'Strict RBAC Document Isolation',
      desc: 'Public and Private classification prevents unauthorized document retrieval across organizational tiers.',
      accent: '#10b981'
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--color-bg-primary)',
      position: 'relative',
      overflow: 'hidden',
      color: 'var(--color-text-primary)'
    }}>
      {/* Theme Toggle Button */}
      <div style={{ position: 'absolute', top: '20px', right: '24px', zIndex: 50 }}>
        <ThemeToggle showLabel={true} />
      </div>

      {/* === SUBTLE CORPORATE AMBIENT MESH === */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute',
          width: '750px',
          height: '750px',
          top: '-15%',
          left: '-8%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79, 70, 229, 0.08) 0%, transparent 65%)',
          filter: 'blur(90px)'
        }} />
        <div style={{
          position: 'absolute',
          width: '650px',
          height: '650px',
          bottom: '-12%',
          right: '-5%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 65%)',
          filter: 'blur(90px)'
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 80%)'
        }} />
      </div>

      {/* === LEFT BRAND & BUSINESS SHOWCASE (DESKTOP) === */}
      <div className="desktop-only" style={{
        display: 'flex',
        flex: 1.15,
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        position: 'relative',
        zIndex: 1,
        borderRight: '1px solid var(--color-border-default)',
        background: 'var(--color-bg-secondary)'
      }}>
        <div>
          {/* Organization Brandmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '56px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '13px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(79, 70, 229, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
            }}>
              <Sparkles style={{ width: '22px', height: '22px', color: '#ffffff' }} />
            </div>
            <div>
              <div style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--color-text-primary)' }}>
                Enterprise <span className="grad-brand">RAG</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                Organizational AI Platform
              </div>
            </div>
          </div>

          {/* Value Proposition */}
          <div className="a-up">
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              marginBottom: '20px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
              <span style={{ fontSize: '11.5px', fontWeight: 650, color: '#a5b4fc', letterSpacing: '0.02em' }}>
                Enterprise Multi-Tenant Intelligence v2.4
              </span>
            </div>

            <h1 style={{
              fontSize: '40px',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: '20px',
              color: 'var(--color-text-primary)'
            }}>
              Grounded AI for your <br />
              <span className="grad-brand">private corporate knowledge</span>
            </h1>

            <p style={{
              fontSize: '15px',
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
              maxWidth: '520px',
              marginBottom: '40px'
            }}>
              Turn your company policies, technical specifications, and internal documents into a unified,
              zero-leakage AI assistant with strict role-based access.
            </p>

            {/* Pillar Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '520px' }}>
              {businessPillars.map((p, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: '14px',
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-default)',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: `${p.accent}15`,
                    border: `1px solid ${p.accent}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <p.icon style={{ width: '18px', height: '18px', color: p.accent }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 650, color: 'var(--color-text-primary)', marginBottom: '4px' }}>{p.title}</h3>
                    <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Corporate Trust Badges footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          paddingTop: '28px',
          borderTop: '1px solid var(--color-border-default)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck style={{ width: '16px', height: '16px', color: '#10b981' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>SOC-2 Type II Certified</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock style={{ width: '15px', height: '15px', color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>AES-256 Encrypted</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server style={{ width: '15px', height: '15px', color: '#a78bfa' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Zero Data Retention</span>
          </div>
        </div>
      </div>

      {/* === RIGHT FORM PANEL === */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 28px',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ width: '100%', maxWidth: '440px' }} className="a-scale">
          {/* Mobile brand mark */}
          <div className="mobile-only" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '32px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles style={{ width: '18px', height: '18px', color: '#ffffff' }} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)' }}>Enterprise RAG</span>
          </div>

          {/* Form Card */}
          <div className="enterprise-glass" style={{
            borderRadius: '24px',
            padding: '38px 36px'
          }}>
            {/* Header / Tabs */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '4px',
                background: 'var(--color-bg-hover)',
                borderRadius: '12px',
                border: '1px solid var(--color-border-default)',
                marginBottom: '24px'
              }}>
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: authMode === 'login' ? 'var(--color-accent)' : 'transparent',
                    color: authMode === 'login' ? '#ffffff' : 'var(--color-text-secondary)',
                    boxShadow: authMode === 'login' ? '0 2px 8px rgba(79, 70, 229, 0.35)' : 'none'
                  }}>
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('change_password')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: authMode === 'change_password' ? 'var(--color-accent)' : 'transparent',
                    color: authMode === 'change_password' ? '#ffffff' : 'var(--color-text-secondary)',
                    boxShadow: authMode === 'change_password' ? '0 2px 8px rgba(79, 70, 229, 0.35)' : 'none'
                  }}>
                  Change Password
                </button>
              </div>

              <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                {authMode === 'login' ? 'Sign in to workspace' : 'Change account password'}
              </h2>
              <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {authMode === 'login'
                  ? 'Access your private enterprise document knowledge hub'
                  : (!isVerified 
                      ? 'Verify your current credentials provided by your platform administrator' 
                      : 'Set a new secure password for your workspace account')}
              </p>
            </div>

            {/* Target tenant preview */}
            {detectedDomain && (
              <div className="a-in" style={{
                marginBottom: '18px',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Building2 style={{ width: '15px', height: '15px', color: 'var(--color-cyan)', flexShrink: 0 }} />
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)' }}>
                  Target Tenant: <strong style={{ color: 'var(--color-text-primary)' }}>{detectedDomain.toUpperCase()}</strong>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="a-in" style={{
                marginBottom: '18px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <ShieldAlert style={{ width: '16px', height: '16px', color: '#fb7185', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '12.5px', color: '#fb7185', lineHeight: 1.5 }}>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="a-in" style={{
                marginBottom: '18px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <CheckCircle2 style={{ width: '16px', height: '16px', color: '#34d399', flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px', color: '#34d399', lineHeight: 1.5 }}>{success}</span>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW 1: SIGN IN FORM */}
            {/* ======================================================== */}
            {authMode === 'login' && (
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 650,
                    color: 'var(--color-text-secondary)',
                    marginBottom: '8px',
                    letterSpacing: '0.01em'
                  }}>
                    Work Email Address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      style={{
                        width: '100%',
                        padding: '13px 16px',
                        borderRadius: '12px',
                        fontSize: '13.5px',
                        fontFamily: 'inherit',
                        color: 'var(--color-text-primary)',
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border-default)',
                        outline: 'none',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                        e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = 'var(--color-border-default)';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', letterSpacing: '0.01em' }}>
                      Password
                    </label>
                    <span
                      onClick={() => switchTab('change_password')}
                      style={{ fontSize: '11.5px', color: '#818cf8', cursor: 'pointer', fontWeight: 600 }}>
                      Change password?
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      style={{
                        width: '100%',
                        padding: '13px 44px 13px 16px',
                        borderRadius: '12px',
                        fontSize: '13.5px',
                        fontFamily: 'inherit',
                        color: 'var(--color-text-primary)',
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border-default)',
                        outline: 'none',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                        e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = 'var(--color-border-default)';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                      {showPassword ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    marginTop: '8px',
                    fontSize: '14px',
                    fontWeight: 650
                  }}>
                  {isSubmitting ? (
                    <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight style={{ width: '16px', height: '16px' }} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ======================================================== */}
            {/* VIEW 2: CHANGE PASSWORD FLOW */}
            {/* ======================================================== */}
            {authMode === 'change_password' && (
              <div>
                {!isVerified ? (
                  /* --- STEP 1: VERIFY OLD PASSWORD --- */
                  <form onSubmit={handleVerifyOldPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      fontSize: '12.5px',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <Key style={{ width: '16px', height: '16px', color: 'var(--color-accent-bright)', flexShrink: 0 }} />
                      <span><strong>Step 1 of 2:</strong> Enter your work email and current/temporary password to verify identity.</span>
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 650,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '8px'
                      }}>
                        Work Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        style={{
                          width: '100%',
                          padding: '13px 16px',
                          borderRadius: '12px',
                          fontSize: '13.5px',
                          fontFamily: 'inherit',
                          color: 'var(--color-text-primary)',
                          background: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border-default)',
                          outline: 'none',
                          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}
                        onFocus={e => {
                          e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                          e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                        }}
                        onBlur={e => {
                          e.target.style.borderColor = 'var(--color-border-default)';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 650,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '8px'
                      }}>
                        Current / Old Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showOldPassword ? 'text' : 'password'}
                          required
                          value={oldPassword}
                          onChange={e => setOldPassword(e.target.value)}
                          placeholder="Enter current or temporary password"
                          style={{
                            width: '100%',
                            padding: '13px 44px 13px 16px',
                            borderRadius: '12px',
                            fontSize: '13.5px',
                            fontFamily: 'inherit',
                            color: 'var(--color-text-primary)',
                            background: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border-default)',
                            outline: 'none',
                            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                          }}
                          onFocus={e => {
                            e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                            e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = 'var(--color-border-default)';
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowOldPassword(!showOldPassword)}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                          {showOldPassword ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary"
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        marginTop: '8px',
                        fontSize: '14px',
                        fontWeight: 650
                      }}>
                      {isSubmitting ? (
                        <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      ) : (
                        <>
                          <ShieldCheck style={{ width: '16px', height: '16px' }} />
                          <span>Verify Current Password</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* --- STEP 2: ENTER NEW PASSWORD & CONFIRM PASSWORD --- */
                  <form onSubmit={handleChangePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} className="a-in">
                    {/* Verified Identity Badge */}
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 style={{ width: '16px', height: '16px', color: '#10b981', flexShrink: 0 }} />
                        <span style={{ fontSize: '12.5px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          Verified: <strong>{email}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setIsVerified(false); setOldPassword(''); setError(''); setSuccess(''); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '11px',
                          color: 'var(--color-accent-bright)',
                          cursor: 'pointer',
                          fontWeight: 650,
                          textDecoration: 'underline'
                        }}>
                        Change Account
                      </button>
                    </div>

                    {/* New Password */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 650,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '8px'
                      }}>
                        New Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          style={{
                            width: '100%',
                            padding: '13px 44px 13px 16px',
                            borderRadius: '12px',
                            fontSize: '13.5px',
                            fontFamily: 'inherit',
                            color: 'var(--color-text-primary)',
                            background: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border-default)',
                            outline: 'none',
                            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                          }}
                          onFocus={e => {
                            e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                            e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = 'var(--color-border-default)';
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                          {showNewPassword ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 650,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '8px'
                      }}>
                        Confirm New Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Re-type new password"
                          style={{
                            width: '100%',
                            padding: '13px 44px 13px 16px',
                            borderRadius: '12px',
                            fontSize: '13.5px',
                            fontFamily: 'inherit',
                            color: 'var(--color-text-primary)',
                            background: 'var(--color-bg-card)',
                            border: `1px solid ${
                              confirmPassword && newPassword !== confirmPassword 
                                ? '#fb7185' 
                                : (confirmPassword && newPassword === confirmPassword ? '#10b981' : 'var(--color-border-default)')
                            }`,
                            outline: 'none',
                            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                          }}
                          onFocus={e => {
                            e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                            e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = confirmPassword && newPassword !== confirmPassword 
                              ? '#fb7185' 
                              : (confirmPassword && newPassword === confirmPassword ? '#10b981' : 'var(--color-border-default)');
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                          {showConfirmPassword ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                        </button>
                      </div>

                      {/* Password Match Helper */}
                      {confirmPassword && (
                        <div style={{ marginTop: '6px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {newPassword === confirmPassword ? (
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Check style={{ width: '12px', height: '12px' }} /> Passwords match
                            </span>
                          ) : (
                            <span style={{ color: '#fb7185' }}>
                              Passwords do not match
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary"
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        marginTop: '8px',
                        fontSize: '14px',
                        fontWeight: 650
                      }}>
                      {isSubmitting ? (
                        <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      ) : (
                        <>
                          <Lock style={{ width: '16px', height: '16px' }} />
                          <span>Update Password in Database</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Quick Fill Updated Credentials & Auto Sign-In Button */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleFillSuperAdmin}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '11px 14px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px dashed rgba(99, 102, 241, 0.45)',
                color: 'var(--color-accent-bright)',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}>
              <ShieldCheck style={{ width: '15px', height: '15px' }} />
              <span>Fill Central Super Admin Credentials</span>
            </button>

            <div style={{
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--color-text-tertiary)'
            }}>
              <KeyRound style={{ width: '13px', height: '13px', color: 'var(--color-accent-bright)' }} />
              <span>Multi-tenant isolation backed by MongoDB Atlas & Pinecone</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}