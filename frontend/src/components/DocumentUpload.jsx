import { useState, useRef, useCallback, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { 
  Upload, X, CheckCircle2, AlertCircle, Loader2, ChevronDown, 
  FileText, Zap, ShieldCheck, ArrowUpRight, Database, Cpu, 
  Lock, Globe, Sparkles, Building2, CheckSquare, Square, Users,
  SlidersHorizontal, Info, Plus
} from 'lucide-react';

const BASE_ROLE_COLORS = {
  org_admin: { label: 'Org Admin', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)' },
  end_user: { label: 'End User', color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.3)' },
};

const DYNAMIC_PALETTE = [
  { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' },
  { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)' },
  { color: '#fb7185', bg: 'rgba(251, 113, 133, 0.12)', border: 'rgba(251, 113, 133, 0.3)' },
  { color: '#818cf8', bg: 'rgba(129, 140, 248, 0.12)', border: 'rgba(129, 140, 248, 0.3)' },
  { color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.12)', border: 'rgba(45, 212, 191, 0.3)' },
  { color: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)', border: 'rgba(244, 114, 182, 0.3)' },
];

const getRoleBadge = (role) => {
  if (BASE_ROLE_COLORS[role]) return BASE_ROLE_COLORS[role];
  let hash = 0;
  for (let i = 0; i < (role || '').length; i++) {
    hash = role.charCodeAt(i) + ((hash << 5) - hash);
  }
  const theme = DYNAMIC_PALETTE[Math.abs(hash) % DYNAMIC_PALETTE.length];
  return {
    label: role ? role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Member',
    ...theme
  };
};

export default function DocumentUpload({ onUploadComplete }) {
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';
  const [organizations, setOrganizations] = useState([]);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [availableRoles, setAvailableRoles] = useState(['org_admin', 'end_user']);
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingCustomRole, setIsAddingCustomRole] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const fileInputRef = useRef(null);

  const fetchOrgRoles = useCallback(async (orgId) => {
    if (!orgId) return;
    try {
      const res = await api.get(`/admin/organizations/${orgId}/roles`);
      if (res.data?.roles && Array.isArray(res.data.roles) && res.data.roles.length > 0) {
        setAvailableRoles(res.data.roles);
        setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, allowedRoles: [...res.data.roles] } : f));
      }
    } catch (err) {
      console.error('Failed to fetch org roles:', err);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/admin/organizations')
        .then(async res => {
          setOrganizations(res.data || []);
          if (res.data && res.data.length > 0) {
            const firstOrgId = res.data[0]._id;
            setTargetOrgId(firstOrgId);
            try {
              const rolesRes = await api.get(`/admin/organizations/${firstOrgId}/roles`);
              if (rolesRes.data?.roles && Array.isArray(rolesRes.data.roles) && rolesRes.data.roles.length > 0) {
                setAvailableRoles(rolesRes.data.roles);
              }
            } catch {}
          }
        })
        .catch(err => console.error(err));
    } else {
      api.get('/admin/org/roles')
        .then(res => {
          if (res.data?.roles && Array.isArray(res.data.roles) && res.data.roles.length > 0) {
            setAvailableRoles(res.data.roles);
          }
        })
        .catch(err => console.error(err));
    }
  }, [isSuperAdmin]);

  const handleTargetOrgChange = (newOrgId) => {
    setTargetOrgId(newOrgId);
    fetchOrgRoles(newOrgId);
  };

  const handleAddCustomRole = async () => {
    const clean = newRoleInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!clean || clean.length < 2) return;
    setIsCreatingRole(true);
    try {
      const url = isSuperAdmin && targetOrgId ? `/admin/organizations/${targetOrgId}/roles` : '/admin/org/roles';
      const res = await api.post(url, { role_name: clean });
      if (res.data?.roles) {
        setAvailableRoles(res.data.roles);
        setFiles(prev => prev.map(f => {
          if (f.status === 'pending') {
            const cur = f.allowedRoles || [];
            return { ...f, allowedRoles: cur.includes(clean) ? cur : [...cur, clean] };
          }
          return f;
        }));
      }
      setNewRoleInput('');
      setIsAddingCustomRole(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add role');
    } finally {
      setIsCreatingRole(false);
    }
  };

  const addFiles = useCallback((newFiles) => {
    const entries = Array.from(newFiles)
      .filter(f => ['pdf', 'docx', 'txt'].includes(f.name.split('.').pop().toLowerCase()))
      .map(f => ({
        file: f,
        id: `${f.name}-${Date.now()}-${Math.random()}`,
        allowedRoles: availableRoles.length > 0 ? [...availableRoles] : ['org_admin', 'end_user'],
        status: 'pending',
        result: null,
        errorMsg: ''
      }));
    setFiles(prev => [...prev, ...entries]);
  }, [availableRoles]);

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));

  const toggleRoleForFile = (fileId, role) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      const current = f.allowedRoles || [];
      const updated = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role];
      return { ...f, allowedRoles: updated };
    }));
  };

  const selectAllRolesForFile = (fileId) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, allowedRoles: [...availableRoles] } : f));
  };

  const setAdminOnlyForFile = (fileId) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, allowedRoles: ['org_admin'] } : f));
  };

  const batchApplyRoles = (rolesToApply) => {
    setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, allowedRoles: [...rolesToApply] } : f));
  };

  const handleUploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length) return;
    setIsUploading(true);
    for (const entry of pending) {
      setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'uploading' } : f));
      const formData = new FormData();
      formData.append('file', entry.file);
      formData.append('allowed_roles', JSON.stringify(entry.allowedRoles || ['org_admin', 'end_user']));
      if (isSuperAdmin && targetOrgId) {
        formData.append('target_org_id', targetOrgId);
      }
      try {
        const res = await api.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'success', result: res.data } : f));
      } catch (err) {
        setFiles(prev => prev.map(f => f.id === entry.id ? {
          ...f,
          status: 'error',
          errorMsg: err.response?.data?.detail || err.message || 'Upload failed'
        } : f));
      }
    }
    setIsUploading(false);
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  const fileBadges = {
    pdf: { label: 'PDF', color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.2)' },
    docx: { label: 'DOCX', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.2)' },
    txt: { label: 'TXT', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.2)' },
  };

  const fSize = (b) => {
    if (!b) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  const currentOrg = organizations.find(o => o._id === targetOrgId);

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 28px' }}>
      <div className="a-up">
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(6, 182, 212, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 12px rgba(79, 70, 229, 0.2)'
            }}>
              <Upload style={{ width: '22px', height: '22px', color: 'var(--color-accent-bright)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
                Ingest Documents with Role Access Control
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Upload files and check which organization roles can get answers from them in the chatbot.
              </p>
            </div>
          </div>
        </div>

        {/* Target Organization Selector (Super Admin) - Prominently Displayed at Top */}
        {isSuperAdmin && organizations.length > 0 && (
          <div style={{
            marginBottom: '20px',
            padding: '16px 20px',
            borderRadius: '14px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Building2 style={{ width: '18px', height: '18px', color: 'var(--color-accent)' }} />
              </div>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'block' }}>
                  Target Organization Tenant:
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Selected: <strong style={{ color: 'var(--color-accent-bright)' }}>{currentOrg ? `${currentOrg.name} (${currentOrg.domain})` : 'Select Organization'}</strong>
                  {' • '}{availableRoles.length} available role{availableRoles.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <select
              value={targetOrgId}
              onChange={e => handleTargetOrgChange(e.target.value)}
              className="input-field"
              style={{
                padding: '9px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                minWidth: '240px'
              }}>
              {organizations.map(org => (
                <option key={org._id} value={org._id}>
                  {org.name} ({org.domain})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragOver(false); }}
          onDrop={e => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            borderRadius: '18px',
            padding: '44px 28px',
            textAlign: 'center',
            cursor: 'pointer',
            border: `2px dashed ${isDragOver ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
            background: isDragOver ? 'var(--color-accent-soft)' : 'var(--color-bg-card)',
            boxShadow: isDragOver ? '0 0 40px rgba(99, 102, 241, 0.15)' : 'var(--card-shadow)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            style={{ display: 'none' }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '18px',
              margin: '0 auto 14px',
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.18), rgba(6, 182, 212, 0.12))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: isDragOver ? 'scale(1.08)' : 'scale(1)',
              transition: 'transform 0.2s',
              boxShadow: '0 4px 20px rgba(79, 70, 229, 0.2)'
            }}>
              <Upload style={{ width: '26px', height: '26px', color: '#818cf8' }} />
            </div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '5px' }}>
              {isDragOver ? 'Drop files here' : 'Click to select or drag & drop files'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Supports PDF, DOCX, TXT  •  Granular role security checklist per file
            </p>
          </div>
        </div>

        {/* Staged File List */}
        {files.length > 0 && (
          <div style={{ marginTop: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Staged Files ({files.length})
                </h3>
                {successCount > 0 && (
                  <span className="badge-pill badge-emerald">✓ {successCount} Ingested</span>
                )}
                {errorCount > 0 && (
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: 'rgba(244, 63, 94, 0.1)',
                    color: 'var(--color-rose)',
                    border: '1px solid rgba(244, 63, 94, 0.2)'
                  }}>
                    ✗ {errorCount} Failed
                  </span>
                )}
              </div>

              {pendingCount > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Batch Apply:</span>
                  <button
                    type="button"
                    onClick={() => batchApplyRoles([...availableRoles])}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '7px' }}>
                    All Roles
                  </button>
                  <button
                    type="button"
                    onClick={() => batchApplyRoles(['org_admin'])}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '7px' }}>
                    Admin Only
                  </button>
                </div>
              )}

              {pendingCount > 0 && (
                <button
                  onClick={() => setFiles(prev => prev.filter(f => f.status !== 'pending'))}
                  style={{
                    fontSize: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--color-rose)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}>
                  Clear Pending
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {files.map(entry => {
                const ext = entry.file.name.split('.').pop().toLowerCase();
                const fb = fileBadges[ext] || fileBadges.txt;
                const allowedRoles = entry.allowedRoles || [];
                const noneSelected = allowedRoles.length === 0;

                return (
                  <div
                    key={entry.id}
                    className="enterprise-card a-in"
                    style={{
                      padding: '16px 20px',
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      ...(entry.status === 'success' ? { borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.04)' }
                        : entry.status === 'error' ? { borderColor: 'rgba(244, 63, 94, 0.3)', background: 'rgba(244, 63, 94, 0.04)' }
                        : entry.status === 'uploading' ? { borderColor: 'rgba(99, 102, 241, 0.35)', background: 'rgba(99, 102, 241, 0.04)' }
                        : {})
                    }}>
                    
                    {/* Top Row: File Icon, Name, Size & Status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: fb.bg,
                        border: `1px solid ${fb.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: fb.color,
                        fontSize: '11px',
                        fontWeight: 800,
                        flexShrink: 0
                      }}>
                        {entry.status === 'uploading' ? (
                          <Loader2 style={{ width: '18px', height: '18px', color: 'var(--color-accent-bright)', animation: 'spin 1s linear infinite' }} />
                        ) : fb.label}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: '2px'
                        }}>
                          {entry.file.name}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                          <span>{fSize(entry.file.size)}</span>
                          {entry.status === 'success' && entry.result && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#34d399', fontWeight: 650 }}>
                                ✓ Ingested ({entry.result.chunks_created} chunks in Pinecone)
                              </span>
                            </>
                          )}
                          {entry.status === 'error' && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#fb7185' }}>{entry.errorMsg}</span>
                            </>
                          )}
                          {entry.status === 'uploading' && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#818cf8', fontWeight: 550 }}>
                                Vectorizing chunks into Pinecone...
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {entry.status === 'success' && (
                        <CheckCircle2 style={{ width: '20px', height: '20px', color: '#34d399', flexShrink: 0 }} />
                      )}
                      {entry.status === 'error' && (
                        <AlertCircle style={{ width: '20px', height: '20px', color: '#fb7185', flexShrink: 0 }} />
                      )}

                      {entry.status === 'pending' && (
                        <button
                          onClick={() => removeFile(entry.id)}
                          style={{
                            padding: '6px',
                            borderRadius: '8px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            transition: 'color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = '#fb7185'}
                          onMouseLeave={e => e.currentTarget.style.color = '#64748b'}>
                          <X style={{ width: '16px', height: '16px' }} />
                        </button>
                      )}
                    </div>

                    {/* Bottom Row: Checklist of Available User Roles */}
                    {entry.status === 'pending' && (
                      <div style={{
                        marginTop: '2px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldCheck style={{ width: '14px', height: '14px', color: 'var(--color-accent)' }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              Chatbot Answering Access Checklist:
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                              (Checked roles will get answers from this document)
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => selectAllRolesForFile(entry.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-accent-bright)',
                                fontSize: '11px',
                                fontWeight: 650,
                                cursor: 'pointer',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                              Select All
                            </button>
                            <span style={{ color: 'var(--color-border-strong)' }}>|</span>
                            <button
                              type="button"
                              onClick={() => setAdminOnlyForFile(entry.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-text-secondary)',
                                fontSize: '11px',
                                fontWeight: 650,
                                cursor: 'pointer',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                              Admin Only
                            </button>
                            <span style={{ color: 'var(--color-border-strong)' }}>|</span>
                            <button
                              type="button"
                              onClick={() => setIsAddingCustomRole(!isAddingCustomRole)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-cyan)',
                                fontSize: '11px',
                                fontWeight: 650,
                                cursor: 'pointer',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                              <Plus style={{ width: '11px', height: '11px' }} />
                              <span>Add Role</span>
                            </button>
                          </div>
                        </div>

                        {/* Inline Add Custom Role Input */}
                        {isAddingCustomRole && (
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <input
                              type="text"
                              placeholder="e.g. developer, doctor, analyst, accountant"
                              value={newRoleInput}
                              onChange={e => setNewRoleInput(e.target.value)}
                              className="input-field"
                              style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: '7px' }}
                            />
                            <button
                              type="button"
                              onClick={handleAddCustomRole}
                              disabled={isCreatingRole || !newRoleInput.trim()}
                              className="btn-primary"
                              style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '7px' }}>
                              {isCreatingRole ? 'Adding...' : 'Save Role'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setIsAddingCustomRole(false); setNewRoleInput(''); }}
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '11.5px', borderRadius: '7px' }}>
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* Interactive Role Checkbox Chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {availableRoles.map(role => {
                            const isChecked = allowedRoles.includes(role);
                            const badge = getRoleBadge(role);
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => toggleRoleForFile(entry.id, role)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 12px',
                                  borderRadius: '9999px',
                                  fontSize: '11.5px',
                                  fontWeight: 650,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  background: isChecked ? badge.bg : 'transparent',
                                  color: isChecked ? badge.color : 'var(--color-text-tertiary)',
                                  border: `1px solid ${isChecked ? badge.border : 'var(--color-border-default)'}`,
                                  boxShadow: isChecked ? `0 0 10px ${badge.bg}` : 'none'
                                }}>
                                {isChecked ? (
                                  <CheckSquare style={{ width: '13px', height: '13px', color: badge.color }} />
                                ) : (
                                  <Square style={{ width: '13px', height: '13px', color: 'var(--color-text-tertiary)' }} />
                                )}
                                <span>{badge.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {noneSelected && (
                          <p style={{ fontSize: '11px', color: '#fb7185', marginTop: '8px', fontWeight: 600 }}>
                            ⚠️ Warning: No roles selected. Only Central Platform Admin will be able to retrieve answers from this document.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ingestion Trigger Button */}
            {pendingCount > 0 && (
              <button
                onClick={handleUploadAll}
                disabled={isUploading}
                className="btn-primary"
                style={{
                  width: '100%',
                  marginTop: '22px',
                  padding: '14px',
                  borderRadius: '12px',
                  fontSize: '13.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                {isUploading ? (
                  <>
                    <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                    <span>Vectorizing & Securing Document Chunks in Pinecone...</span>
                  </>
                ) : (
                  <>
                    <Upload style={{ width: '18px', height: '18px' }} />
                    <span>Ingest {pendingCount} Document{pendingCount !== 1 ? 's' : ''} with Role Permissions</span>
                  </>
                )}
              </button>
            )}

            {files.length > 0 && pendingCount === 0 && !isUploading && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button
                  onClick={() => setFiles([])}
                  className="btn-secondary"
                  style={{ flex: 1 }}>
                  Clear Completed
                </button>
                {onUploadComplete && (
                  <button
                    onClick={onUploadComplete}
                    className="btn-primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span>View Ingested Documents</span>
                    <ArrowUpRight style={{ width: '14px', height: '14px' }} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
