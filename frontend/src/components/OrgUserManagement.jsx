import { useState, useEffect, useMemo, useContext } from 'react';
import {
  Users, UserPlus, Shield, ShieldCheck, KeyRound, Copy, Check,
  Search, Trash2, AlertCircle, X, Lock, Building2, RefreshCw,
  Eye, EyeOff, Sparkles, Mail, CheckCircle2, Info
} from 'lucide-react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

export default function OrgUserManagement({ targetOrgId = null }) {
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';

  // Core Data State
  const [users, setUsers] = useState([]);
  const [orgInfo, setOrgInfo] = useState({
    name: user?.org_name || 'Organization',
    domain: user?.org_domain || ''
  });
  const [stats, setStats] = useState({
    total_members: 0,
    end_users: 0,
    org_admins: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'end_user' | 'org_admin'

  // Add End User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

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

  // Generate strong random password
  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  // Fetch Organization Users & Metadata
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
            org_admins: res.data.filter(u => u.role === 'org_admin').length
          });
        } else {
          setUsers(res.data.users || []);
          if (res.data.organization) {
            setOrgInfo(res.data.organization);
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

  // Open Add End User Modal
  const handleOpenAddModal = () => {
    setNewEmail('');
    setNewPassword(generateSecurePassword());
    setShowPassword(false);
    setModalError('');
    setIsAddModalOpen(true);
  };

  // Handle Add End User Form Submission
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
        password: newPassword
      };

      if (isSuperAdmin && targetOrgId) {
        payload.organization_id = targetOrgId;
      }

      const res = await api.post('/admin/org/users', payload);

      setIsAddModalOpen(false);
      setSuccess(`Successfully added End User "${newEmail.trim().toLowerCase()}" to ${orgInfo.name}.`);
      setCredentialModalData(res.data.credentials || {
        organization_name: orgInfo.name,
        organization_domain: orgInfo.domain,
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: 'End User'
      });

      fetchOrgUsers();
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to provision end user. Ensure email is unique and valid.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Open Reset Password Modal
  const handleOpenResetModal = (targetUser) => {
    setResetUser(targetUser);
    setNewPasswordInput(generateSecurePassword());
    setShowResetPassword(false);
    setResetError('');
  };

  // Handle Submit Password Reset
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetUser || newPasswordInput.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }

    setIsResetting(true);
    setResetError('');
    try {
      const res = await api.patch(`/admin/org/users/${resetUser._id}/reset-password`, {
        new_password: newPasswordInput
      });

      setResetUser(null);
      setSuccess(`Password updated successfully for ${resetUser.email}.`);
      setCredentialModalData(res.data.credentials || {
        organization_name: orgInfo.name,
        organization_domain: orgInfo.domain,
        email: resetUser.email,
        password: newPasswordInput,
        role: 'End User'
      });
      fetchOrgUsers();
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  // Handle Delete End User
  const handleDeleteUserConfirm = async () => {
    if (!deleteUserTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/admin/org/users/${deleteUserTarget._id}`);
      setSuccess(`Removed user ${deleteUserTarget.email} from organization.`);
      setDeleteUserTarget(null);
      fetchOrgUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove user.');
    } finally {
      setIsDeleting(false);
    }
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
Access Role  : ${credentialModalData.role || 'End User'}

ACCESS SCOPE:
- Query & Chat with ${credentialModalData.organization_name || orgInfo.name}'s Knowledge Base
- Secure Tenant Isolation (Zero cross-organization document leakage)
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
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(6, 182, 212, 0.35)'
            }}>
              <Users style={{ width: '18px', height: '18px', color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Organization Team Management
            </h1>
            <span className="badge-pill badge-cyan" style={{ fontSize: '11.5px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock style={{ width: '11px', height: '11px' }} />
              TENANT SCOPED
            </span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Manage users and team access strictly within</span>
            <span style={{ fontWeight: 700, color: 'var(--color-accent-bright)' }}>{orgInfo.name}</span>
            {orgInfo.domain && (
              <span style={{ padding: '1px 7px', borderRadius: '5px', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-default)', fontSize: '12px' }}>
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
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
            title="Refresh member roster">
            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              boxShadow: '0 2px 10px rgba(6, 182, 212, 0.35)'
            }}>
            <UserPlus style={{ width: '15px', height: '15px' }} />
            <span>Add End User</span>
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
          color: '#fb7185'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle style={{ width: '18px', height: '18px', flexShrink: 0 }} />
            <span style={{ fontSize: '13.5px', fontWeight: 550 }}>{error}</span>
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
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#34d399'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 style={{ width: '18px', height: '18px', flexShrink: 0 }} />
            <span style={{ fontSize: '13.5px', fontWeight: 550 }}>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X style={{ width: '15px', height: '15px' }} />
          </button>
        </div>
      )}

      {/* ================= TENANT POLICY BANNER ================= */}
      <div style={{
        marginBottom: '24px',
        padding: '14px 18px',
        borderRadius: '12px',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(6, 182, 212, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-cyan, #06b6d4)'
          }}>
            <ShieldCheck style={{ width: '16px', height: '16px' }} />
          </div>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 650, margin: 0, color: 'var(--color-text-primary)' }}>
              Strict Tenant Isolation Enforced
            </p>
            <p style={{ fontSize: '12px', margin: 0, color: 'var(--color-text-secondary)' }}>
              As Organization Admin, you can provision End Users exclusively for <strong>{orgInfo.name}</strong>. Cross-tenant access and external organization provisioning are strictly locked.
            </p>
          </div>
        </div>
        <span className="badge-pill badge-emerald" style={{ fontSize: '11px', padding: '3px 8px' }}>
          ● Enterprise Tenant Isolation Active
        </span>
      </div>

      {/* ================= METRIC CARDS ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {/* Card 1: Total Organization Members */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Members
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
              <Users style={{ width: '15px', height: '15px' }} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
            {stats.total_members}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            All active accounts in {orgInfo.name}
          </div>
        </div>

        {/* Card 2: Active End Users */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active End Users
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
              <Sparkles style={{ width: '15px', height: '15px' }} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#10b981' }}>
            {stats.end_users}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Standard knowledge query & chat access
          </div>
        </div>

        {/* Card 3: Organization Admins */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Org Administrators
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
              <Shield style={{ width: '15px', height: '15px' }} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#06b6d4' }}>
            {stats.org_admins}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Document ingest & member management
          </div>
        </div>

        {/* Card 4: Tenant Boundary Status */}
        <div className="card-surface" style={{ padding: '18px 20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tenant Scope
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
              <Lock style={{ width: '15px', height: '15px' }} />
            </div>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 750, color: 'var(--color-text-primary)', marginTop: '6px' }}>
            {orgInfo.domain ? `@${orgInfo.domain}` : orgInfo.name}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Isolated Pinecone & Mongo namespace
          </div>
        </div>
      </div>

      {/* ================= ROSTER FILTER & TABLE ================= */}
      <div className="card-surface" style={{ borderRadius: '16px', overflow: 'hidden' }}>
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
              placeholder="Search member email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '36px', height: '36px', fontSize: '13px' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer'
                }}>
                <X style={{ width: '13px', height: '13px' }} />
              </button>
            )}
          </div>

          {/* Role Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-bg-secondary)', padding: '4px', borderRadius: '10px', border: '1px solid var(--color-border-subtle)' }}>
            <button
              onClick={() => setRoleFilter('all')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: roleFilter === 'all' ? 'var(--color-bg-card)' : 'transparent',
                color: roleFilter === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: roleFilter === 'all' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s'
              }}>
              All ({users.length})
            </button>
            <button
              onClick={() => setRoleFilter('end_user')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: roleFilter === 'end_user' ? 'var(--color-bg-card)' : 'transparent',
                color: roleFilter === 'end_user' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: roleFilter === 'end_user' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s'
              }}>
              End Users ({stats.end_users})
            </button>
            <button
              onClick={() => setRoleFilter('org_admin')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: roleFilter === 'org_admin' ? 'var(--color-bg-card)' : 'transparent',
                color: roleFilter === 'org_admin' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: roleFilter === 'org_admin' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s'
              }}>
              Org Admins ({stats.org_admins})
            </button>
          </div>
        </div>

        {/* Member Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
                <th style={{ padding: '12px 20px', fontWeight: 650, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Member</th>
                <th style={{ padding: '12px 20px', fontWeight: 650, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</th>
                <th style={{ padding: '12px 20px', fontWeight: 650, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tenant Scope</th>
                <th style={{ padding: '12px 20px', fontWeight: 650, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Joined</th>
                <th style={{ padding: '12px 20px', fontWeight: 650, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span style={{ fontSize: '13px' }}>Loading organization members...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'var(--color-bg-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-tertiary)'
                      }}>
                        <Users style={{ width: '22px', height: '22px' }} />
                      </div>
                      <p style={{ margin: 0, fontWeight: 650, color: 'var(--color-text-primary)' }}>
                        {searchQuery ? 'No matching members found' : 'No End Users provisioned yet'}
                      </p>
                      <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-text-tertiary)', maxWidth: '380px' }}>
                        {searchQuery
                          ? `No members match "${searchQuery}". Clear your search query to see all accounts.`
                          : `Click "+ Add End User" to provision credentials for team members in ${orgInfo.name}.`}
                      </p>
                      {!searchQuery && (
                        <button
                          onClick={handleOpenAddModal}
                          className="btn-primary"
                          style={{ marginTop: '8px', fontSize: '12.5px', padding: '6px 14px' }}>
                          <UserPlus style={{ width: '13px', height: '13px' }} />
                          <span>Add First End User</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isCurrent = u.email === user?.email;
                  const isOrgAdminUser = u.role === 'org_admin';
                  const isSuperAdminUser = u.role === 'super_admin';

                  return (
                    <tr
                      key={u._id}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        transition: 'background 0.15s'
                      }}
                      className="table-row-hover">
                      {/* Member Info */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '9px',
                            background: isOrgAdminUser
                              ? 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)'
                              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
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
                              {isCurrent && (
                                <span className="badge-pill badge-indigo" style={{ fontSize: '10px', padding: '1px 6px' }}>
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

                      {/* Role */}
                      <td style={{ padding: '14px 20px' }}>
                        {isSuperAdminUser ? (
                          <span className="badge-pill badge-indigo" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                            <ShieldCheck style={{ width: '12px', height: '12px' }} />
                            Super Admin
                          </span>
                        ) : isOrgAdminUser ? (
                          <span className="badge-pill badge-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                            <Shield style={{ width: '12px', height: '12px' }} />
                            Org Admin
                          </span>
                        ) : (
                          <span className="badge-pill badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                            <Sparkles style={{ width: '12px', height: '12px' }} />
                            End User
                          </span>
                        )}
                      </td>

                      {/* Tenant Scope */}
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11.5px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border-subtle)',
                          color: 'var(--color-text-secondary)'
                        }}>
                          <Lock style={{ width: '11px', height: '11px', color: 'var(--color-accent)' }} />
                          {orgInfo.name} Only
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td style={{ padding: '14px 20px', color: 'var(--color-text-secondary)', fontSize: '12.5px' }}>
                        {formatDate(u.created_at)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {/* Reset Password Button */}
                          <button
                            onClick={() => handleOpenResetModal(u)}
                            disabled={!isSuperAdmin && isOrgAdminUser && !isCurrent}
                            className="btn-secondary"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11.5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                            title="Reset member password">
                            <KeyRound style={{ width: '12px', height: '12px' }} />
                            <span>Reset Key</span>
                          </button>

                          {/* Delete User Button */}
                          {isOrgAdminUser && !isSuperAdmin ? (
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', padding: '4px 6px' }}>
                              Protected
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteUserTarget(u)}
                              disabled={isCurrent}
                              className="btn-danger"
                              style={{
                                padding: '5px 8px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: isCurrent ? 0.4 : 1,
                                cursor: isCurrent ? 'not-allowed' : 'pointer'
                              }}
                              title={isCurrent ? 'Cannot delete your own account' : 'Remove user from organization'}>
                              <Trash2 style={{ width: '12px', height: '12px' }} />
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

      {/* ================= MODAL 1: ADD END USER ================= */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '100%',
            maxWidth: '520px',
            borderRadius: '18px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            border: '1px solid var(--color-border-default)'
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
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}>
                  <UserPlus style={{ width: '16px', height: '16px' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 750, margin: 0, color: 'var(--color-text-primary)' }}>
                    Add End User to Organization
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {orgInfo.name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddUserSubmit} style={{ padding: '24px' }}>
              {/* Context Banner */}
              <div style={{
                marginBottom: '18px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 650, color: 'var(--color-accent-bright)', marginBottom: '4px' }}>
                  <Lock style={{ width: '12px', height: '12px' }} />
                  Tenant Bound Provisioning
                </div>
                This user will be provisioned with <strong>End User</strong> privileges strictly under <strong>{orgInfo.name}</strong>. They will only have access to documents within your organization.
              </div>

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

              {/* Target Organization (Read-Only) */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Organization Tenant (Locked)
                </label>
                <div style={{
                  padding: '9px 14px',
                  borderRadius: '9px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 style={{ width: '15px', height: '15px', color: 'var(--color-accent)' }} />
                    <span style={{ fontWeight: 650, color: 'var(--color-text-primary)' }}>{orgInfo.name}</span>
                    {orgInfo.domain && (
                      <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>({orgInfo.domain})</span>
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
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    End User Email Address *
                  </label>
                  {orgInfo.domain && (
                    <button
                      type="button"
                      onClick={handleAppendDomain}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-accent-bright)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
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
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    Temporary Initial Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateSecurePassword())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-cyan, #06b6d4)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                    <Sparkles style={{ width: '11px', height: '11px' }} />
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
                    placeholder="Enter or generate temporary password"
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
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px', display: 'block' }}>
                  Minimum 6 characters. User can change password on first login.
                </span>
              </div>

              {/* Assigned Role (Fixed to End User) */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Assigned Platform Role
                </label>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '9px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles style={{ width: '15px', height: '15px', color: '#10b981' }} />
                    <div>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#10b981' }}>End User</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>— Knowledge Query & Chat Access</span>
                    </div>
                  </div>
                  <span className="badge-pill badge-emerald" style={{ fontSize: '10px' }}>
                    Standard
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="btn-secondary"
                  style={{ fontSize: '13px', padding: '9px 16px' }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{
                    fontSize: '13px',
                    padding: '9px 20px',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Provisioning...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus style={{ width: '15px', height: '15px' }} />
                      <span>Provision End User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: RESET PASSWORD ================= */}
      {resetUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '100%',
            maxWidth: '480px',
            borderRadius: '18px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            border: '1px solid var(--color-border-default)'
          }}>
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-bg-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <KeyRound style={{ width: '18px', height: '18px', color: 'var(--color-accent)' }} />
                <h3 style={{ fontSize: '15.5px', fontWeight: 750, margin: 0, color: 'var(--color-text-primary)' }}>
                  Reset Member Password
                </h3>
              </div>
              <button
                onClick={() => setResetUser(null)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <X style={{ width: '17px', height: '17px' }} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} style={{ padding: '22px' }}>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                Resetting credentials for: <strong style={{ color: 'var(--color-text-primary)' }}>{resetUser.email}</strong>
              </div>

              {resetError && (
                <div style={{
                  marginBottom: '14px',
                  padding: '9px 12px',
                  borderRadius: '9px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  color: '#fb7185',
                  fontSize: '12px'
                }}>
                  {resetError}
                </div>
              )}

              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPasswordInput(generateSecurePassword())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-cyan, #06b6d4)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}>
                    Generate Random
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    value={newPasswordInput}
                    onChange={e => setNewPasswordInput(e.target.value)}
                    className="input-field"
                    style={{ paddingRight: '40px', height: '38px', fontSize: '13px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(p => !p)}
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
                    {showResetPassword ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="btn-secondary"
                  style={{ fontSize: '12.5px', padding: '8px 14px' }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="btn-primary"
                  style={{ fontSize: '12.5px', padding: '8px 18px' }}>
                  {isResetting ? 'Updating...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: DELETE CONFIRMATION ================= */}
      {deleteUserTarget && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '100%',
            maxWidth: '460px',
            borderRadius: '18px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            border: '1px solid rgba(244, 63, 94, 0.3)'
          }}>
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.12)',
                color: '#fb7185',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Trash2 style={{ width: '22px', height: '22px' }} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 750, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>
                Remove End User?
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
                Are you sure you want to remove <strong>{deleteUserTarget.email}</strong> from {orgInfo.name}? This user will permanently lose access to the knowledge base and their chat histories will be removed.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDeleteUserTarget(null)}
                  className="btn-secondary"
                  style={{ fontSize: '13px', padding: '9px 18px' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteUserConfirm}
                  className="btn-danger"
                  style={{ fontSize: '13px', padding: '9px 20px' }}>
                  {isDeleting ? 'Removing...' : 'Yes, Remove User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: CREDENTIAL HANDOVER PACKET ================= */}
      {credentialModalData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '20px'
        }}>
          <div className="card-surface a-in" style={{
            width: '100%',
            maxWidth: '540px',
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            border: '1px solid rgba(16, 185, 129, 0.35)'
          }}>
            {/* Header */}
            <div style={{
              padding: '22px 24px',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)'
                }}>
                  <Check style={{ width: '18px', height: '18px', strokeWidth: 3 }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                    End User Provisioned Successfully
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-emerald)' }}>
                    Ready for client / user handover
                  </span>
                </div>
              </div>
              <button
                onClick={() => setCredentialModalData(null)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {/* Packet Content */}
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
                Share these login credentials with the user to provide them immediate access to <strong>{credentialModalData.organization_name || orgInfo.name}</strong>'s AI workspace:
              </p>

              {/* Credential Card */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--color-border-default)',
                padding: '16px 18px',
                marginBottom: '20px',
                fontFamily: 'monospace',
                fontSize: '12.5px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>ORGANIZATION:</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{credentialModalData.organization_name || orgInfo.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>TENANT DOMAIN:</span>
                  <span style={{ color: 'var(--color-accent-bright)' }}>{credentialModalData.organization_domain || orgInfo.domain || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>EMAIL / USERNAME:</span>
                  <span style={{ fontWeight: 700, color: '#34d399' }}>{credentialModalData.email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>INITIAL PASSWORD:</span>
                  <span style={{ fontWeight: 700, color: '#fbbf24' }}>{credentialModalData.password}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed var(--color-border-subtle)' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>ACCESS ROLE:</span>
                  <span style={{ color: 'var(--color-cyan, #06b6d4)', fontWeight: 650 }}>{credentialModalData.role || 'End User'}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                  User can change this password at any time.
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={handleCopyCredentials}
                    className="btn-primary"
                    style={{
                      fontSize: '12.5px',
                      padding: '8px 16px',
                      background: copiedHandover ? '#10b981' : 'var(--color-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                    {copiedHandover ? (
                      <>
                        <Check style={{ width: '14px', height: '14px' }} />
                        <span>Copied Packet!</span>
                      </>
                    ) : (
                      <>
                        <Copy style={{ width: '14px', height: '14px' }} />
                        <span>Copy Handover Packet</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setCredentialModalData(null)}
                    className="btn-secondary"
                    style={{ fontSize: '12.5px', padding: '8px 14px' }}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

