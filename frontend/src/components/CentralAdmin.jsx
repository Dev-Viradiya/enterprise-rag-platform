import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  Building2, Users, FileText, KeyRound, ShieldCheck,
  Plus, Search, RefreshCw, Trash2, Key, Check, Copy,
  Eye, EyeOff, ShieldAlert, CheckCircle2, ChevronRight,
  Database, Cpu, Globe, Layers, ArrowUpRight, Lock,
  Sparkles, Mail, UserCheck, AlertCircle, X, ExternalLink
} from 'lucide-react';

/* ===== HELPER: GENERATE RANDOM SECURE PASSWORD ===== */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  let pass = '';
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export default function CentralAdmin() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'organizations' | 'users' | 'provision'
  const [stats, setStats] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search & Filter States
  const [orgSearch, setOrgSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userOrgFilter, setUserOrgFilter] = useState('all');
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  // Credential Handover Modal State
  const [credentialModalData, setCredentialModalData] = useState(null);
  const [copiedHandover, setCopiedHandover] = useState(false);
  const [showPasswordInModal, setShowPasswordInModal] = useState(false);

  // Password Reset Modal State
  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Quick Org Provision Form & Modal
  const [isProvisionTenantModalOpen, setIsProvisionTenantModalOpen] = useState(false);
  const [provisionError, setProvisionError] = useState('');
  const [showQuickPassword, setShowQuickPassword] = useState(false);
  const [quickOrgName, setQuickOrgName] = useState('');
  const [quickDomain, setQuickDomain] = useState('');
  const [quickAdminEmail, setQuickAdminEmail] = useState('');
  const [quickAdminPassword, setQuickAdminPassword] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  // Single User Provision Form
  const [targetOrgId, setTargetOrgId] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetRole, setTargetRole] = useState('end_user');
  const [targetPassword, setTargetPassword] = useState('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Load all platform data
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, orgsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/organizations'),
        api.get('/admin/users')
      ]);
      setStats(statsRes.data);
      setOrganizations(orgsRes.data);
      setUsers(usersRes.data);
      if (orgsRes.data.length > 0 && !targetOrgId) {
        setTargetOrgId(orgsRes.data[0]._id);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load Central Admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Organizations
  const filteredOrgs = useMemo(() => {
    return organizations.filter(o =>
      o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      o.domain.toLowerCase().includes(orgSearch.toLowerCase())
    );
  }, [organizations, orgSearch]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.org_name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.org_domain.toLowerCase().includes(userSearch.toLowerCase());
      const matchesOrg = userOrgFilter === 'all' || u.organization_id === userOrgFilter;
      const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
      return matchesSearch && matchesOrg && matchesRole;
    });
  }, [users, userSearch, userOrgFilter, userRoleFilter]);

  // Handle Quick Org + Admin Provisioning
  const handleQuickOrgSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingQuick(true);
    setError('');
    setProvisionError('');
    setSuccess('');
    try {
      const res = await api.post('/admin/organizations/quick-provision', {
        org_name: quickOrgName,
        domain: quickDomain,
        admin_email: quickAdminEmail,
        admin_password: quickAdminPassword
      });

      setSuccess(`Organization "${quickOrgName}" onboarded! Credentials ready for client.`);
      setCredentialModalData(res.data.credentials);
      setIsProvisionTenantModalOpen(false);
      // Reset form
      setQuickOrgName('');
      setQuickDomain('');
      setQuickAdminEmail('');
      setQuickAdminPassword('');
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to onboard organization.';
      setError(msg);
      setProvisionError(msg);
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  // Handle Direct User Provisioning
  const handleUserProvisionSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingUser(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/admin/users', {
        email: targetEmail,
        password: targetPassword,
        organization_id: targetOrgId,
        role: targetRole
      });

      setSuccess(`User credentials provisioned for ${targetEmail}.`);
      setCredentialModalData(res.data.credentials);
      // Reset form
      setTargetEmail('');
      setTargetPassword('');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to provision user.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Handle Password Reset
  const handlePasswordResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetModalUser || !newPasswordInput) return;
    setIsResetting(true);
    try {
      await api.patch(`/admin/users/${resetModalUser._id}/reset-password`, {
        new_password: newPasswordInput
      });

      const updatedCreds = {
        organization_name: resetModalUser.org_name,
        organization_domain: resetModalUser.org_domain,
        email: resetModalUser.email,
        password: newPasswordInput,
        role: resetModalUser.role === 'org_admin' ? 'Organization Admin' : (resetModalUser.role === 'super_admin' ? 'Super Admin' : 'End User')
      };

      setResetModalUser(null);
      setNewPasswordInput('');
      setCredentialModalData(updatedCreds);
      setSuccess(`Password reset successfully for ${resetModalUser.email}.`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  // Handle Delete Organization
  const handleDeleteOrg = async (orgId, orgName) => {
    if (!window.confirm(`Are you sure you want to delete organization "${orgName}"?\n\nWARNING: All member accounts, documents, and chat histories under this organization will be permanently deleted.`)) {
      return;
    }
    try {
      await api.delete(`/admin/organizations/${orgId}`);
      setSuccess(`Organization "${orgName}" deleted.`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete organization.');
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Delete user account "${userEmail}"?`)) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setSuccess(`User "${userEmail}" removed.`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete user.');
    }
  };

  // Copy Handover Packet to Clipboard
  const copyHandoverPacket = () => {
    if (!credentialModalData) return;
    const loginUrl = window.location.origin + '/auth';
    const packet = `=====================================================
ENTERPRISE RAG PLATFORM — ACCOUNT CREDENTIAL HANDOVER
=====================================================

Organization : ${credentialModalData.organization_name || 'N/A'}
Domain       : ${credentialModalData.organization_domain || credentialModalData.domain || 'N/A'}
Portal URL   : ${loginUrl}

USER CREDENTIALS:
Username / Email : ${credentialModalData.email}
Initial Password : ${credentialModalData.password}
Assigned Role    : ${credentialModalData.role}

INSTRUCTIONS FOR CLIENT:
1. Navigate to: ${loginUrl}
2. Enter your Email and Password as provided above.
3. Access your private AI Knowledge Base workspace.
=====================================================`;

    navigator.clipboard.writeText(packet);
    setCopiedHandover(true);
    setTimeout(() => setCopiedHandover(false), 2500);
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1280px', margin: '0 auto', color: 'var(--color-text-primary)' }}>
      {/* ================= HEADER SECTION ================= */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(79, 70, 229, 0.4)'
            }}>
              <ShieldCheck style={{ width: '18px', height: '18px', color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Central Platform Control Center
            </h1>
            <span className="badge-pill badge-indigo" style={{ fontSize: '11px', padding: '3px 9px' }}>
              SUPER ADMIN
            </span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', margin: 0 }}>
            Master operator portal for multi-tenant organizations, credential provisioning, and platform governance.
          </p>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}>
            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh Telemetry</span>
          </button>
          <button
            onClick={() => {
              if (!quickAdminPassword) setQuickAdminPassword(generatePassword());
              setProvisionError('');
              setIsProvisionTenantModalOpen(true);
            }}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 16px' }}>
            <Plus style={{ width: '14px', height: '14px' }} />
            <span>Provision Client Tenant</span>
          </button>
        </div>
      </div>

      {/* ================= ALERTS ================= */}
      {error && (
        <div className="a-in" style={{
          marginBottom: '20px',
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'rgba(244, 63, 94, 0.08)',
          border: '1px solid rgba(244, 63, 94, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fb7185',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fb7185', cursor: 'pointer' }}>
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      )}

      {success && (
        <div className="a-in" style={{
          marginBottom: '20px',
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#34d399',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer' }}>
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      )}

      {/* ================= NAVIGATION TABS ================= */}
      <div style={{
        display: 'flex',
        gap: '6px',
        borderBottom: '1px solid var(--color-border-default)',
        marginBottom: '24px',
        paddingBottom: '2px'
      }}>
        {[
          { id: 'overview', label: 'Platform Overview', icon: Globe },
          { id: 'organizations', label: `Organizations (${organizations.length})`, icon: Building2 },
          { id: 'users', label: `User Accounts & Credentials (${users.length})`, icon: Users },
          { id: 'provision', label: 'Provisioning Hub', icon: KeyRound }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px 10px 0 0',
                border: 'none',
                background: isActive ? 'var(--color-bg-card)' : 'transparent',
                color: isActive ? 'var(--color-accent-bright)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                fontSize: '13.5px',
                fontWeight: isActive ? 650 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}>
              <Icon style={{ width: '15px', height: '15px' }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= TAB 1: PLATFORM OVERVIEW ================= */}
      {activeTab === 'overview' && (
        <div className="a-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Telemetry Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
            <div className="enterprise-glass card-hover" style={{ padding: '20px 22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Tenants</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 style={{ width: '16px', height: '16px', color: 'var(--color-accent)' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {stats?.organizations_count ?? 0}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                Across dedicated customer domains
              </div>
            </div>

            <div className="enterprise-glass card-hover" style={{ padding: '20px 22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Total User Seats</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users style={{ width: '16px', height: '16px', color: 'var(--color-cyan)' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {stats?.users_count ?? 0}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#818cf8' }}>{stats?.org_admins_count ?? 0} Org Admins</span>
                <span>•</span>
                <span style={{ color: '#34d399' }}>{stats?.end_users_count ?? 0} End Users</span>
              </div>
            </div>

            <div className="enterprise-glass card-hover" style={{ padding: '20px 22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Documents Ingested</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText style={{ width: '16px', height: '16px', color: 'var(--color-emerald)' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {stats?.documents_count ?? 0}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                PDF, DOCX, TXT vector indexed
              </div>
            </div>

            <div className="enterprise-glass card-hover" style={{ padding: '20px 22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Vector Index Footprint</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database style={{ width: '16px', height: '16px', color: 'var(--color-amber)' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {stats?.total_chunks ?? 0}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                Pinecone chunks ({((stats?.total_bytes ?? 0) / (1024 * 1024)).toFixed(2)} MB raw)
              </div>
            </div>
          </div>

          {/* Business Operational Flow Guide */}
          <div className="enterprise-glass" style={{ padding: '28px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Sparkles style={{ width: '18px', height: '18px', color: 'var(--color-accent-bright)' }} />
              <h2 style={{ fontSize: '16px', fontWeight: 750, margin: 0 }}>
                Enterprise Service Architecture & Delivery Model
              </h2>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              In real-world commercial deployments, organizations do not register publicly on open sign-up forms. 
              Instead, you (the <strong>Central Platform Administrator</strong>) govern the commercial contract, provision the dedicated organization tenant, and issue encrypted login credentials directly to the client's administrative contact.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{
                padding: '18px',
                borderRadius: '14px',
                background: 'var(--color-bg-hover)',
                border: '1px solid var(--color-border-default)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'var(--color-accent)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>1</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700 }}>Sales & Contract Onboarding</span>
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Client (e.g., Acme Corp) signs an enterprise contract. Central Admin creates their tenant with custom domain match (<code>acme.com</code>).
                </p>
              </div>

              <div style={{
                padding: '18px',
                borderRadius: '14px',
                background: 'var(--color-bg-hover)',
                border: '1px solid var(--color-border-default)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'var(--color-cyan)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>2</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700 }}>Credential Issuance by Central Admin</span>
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Central Admin provisions the <strong>Org Admin</strong> (e.g. <code>admin@acme.com</code>) and initial <strong>End Users</strong>, then sends the secure onboarding packet.
                </p>
              </div>

              <div style={{
                padding: '18px',
                borderRadius: '14px',
                background: 'var(--color-bg-hover)',
                border: '1px solid var(--color-border-default)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'var(--color-emerald)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>3</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700 }}>Knowledge Base Ingestion & RBAC</span>
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Client Org Admin logs in, uploads proprietary documents (tagged Public or Private), and their team immediately queries the Pinecone + Groq RAG assistant.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: ORGANIZATIONS (TENANTS) ================= */}
      {activeTab === 'organizations' && (
        <div className="a-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search bar & Create Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', color: 'var(--color-text-tertiary)' }} />
              <input
                type="text"
                value={orgSearch}
                onChange={e => setOrgSearch(e.target.value)}
                placeholder="Search organizations or domains..."
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: '10px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>
            <button
              onClick={() => {
                if (!quickAdminPassword) setQuickAdminPassword(generatePassword());
                setProvisionError('');
                setIsProvisionTenantModalOpen(true);
              }}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 16px' }}>
              <Plus style={{ width: '14px', height: '14px' }} />
              <span>Provision Client Tenant</span>
            </button>
          </div>

          {/* Organizations Table */}
          <div className="enterprise-glass" style={{ borderRadius: '16px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-hover)' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Organization</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Domain</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Users</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Documents</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Created</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      No organizations matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrgs.map(org => (
                    <tr
                      key={org._id}
                      style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '14px 18px', fontWeight: 650 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '7px',
                            background: 'rgba(99, 102, 241, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Building2 style={{ width: '14px', height: '14px', color: 'var(--color-accent)' }} />
                          </div>
                          <span>{org.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span className="badge-pill badge-cyan" style={{ fontSize: '11px' }}>
                          {org.domain}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ fontWeight: 600 }}>{org.user_count}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>users</span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ fontWeight: 600 }}>{org.doc_count}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>docs</span>
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                        {org.created_at ? new Date(org.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setTargetOrgId(org._id);
                              setActiveTab('provision');
                            }}
                            title="Add user to this organization"
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus style={{ width: '12px', height: '12px' }} />
                            <span>Add User</span>
                          </button>
                          <button
                            onClick={() => {
                              setUserOrgFilter(org._id);
                              setActiveTab('users');
                            }}
                            title="View members of this organization"
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '12px' }}>
                            View Users
                          </button>
                          <button
                            onClick={() => handleDeleteOrg(org._id, org.name)}
                            title="Delete organization and all associated data"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '7px',
                              background: 'none',
                              border: '1px solid rgba(244, 63, 94, 0.2)',
                              color: 'var(--color-rose)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <Trash2 style={{ width: '13px', height: '13px' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 3: USER DIRECTORY & CREDENTIALS ================= */}
      {activeTab === 'users' && (
        <div className="a-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search, Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search user email or org..."
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Org Filter */}
              <select
                value={userOrgFilter}
                onChange={e => setUserOrgFilter(e.target.value)}
                style={{
                  padding: '9px 14px',
                  borderRadius: '10px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}>
                <option value="all">All Organizations</option>
                {organizations.map(o => (
                  <option key={o._id} value={o._id}>{o.name} ({o.domain})</option>
                ))}
              </select>

              {/* Role Filter */}
              <select
                value={userRoleFilter}
                onChange={e => setUserRoleFilter(e.target.value)}
                style={{
                  padding: '9px 14px',
                  borderRadius: '10px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}>
                <option value="all">All Roles</option>
                <option value="super_admin">Super Admins</option>
                <option value="org_admin">Organization Admins</option>
                <option value="end_user">End Users</option>
              </select>
            </div>

            <button
              onClick={() => setActiveTab('provision')}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 16px' }}>
              <Plus style={{ width: '14px', height: '14px' }} />
              <span>Provision User</span>
            </button>
          </div>

          {/* Users Table */}
          <div className="enterprise-glass" style={{ borderRadius: '16px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-hover)' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>User Email</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Role</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Organization</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>Created</th>
                  <th style={{ padding: '14px 18px', fontWeight: 650, color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const isSuper = u.role === 'super_admin';
                    const isOrgAdmin = u.role === 'org_admin';
                    return (
                      <tr
                        key={u._id}
                        style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Mail style={{ width: '14px', height: '14px', color: 'var(--color-text-tertiary)' }} />
                            <span>{u.email}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span className={`badge-pill ${isSuper ? 'badge-indigo' : isOrgAdmin ? 'badge-cyan' : 'badge-emerald'}`} style={{ fontSize: '11px' }}>
                            {isSuper ? 'Super Admin' : isOrgAdmin ? 'Org Admin' : 'End User'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ fontWeight: 550 }}>{u.org_name}</span>
                          {u.org_domain && (
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginLeft: '6px' }}>
                              ({u.org_domain})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setResetModalUser(u);
                                setNewPasswordInput(generatePassword());
                              }}
                              className="btn-secondary"
                              style={{ padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Key style={{ width: '12px', height: '12px' }} />
                              <span>Reset Password</span>
                            </button>
                            {!isSuper && (
                              <button
                                onClick={() => handleDeleteUser(u._id, u.email)}
                                title="Remove user account"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '7px',
                                  background: 'none',
                                  border: '1px solid rgba(244, 63, 94, 0.2)',
                                  color: 'var(--color-rose)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                <Trash2 style={{ width: '13px', height: '13px' }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 4: PROVISIONING HUB ================= */}
      {activeTab === 'provision' && (
        <div className="a-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px' }}>
          {/* Card A: 1-Click Onboard Organization + Primary Admin */}
          <div className="enterprise-glass" style={{ padding: '28px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Building2 style={{ width: '18px', height: '18px', color: 'var(--color-accent)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 750, margin: 0 }}>
                  1-Click Onboard Organization + Org Admin
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Creates tenant container and provisions the primary client administrator
                </span>
              </div>
            </div>

            <form onSubmit={handleQuickOrgSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Organization / Client Name
                </label>
                <input
                  type="text"
                  required
                  value={quickOrgName}
                  onChange={e => setQuickOrgName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Company Domain
                </label>
                <input
                  type="text"
                  required
                  value={quickDomain}
                  onChange={e => setQuickDomain(e.target.value.toLowerCase())}
                  placeholder="e.g. acme.com (without @ or http)"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Primary Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={quickAdminEmail}
                  onChange={e => setQuickAdminEmail(e.target.value)}
                  placeholder="e.g. admin@acme.com"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    Initial Admin Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAdminPassword(generatePassword())}
                    style={{ background: 'none', border: 'none', color: 'var(--color-accent-bright)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
                    Generate Secure Password
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={quickAdminPassword}
                  onChange={e => setQuickAdminPassword(e.target.value)}
                  placeholder="Enter or generate temporary password"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingQuick}
                className="btn-primary"
                style={{ padding: '12px', borderRadius: '10px', marginTop: '6px', fontSize: '13.5px', fontWeight: 650 }}>
                {isSubmittingQuick ? 'Provisioning Tenant...' : 'Onboard Tenant & Issue Admin Credentials'}
              </button>
            </form>
          </div>

          {/* Card B: Provision User for Existing Organization */}
          <div className="enterprise-glass" style={{ padding: '28px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Users style={{ width: '18px', height: '18px', color: 'var(--color-cyan)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 750, margin: 0 }}>
                  Provision Member / End User
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Assigns credentials to an individual in an existing client organization
                </span>
              </div>
            </div>

            <form onSubmit={handleUserProvisionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Target Organization
                </label>
                <select
                  required
                  value={targetOrgId}
                  onChange={e => setTargetOrgId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}>
                  {organizations.map(o => (
                    <option key={o._id} value={o._id}>
                      {o.name} ({o.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  User Work Email
                </label>
                <input
                  type="email"
                  required
                  value={targetEmail}
                  onChange={e => setTargetEmail(e.target.value)}
                  placeholder="e.g. employee@acme.com"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  User Role
                </label>
                <select
                  value={targetRole}
                  onChange={e => setTargetRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}>
                  <option value="end_user">End User (Can chat with Public & Authorized docs)</option>
                  <option value="org_admin">Organization Admin (Can ingest docs & manage team)</option>
                  <option value="super_admin">Central Super Admin (Platform Owner)</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    Initial Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setTargetPassword(generatePassword())}
                    style={{ background: 'none', border: 'none', color: 'var(--color-cyan)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
                    Generate Secure Password
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={targetPassword}
                  onChange={e => setTargetPassword(e.target.value)}
                  placeholder="Enter or generate temporary password"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingUser}
                className="btn-primary"
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  marginTop: '6px',
                  fontSize: '13.5px',
                  fontWeight: 650,
                  background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)'
                }}>
                {isSubmittingUser ? 'Issuing Credentials...' : 'Issue Member Credentials'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: PROVISION CLIENT TENANT ================= */}
      {isProvisionTenantModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '20px'
        }}>
          <div className="enterprise-glass a-scale" style={{
            maxWidth: '540px',
            width: '100%',
            borderRadius: '24px',
            padding: '32px',
            position: 'relative',
            boxShadow: '0 24px 60px rgba(0,0,0,0.65)'
          }}>
            <button
              onClick={() => {
                setIsProvisionTenantModalOpen(false);
                setProvisionError('');
              }}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer'
              }}>
              <X style={{ width: '18px', height: '18px' }} />
            </button>

            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)'
              }}>
                <Building2 style={{ width: '20px', height: '20px', color: '#fff' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                  Provision Client Tenant
                </h3>
                <span style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)' }}>
                  Deploy an isolated tenant container and issue primary client admin credentials
                </span>
              </div>
            </div>

            {/* Modal Error Banner */}
            {provisionError && (
              <div className="a-in" style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#fb7185',
                fontSize: '12.5px'
              }}>
                <ShieldAlert style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                <span>{provisionError}</span>
              </div>
            )}

            <form onSubmit={handleQuickOrgSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Organization / Client Name <span style={{ color: 'var(--color-rose)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={quickOrgName}
                  onChange={e => setQuickOrgName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Company Domain <span style={{ color: 'var(--color-rose)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={quickDomain}
                  onChange={e => setQuickDomain(e.target.value.toLowerCase().trim())}
                  placeholder="e.g. acme.com (without @ or http)"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px', display: 'block' }}>
                  User email domains will be verified against this tenant identifier.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Primary Admin Email <span style={{ color: 'var(--color-rose)' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={quickAdminEmail}
                  onChange={e => setQuickAdminEmail(e.target.value.trim())}
                  placeholder="e.g. admin@acme.com"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    Initial Admin Password <span style={{ color: 'var(--color-rose)' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAdminPassword(generatePassword())}
                    style={{ background: 'none', border: 'none', color: 'var(--color-accent-bright)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
                    Generate Secure Password
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showQuickPassword ? "text" : "password"}
                    required
                    value={quickAdminPassword}
                    onChange={e => setQuickAdminPassword(e.target.value)}
                    placeholder="Enter or generate temporary password"
                    style={{
                      width: '100%',
                      padding: '11px 40px 11px 14px',
                      borderRadius: '10px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowQuickPassword(!showQuickPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-tertiary)',
                      cursor: 'pointer'
                    }}>
                    {showQuickPassword ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
                  </button>
                </div>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSubmittingQuick}
                  className="btn-primary"
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '11px',
                    fontSize: '13.5px',
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}>
                  {isSubmittingQuick ? (
                    <>
                      <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      <span>Provisioning Tenant...</span>
                    </>
                  ) : (
                    <>
                      <Plus style={{ width: '15px', height: '15px' }} />
                      <span>Provision Client Tenant</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProvisionTenantModalOpen(false);
                    setProvisionError('');
                  }}
                  className="btn-secondary"
                  style={{ padding: '12px 18px', borderRadius: '11px', fontSize: '13px' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREDENTIAL HANDOVER SLIP ================= */}
      {credentialModalData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="enterprise-glass a-scale" style={{
            maxWidth: '520px',
            width: '100%',
            borderRadius: '24px',
            padding: '32px',
            position: 'relative',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)'
          }}>
            <button
              onClick={() => setCredentialModalData(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer'
              }}>
              <X style={{ width: '18px', height: '18px' }} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CheckCircle2 style={{ width: '20px', height: '20px', color: '#fff' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0 }}>
                  Account Provisioned Successfully!
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Provide these credentials to the client / user
                </span>
              </div>
            </div>

            {/* Credential Slip Card */}
            <div style={{
              background: 'var(--color-bg-primary)',
              borderRadius: '14px',
              border: '1px solid var(--color-border-default)',
              padding: '20px',
              marginTop: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Organization</span>
                <span style={{ fontSize: '12.5px', fontWeight: 650 }}>{credentialModalData.organization_name || 'N/A'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Assigned Role</span>
                <span className="badge-pill badge-indigo" style={{ fontSize: '11px' }}>
                  {credentialModalData.role}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Login URL</span>
                <a
                  href={window.location.origin + '/auth'}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '12px', color: 'var(--color-accent-bright)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                  {window.location.origin + '/auth'}
                  <ExternalLink style={{ width: '11px', height: '11px' }} />
                </a>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Username / Email</span>
                <span style={{ fontSize: '12.5px', fontWeight: 600, fontFamily: 'monospace' }}>{credentialModalData.email}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Password</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-amber)' }}>
                    {showPasswordInModal ? credentialModalData.password : '••••••••••••'}
                  </span>
                  <button
                    onClick={() => setShowPasswordInModal(!showPasswordInModal)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '2px' }}>
                    {showPasswordInModal ? <EyeOff style={{ width: '14px', height: '14px' }} /> : <Eye style={{ width: '14px', height: '14px' }} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Copy Button */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
              <button
                onClick={copyHandoverPacket}
                className="btn-primary"
                style={{ flex: 1, padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 650 }}>
                {copiedHandover ? (
                  <>
                    <Check style={{ width: '16px', height: '16px' }} />
                    <span>Copied Welcome Letter to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy style={{ width: '16px', height: '16px' }} />
                    <span>Copy Client Onboarding Letter</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setCredentialModalData(null)}
                className="btn-secondary"
                style={{ padding: '12px 18px', borderRadius: '12px', fontSize: '13px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: PASSWORD RESET ================= */}
      {resetModalUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="enterprise-glass a-scale" style={{
            maxWidth: '460px',
            width: '100%',
            borderRadius: '20px',
            padding: '28px',
            position: 'relative'
          }}>
            <button
              onClick={() => setResetModalUser(null)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer'
              }}>
              <X style={{ width: '16px', height: '16px' }} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Key style={{ width: '16px', height: '16px', color: 'var(--color-accent)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 750, margin: 0 }}>
                  Reset User Password
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {resetModalUser.email}
                </span>
              </div>
            </div>

            <form onSubmit={handlePasswordResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPasswordInput(generatePassword())}
                    style={{ background: 'none', border: 'none', color: 'var(--color-accent-bright)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Generate Secure Password
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="btn-primary"
                  style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '13px', fontWeight: 650 }}>
                  {isResetting ? 'Updating...' : 'Set New Password & Show Slip'}
                </button>
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="btn-secondary"
                  style={{ padding: '11px 16px', borderRadius: '10px', fontSize: '13px' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
