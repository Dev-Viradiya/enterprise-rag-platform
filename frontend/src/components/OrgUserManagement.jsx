import { useState, useEffect, useMemo, useContext } from 'react';
import {
  Users, UserPlus, Shield, ShieldCheck, KeyRound, Copy, Check,
  Search, Trash2, AlertCircle, X, Lock, Building2, RefreshCw,
  Eye, EyeOff, Sparkles, Mail, CheckCircle2, ChevronRight,
  FileText, UploadCloud, UserCheck, CheckCircle, Plus
} from 'lucide-react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const BASE_ROLE_CONFIG = {
  org_admin: { label: 'Org Admin', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)', icon: ShieldCheck, desc: 'Full tenant admin, document ingestion & user provisioning' },
  end_user: { label: 'End User', color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.3)', icon: UserCheck, desc: 'Standard member queries & knowledge chat' },
};

const DYNAMIC_PALETTE = [
  { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' },
  { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)' },
  { color: '#fb7185', bg: 'rgba(251, 113, 133, 0.12)', border: 'rgba(251, 113, 133, 0.3)' },
  { color: '#818cf8', bg: 'rgba(129, 140, 248, 0.12)', border: 'rgba(129, 140, 248, 0.3)' },
  { color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.12)', border: 'rgba(45, 212, 191, 0.3)' },
  { color: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)', border: 'rgba(244, 114, 182, 0.3)' },
];

const getRoleConfig = (role) => {
  if (BASE_ROLE_CONFIG[role]) return BASE_ROLE_CONFIG[role];
  let hash = 0;
  for (let i = 0; i < (role || '').length; i++) {
    hash = role.charCodeAt(i) + ((hash << 5) - hash);
  }
  const theme = DYNAMIC_PALETTE[Math.abs(hash) % DYNAMIC_PALETTE.length];
  return {
    label: role ? role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Member',
    ...theme,
    icon: UserCheck,
    desc: `Assigned '${role ? role.replace(/_/g, ' ') : 'custom'}' privileges for organization records`
  };
};

export default function OrgUserManagement({ targetOrgId = null }) {
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';

  // Core Data State
  const [users, setUsers] = useState([]);
  const [orgInfo, setOrgInfo] = useState({
    name: user?.org_name || 'Organization',
    domain: user?.org_domain || ''
  });
  const [orgRoles, setOrgRoles] = useState(['org_admin', 'end_user']);
  const [stats, setStats] = useState({
    total_members: 0,
    end_users: 0,
    org_admins: 0,
    role_counts: {}
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('end_user');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Add Custom Role Modal State
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [addRoleError, setAddRoleError] = useState('');

  // Reset Password Modal State
  const [resetUser, setResetUser] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  // Delete User Modal State
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Credential Handover Modal State
  const [credentialModalData, setCredentialModalData] = useState(null);
  const [copiedHandover, setCopiedHandover] = useState(false);
  const [copiedEmailId, setCopiedEmailId] = useState(null);

  // Generate strong random password
  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!newPassword) return null;
    if (newPassword.length < 6) {
      return { score: 1, label: 'Weak (min 6 chars)', color: '#f43f5e', percent: '25%' };
    }
    const hasNum = /\d/.test(newPassword);
    const hasSpec = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const varieties = [hasNum, hasSpec, hasUpper, hasLower].filter(Boolean).length;

    if (newPassword.length >= 10 && varieties >= 3) {
      return { score: 3, label: 'Strong & Secure', color: '#10b981', percent: '100%' };
    }
    return { score: 2, label: 'Good Password', color: '#f59e0b', percent: '65%' };
  }, [newPassword]);

  // Fetch Organization Users & Roles
  const fetchOrgUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (isSuperAdmin && targetOrgId) {
        params.organization_id = targetOrgId;
      }
      const res = await api.get('/admin/org/users', { params });

      if (res.data) {
        if (Array.isArray(res.data)) {
          setUsers(res.data);
          setStats({
            total_members: res.data.length,
            end_users: res.data.filter(u => u.role === 'end_user').length,
            org_admins: res.data.filter(u => u.role === 'org_admin').length,
            role_counts: {}
          });
        } else {
          setUsers(res.data.users || []);
          if (res.data.organization) {
            setOrgInfo(res.data.organization);
          }
          if (res.data.roles && Array.isArray(res.data.roles) && res.data.roles.length > 0) {
            setOrgRoles(res.data.roles);
          } else if (res.data.organization?.roles) {
            setOrgRoles(res.data.organization.roles);
          }
          if (res.data.stats) {
            setStats(res.data.stats);
          }
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load organization members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgUsers();
  }, [targetOrgId]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = !searchQuery || (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  // Handle Quick Append Domain to Email
  const handleAppendDomain = () => {
    if (!orgInfo.domain) return;
    const cleanPrefix = newEmail.split('@')[0].trim();
    if (cleanPrefix) {
      setNewEmail(`${cleanPrefix}@${orgInfo.domain}`);
    } else {
      setNewEmail(`user@${orgInfo.domain}`);
    }
  };

  // Open Add Member Modal
  const handleOpenAddModal = (defaultRole = 'end_user') => {
    setSelectedRole(defaultRole);
    setNewEmail('');
    setNewPassword(generateSecurePassword());
    setShowPassword(false);
    setModalError('');
    setIsAddModalOpen(true);
  };

  // Handle Add Custom Role
  const handleAddRoleSubmit = async (e) => {
    e.preventDefault();
    const clean = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!clean || clean.length < 2) {
      setAddRoleError('Role name must be at least 2 characters.');
      return;
    }
    setIsAddingRole(true);
    setAddRoleError('');
    try {
      const url = isSuperAdmin && targetOrgId ? `/admin/organizations/${targetOrgId}/roles` : '/admin/org/roles';
      const res = await api.post(url, { role_name: clean });
      if (res.data?.roles) {
        setOrgRoles(res.data.roles);
        setSelectedRole(clean);
      }
      setSuccess(`Added new role "${clean.replace(/_/g, ' ')}" to organization.`);
      setIsAddRoleModalOpen(false);
      setNewRoleName('');
    } catch (err) {
      setAddRoleError(err.response?.data?.detail || 'Failed to add role.');
    } finally {
      setIsAddingRole(false);
    }
  };

  // Handle Add Member Form Submission
  const handleAddUserSubmit = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setModalError('Please enter an email address.');
      return;
    }
    if (newPassword.length < 6) {
      setModalError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    setModalError('');
    setError('');

    try {
      const payload = {
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: selectedRole
      };

      if (isSuperAdmin && targetOrgId) {
        payload.organization_id = targetOrgId;
      }

      const res = await api.post('/admin/org/users', payload);
      const roleConfig = getRoleConfig(selectedRole);

      setIsAddModalOpen(false);
      setSuccess(`Successfully provisioned ${roleConfig.label} "${newEmail.trim().toLowerCase()}" for ${orgInfo.name}.`);
      setCredentialModalData(res.data.credentials || {
        organization_name: orgInfo.name,
        organization_domain: orgInfo.domain,
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: roleConfig.label
      });

      fetchOrgUsers();
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to provision member. Please verify email and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Password Reset
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetUser) return;
    if (newPasswordInput.length < 6) {
      setResetError('Password must be at least 6 characters.');
      return;
    }

    setIsResetting(true);
    setResetError('');
    try {
      const res = await api.patch(`/admin/org/users/${resetUser._id}/reset-password`, {
        new_password: newPasswordInput
      });

      const roleConfig = getRoleConfig(resetUser.role);
      setResetUser(null);
      setSuccess(`Password updated successfully for ${resetUser.email}.`);
      setCredentialModalData(res.data.credentials || {
        organization_name: orgInfo.name,
        organization_domain: orgInfo.domain,
        email: resetUser.email,
        password: newPasswordInput,
        role: roleConfig.label
      });
      fetchOrgUsers();
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  // Handle Delete Member
  const handleDeleteUserConfirm = async () => {
    if (!deleteUserTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/admin/org/users/${deleteUserTarget._id}`);
      setSuccess(`Removed ${deleteUserTarget.email} from organization.`);
      setDeleteUserTarget(null);
      fetchOrgUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove user.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy Email to Clipboard helper
  const handleCopyEmail = (email, id) => {
    navigator.clipboard.writeText(email);
    setCopiedEmailId(id);
    setTimeout(() => setCopiedEmailId(null), 2000);
  };

  // Copy Credential Packet to Clipboard
  const handleCopyCredentials = () => {
    if (!credentialModalData) return;
    const loginUrl = window.location.origin + '/auth';
    const packet = `=====================================================
ENTERPRISE RAG PLATFORM — USER CREDENTIAL HANDOVER
=====================================================

Organization : ${credentialModalData.organization_name || orgInfo.name}
Domain       : ${credentialModalData.organization_domain || orgInfo.domain || 'N/A'}
Sign-In URL  : ${loginUrl}

USER CREDENTIALS:
Email        : ${credentialModalData.email}
Password     : ${credentialModalData.password}
Access Role  : ${credentialModalData.role}

ROLE CAPABILITIES:
- Tenant: ${credentialModalData.organization_name || orgInfo.name}
- Role-gated AI Chat answering from permitted organization documents
- Zero cross-org data leakage
=====================================================`;

    navigator.clipboard.writeText(packet);
    setCopiedHandover(true);
    setTimeout(() => setCopiedHandover(false), 2500);
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Active';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Active';
    }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1280px', margin: '0 auto', color: 'var(--color-text-primary)' }}>
      {/* ================= HEADER SECTION ================= */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(6, 182, 212, 0.35)'
            }}>
              <Users style={{ width: '20px', height: '20px', color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: 'var(--color-text-primary)' }}>
              Organization Team & Roles
            </h1>
            <span className="badge-pill badge-cyan" style={{ fontSize: '11px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 650 }}>
              <Lock style={{ width: '11px', height: '11px' }} />
              TENANT ISOLATED
            </span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>Manage members and custom roles strictly within</span>
            <span style={{ fontWeight: 750, color: 'var(--color-accent-bright)' }}>{orgInfo.name}</span>
            {orgInfo.domain && (
              <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                @{orgInfo.domain}
              </span>
            )}
          </p>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchOrgUsers}
            disabled={loading}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 15px' }}
            title="Refresh member roster">
            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsAddRoleModalOpen(true)}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 15px' }}
            title="Add a new custom user role for this organization">
            <Plus style={{ width: '15px', height: '15px', color: 'var(--color-accent-bright)' }} />
            <span>Add Role</span>
          </button>
          <button
            onClick={() => handleOpenAddModal('end_user')}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '13px',
              padding: '9px 18px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #4f46e5 100%)',
              boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)'
            }}>
            <UserPlus style={{ width: '16px', height: '16px' }} />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* ================= ALERTS ================= */}
      {error && (
        <div className="a-in" style={{
          marginBottom: '20px',
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fb7185'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle style={{ width: '18px', height: '18px', flexShrink: 0 }} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{error}</span>
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X style={{ width: '15px', height: '15px' }} />
          </button>
        </div>
      )}

      {success && (
        <div className="a-in" style={{
          marginBottom: '20px',
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#10b981'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 style={{ width: '18px', height: '18px', flexShrink: 0 }} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X style={{ width: '15px', height: '15px' }} />
          </button>
        </div>
      )}

      {/* ================= METRIC CARDS ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {/* Card 1: Total Organization Members */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--color-border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Members
            </span>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
              <Users style={{ width: '16px', height: '16px' }} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
            {stats.total_members}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Accounts inside {orgInfo.name}
          </div>
        </div>

        {/* Card 2: Configured Roles */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--color-border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Configured Roles
            </span>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
              <Sparkles style={{ width: '16px', height: '16px' }} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', color: '#38bdf8' }}>
            {orgRoles.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Available for document gating
          </div>
        </div>

        {/* Card 3: Organization Admins */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--color-border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Org Administrators
            </span>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
              <ShieldCheck style={{ width: '16px', height: '16px' }} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', color: '#06b6d4' }}>
            {stats.org_admins}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Document ingest & co-administrators
          </div>
        </div>

        {/* Card 4: Tenant Boundary Status */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--color-border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tenant Scope
            </span>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
              <Lock style={{ width: '16px', height: '16px' }} />
            </div>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '4px' }}>
            {orgInfo.domain ? `@${orgInfo.domain}` : orgInfo.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Strict Pinecone & vector namespace
          </div>
        </div>
      </div>

      {/* ================= ROSTER FILTER & TABLE ================= */}
      <div className="card-surface" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--color-border-default)' }}>
        {/* Table Controls */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Search Input */}
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <Search style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '15px',
              height: '15px',
              color: 'var(--color-text-tertiary)'
            }} />
            <input
              type="text"
              placeholder="Search members by email address..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '13px' }}
            />
          </div>

          {/* Dynamic Role Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', fontWeight: 650 }}>Filter Role:</span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="input-field"
              style={{ height: '38px', padding: '0 14px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
              <option value="all">All Roles ({users.length})</option>
              {orgRoles.map(r => {
                const count = users.filter(u => u.role === r).length;
                return (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Member Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-default)' }}>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Member / Email
                </th>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Platform Role
                </th>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Organization Tenant
                </th>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Provisioned On
                </th>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                    <RefreshCw style={{ width: '22px', height: '22px', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
                    <p style={{ margin: 0 }}>Loading organization team...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                    <Users style={{ width: '32px', height: '32px', margin: '0 auto 10px', opacity: 0.5 }} />
                    <p style={{ fontWeight: 650, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>No members match filter</p>
                    <p style={{ fontSize: '12px', margin: 0 }}>Try clearing your search query or role filter.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isCurrent = user?.sub === u._id;
                  const roleConfig = getRoleConfig(u.role);

                  return (
                    <tr
                      key={u._id}
                      style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.15s' }}
                      className="table-row-hover">
                      {/* Member Info */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            background: roleConfig.bg,
                            border: `1px solid ${roleConfig.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: roleConfig.color,
                            fontWeight: 750,
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            flexShrink: 0
                          }}>
                            {(u.email || 'U').charAt(0)}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 650, color: 'var(--color-text-primary)' }}>
                                {u.email}
                              </span>
                              <button
                                onClick={() => handleCopyEmail(u.email, u._id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: copiedEmailId === u._id ? '#10b981' : 'var(--color-text-tertiary)',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="Copy email address">
                                {copiedEmailId === u._id ? <Check style={{ width: '12px', height: '12px' }} /> : <Copy style={{ width: '12px', height: '12px' }} />}
                              </button>
                              {isCurrent && (
                                <span className="badge-pill badge-indigo" style={{ fontSize: '10px', padding: '1px 7px' }}>
                                  You
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                              ID: {u._id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Dynamic Role Badge */}
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          background: roleConfig.bg,
                          color: roleConfig.color,
                          border: `1px solid ${roleConfig.border}`
                        }}>
                          <roleConfig.icon style={{ width: '12px', height: '12px' }} />
                          <span>{roleConfig.label}</span>
                        </span>
                      </td>

                      {/* Tenant Scope */}
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12.5px',
                          color: 'var(--color-text-primary)',
                          fontWeight: 550
                        }}>
                          <Building2 style={{ width: '13px', height: '13px', color: 'var(--color-text-tertiary)' }} />
                          <span>{orgInfo.name}</span>
                        </span>
                      </td>

                      {/* Provision Date */}
                      <td style={{ padding: '14px 20px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                        {formatDate(u.created_at)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setResetUser(u);
                              setNewPasswordInput(generateSecurePassword());
                              setShowResetPassword(false);
                              setResetError('');
                            }}
                            className="btn-secondary"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                            title="Reset member password">
                            <KeyRound style={{ width: '13px', height: '13px' }} />
                            <span>Reset Pwd</span>
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => setDeleteUserTarget(u)}
                              style={{
                                padding: '6px 9px',
                                borderRadius: '8px',
                                background: 'none',
                                border: '1px solid rgba(244, 63, 94, 0.25)',
                                color: 'var(--color-rose)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                              title="Remove member">
                              <Trash2 style={{ width: '14px', height: '14px' }} />
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

      {/* ================= MODAL 1: ADD MEMBER WITH DYNAMIC ROLE SELECTION ================= */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '560px',
            maxWidth: '100%',
            borderRadius: '20px',
            border: '1px solid var(--color-border-strong)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-bg-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #4f46e5 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}>
                  <UserPlus style={{ width: '19px', height: '19px' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 750, margin: 0, color: 'var(--color-text-primary)' }}>
                    Add Member to Organization
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    Target Tenant: <strong style={{ color: 'var(--color-text-primary)' }}>{orgInfo.name}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px' }}>
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddUserSubmit} style={{ padding: '24px', overflowY: 'auto' }}>
              {modalError && (
                <div style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fb7185',
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* ================= STEP 1: INTERACTIVE ROLE SELECTOR ================= */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 750, color: 'var(--color-text-primary)' }}>
                    Select Member Role in Organization *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setIsAddRoleModalOpen(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent-bright)',
                      fontSize: '11.5px',
                      fontWeight: 650,
                      cursor: 'pointer'
                    }}>
                    + Add New Role
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                  {orgRoles.map(role => {
                    const cfg = getRoleConfig(role);
                    const isSelected = selectedRole === role;
                    return (
                      <div
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '11px',
                          cursor: 'pointer',
                          border: isSelected ? `2px solid ${cfg.color}` : '1px solid var(--color-border-default)',
                          background: isSelected ? cfg.bg : 'var(--color-bg-secondary)',
                          boxShadow: isSelected ? `0 4px 12px ${cfg.bg}` : 'none',
                          transition: 'all 0.15s ease'
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <cfg.icon style={{ width: '14px', height: '14px', color: cfg.color }} />
                          <span style={{ fontSize: '12px', fontWeight: 750, color: 'var(--color-text-primary)' }}>
                            {cfg.label}
                          </span>
                        </div>
                        <p style={{ fontSize: '10.5px', color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.3 }}>
                          {cfg.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Target Organization (Read-Only) */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  Organization Tenant (Locked)
                </label>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 style={{ width: '15px', height: '15px', color: 'var(--color-accent)' }} />
                    <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{orgInfo.name}</span>
                    {orgInfo.domain && (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 550 }}>({orgInfo.domain})</span>
                    )}
                  </div>
                  <span className="badge-pill badge-cyan" style={{ fontSize: '10.5px' }}>
                    Your Org
                  </span>
                </div>
              </div>

              {/* User Email */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Member Email Address *
                  </label>
                  {orgInfo.domain && (
                    <button
                      type="button"
                      onClick={handleAppendDomain}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-accent)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}>
                      Use @{orgInfo.domain}
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <Mail style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '15px',
                    height: '15px',
                    color: 'var(--color-text-tertiary)'
                  }} />
                  <input
                    type="email"
                    required
                    placeholder={orgInfo.domain ? `member@${orgInfo.domain}` : 'user@company.com'}
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '36px', height: '40px', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Temporary Password */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Temporary Initial Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateSecurePassword())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent-bright)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                    <Sparkles style={{ width: '12px', height: '12px' }} />
                    Generate Strong
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <KeyRound style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '15px',
                    height: '15px',
                    color: 'var(--color-text-tertiary)'
                  }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter or generate initial password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '36px', paddingRight: '40px', height: '40px', fontSize: '13px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
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
                    {showPassword ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
                  </button>
                </div>

                {passwordStrength && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: passwordStrength.percent, background: passwordStrength.color, transition: 'all 0.2s' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: passwordStrength.color, fontWeight: 600, marginTop: '3px', display: 'block' }}>
                      Strength: {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '9px 18px', fontSize: '13px' }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{
                    padding: '9px 20px',
                    fontSize: '13px',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #4f46e5 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                  {isSubmitting ? (
                    <>
                      <RefreshCw style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
                      <span>Provisioning...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus style={{ width: '15px', height: '15px' }} />
                      <span>Provision User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: ADD CUSTOM ROLE ================= */}
      {isAddRoleModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1010,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '440px',
            maxWidth: '100%',
            borderRadius: '18px',
            border: '1px solid var(--color-border-strong)',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8'
                }}>
                  <Plus style={{ width: '18px', height: '18px' }} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 750, margin: 0, color: 'var(--color-text-primary)' }}>
                  Add Custom Role to {orgInfo.name}
                </h3>
              </div>
              <button
                onClick={() => setIsAddRoleModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Define a new organization role (e.g. <code>dean</code>, <code>researcher</code>, <code>accountant</code>, <code>ta</code>). This role will appear in user provisioning and document security checklists.
            </p>

            {addRoleError && (
              <div style={{
                marginBottom: '14px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fb7185',
                fontSize: '12px'
              }}>
                {addRoleError}
              </div>
            )}

            <form onSubmit={handleAddRoleSubmit}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  Role Identifier Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. researcher, accountant, dean"
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: '38px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddRoleModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '12.5px' }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingRole || !newRoleName.trim()}
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '12.5px' }}>
                  {isAddingRole ? 'Saving...' : 'Add Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: CREDENTIAL HANDOVER MODAL ================= */}
      {credentialModalData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '520px',
            maxWidth: '100%',
            borderRadius: '20px',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981'
              }}>
                <CheckCircle2 style={{ width: '22px', height: '22px' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                  Credentials Provisioned & Ready
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Share this credential packet directly with the new member
                </span>
              </div>
            </div>

            <div style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Organization:</span>
                <span style={{ fontWeight: 700 }}>{credentialModalData.organization_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Assigned Role:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-accent-bright)' }}>{credentialModalData.role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Email:</span>
                <span style={{ fontWeight: 700 }}>{credentialModalData.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Password:</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#10b981' }}>{credentialModalData.password}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleCopyCredentials}
                className="btn-primary"
                style={{ flex: 1, padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {copiedHandover ? <Check style={{ width: '15px', height: '15px' }} /> : <Copy style={{ width: '15px', height: '15px' }} />}
                <span>{copiedHandover ? 'Copied Packet!' : 'Copy Credential Packet'}</span>
              </button>
              <button
                onClick={() => setCredentialModalData(null)}
                className="btn-secondary"
                style={{ padding: '10px 18px', fontSize: '13px' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: PASSWORD RESET MODAL ================= */}
      {resetUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '460px',
            maxWidth: '100%',
            borderRadius: '18px',
            border: '1px solid var(--color-border-strong)',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 750, margin: 0 }}>Reset Password</h3>
              <button onClick={() => setResetUser(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Reset password for <strong>{resetUser.email}</strong>
            </p>

            {resetError && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.1)', color: '#fb7185', fontSize: '12px' }}>
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit}>
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650 }}>New Temporary Password</label>
                  <button
                    type="button"
                    onClick={() => setNewPasswordInput(generateSecurePassword())}
                    style={{ background: 'none', border: 'none', color: 'var(--color-accent-bright)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Generate Strong
                  </button>
                </div>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: '38px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setResetUser(null)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12.5px' }}>
                  Cancel
                </button>
                <button type="submit" disabled={isResetting} className="btn-primary" style={{ padding: '8px 18px', fontSize: '12.5px' }}>
                  {isResetting ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 5: DELETE CONFIRMATION ================= */}
      {deleteUserTarget && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '420px',
            maxWidth: '100%',
            borderRadius: '18px',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            padding: '24px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 750, margin: '0 0 10px', color: 'var(--color-rose)' }}>
              Remove Team Member
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to remove <strong>{deleteUserTarget.email}</strong> from {orgInfo.name}? This account will no longer be able to log in.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setDeleteUserTarget(null)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12.5px' }}>
                Cancel
              </button>
              <button
                onClick={handleDeleteUserConfirm}
                disabled={isDeleting}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  background: 'var(--color-rose)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}>
                {isDeleting ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
