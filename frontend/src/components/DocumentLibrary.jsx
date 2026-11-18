import { useState, useEffect, useContext, useMemo } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { 
  FileText, Globe, Lock, Trash2, RefreshCw, Search, Calendar, 
  Layers, User, Database, ShieldCheck, Filter, ArrowUpRight, 
  Sparkles, CheckCircle2, AlertCircle, Building2, Users
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

export default function DocumentLibrary({ isAdmin }) {
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';
  const [documents, setDocuments] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [filterOrg, setFilterOrg] = useState('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchDocuments();
    if (isSuperAdmin) {
      api.get('/admin/organizations')
        .then(res => setOrganizations(res.data))
        .catch(err => console.error(err));
    }
  }, [isSuperAdmin]);

  const fetchDocuments = async (orgOverride) => {
    setLoading(true);
    try {
      const targetOrg = (typeof orgOverride === 'string') ? orgOverride : filterOrg;
      const params = (isSuperAdmin && targetOrg && targetOrg !== 'all') ? { organization_id: targetOrg } : {};
      const res = await api.get('/documents/list', { params });
      setDocuments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOrgFilterChange = (orgId) => {
    setFilterOrg(orgId);
    fetchDocuments(orgId);
  };

  const deleteDocument = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document from the vector index?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/documents/${id}`);
      setDocuments(prev => prev.filter(d => d._id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  // Collect distinct roles present across loaded documents
  const allDocumentRoles = useMemo(() => {
    const roleSet = new Set();
    documents.forEach(d => {
      if (Array.isArray(d.allowed_roles)) {
        d.allowed_roles.forEach(r => roleSet.add(r));
      }
    });
    return Array.from(roleSet);
  }, [documents]);

  const filtered = documents.filter(d => {
    const matchSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.organization_name && d.organization_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.organization_domain && d.organization_domain.toLowerCase().includes(searchQuery.toLowerCase()));
    
    let matchRole = true;
    if (filterRole !== 'all') {
      const docRoles = d.allowed_roles || (d.access_level === 'private' ? ['org_admin'] : ['org_admin', 'end_user']);
      matchRole = docRoles.includes(filterRole);
    }

    const matchType = filterType === 'all' || d.file_type === filterType;
    return matchSearch && matchRole && matchType;
  });

  const fmtDate = (s) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtSize = (b) => {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  const fileBadges = {
    pdf: { label: 'PDF', color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.2)' },
    docx: { label: 'DOCX', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.2)' },
    txt: { label: 'TXT', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.2)' },
  };

  const stats = {
    total: documents.length,
    chunks: documents.reduce((s, d) => s + (d.chunk_count || 0), 0),
    allRolesCount: documents.filter(d => (d.allowed_roles || []).length >= 3).length,
    restrictedCount: documents.filter(d => (d.allowed_roles || []).length <= 2).length,
  };

  const statCards = [
    { label: 'Total Ingested', value: stats.total, desc: 'Indexed documents', icon: FileText, color: '#818cf8', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.16)' },
    { label: 'Broad Access', value: stats.allRolesCount, desc: 'Accessible to multiple roles', icon: Globe, color: '#34d399', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.16)' },
    { label: 'Role Restricted', value: stats.restrictedCount, desc: 'Scoped to specific roles', icon: Lock, color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.16)' },
    { label: 'Vector Chunks', value: stats.chunks, desc: 'Embeddings in Pinecone', icon: Database, color: '#38bdf8', bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.16)' },
  ];

  return (
    <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '36px 32px' }}>
      <div className="a-up">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
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
                <FileText style={{ width: '22px', height: '22px', color: '#818cf8' }} />
              </div>
              <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
                Document Library
              </h2>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', marginLeft: '54px' }}>
              Inspect vectorized knowledge base files, active Pinecone chunks, and granular role permissions.
            </p>
          </div>

          <button
            onClick={() => fetchDocuments()}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Refresh document records">
            <RefreshCw style={{ width: '14px', height: '14px', ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Analytics Counter Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
          {statCards.map((sc, i) => (
            <div key={i} className="enterprise-card" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                background: `linear-gradient(90deg, transparent, ${sc.color}, transparent)`
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-text-secondary)' }}>{sc.label}</span>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  background: sc.bg,
                  border: `1px solid ${sc.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <sc.icon style={{ width: '15px', height: '15px', color: sc.color }} />
                </div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)', marginBottom: '3px' }}>
                {sc.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{sc.desc}</div>
            </div>
          ))}
        </div>

        {/* Super Admin Tenant Switcher */}
        {isSuperAdmin && organizations.length > 0 && (
          <div style={{
            marginBottom: '20px',
            padding: '14px 18px',
            borderRadius: '14px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 style={{ width: '16px', height: '16px', color: 'var(--color-accent)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Tenant Filter (Super Admin):
              </span>
            </div>
            <select
              value={filterOrg}
              onChange={e => handleOrgFilterChange(e.target.value)}
              className="input-field"
              style={{
                padding: '8px 14px',
                borderRadius: '9px',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer'
              }}>
              <option value="all">🏢 All Client Tenants (Cross-Platform)</option>
              {organizations.map(org => (
                <option key={org._id} value={org._id}>
                  {org.name} ({org.domain})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Toolbar: Search & Role / Format Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Input */}
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '15px',
              height: '15px',
              color: 'var(--color-text-tertiary)',
              pointerEvents: 'none'
            }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search documents by title, tenant name, or domain..."
              className="input-field"
              style={{
                width: '100%',
                paddingLeft: '40px',
                paddingRight: '14px',
                paddingTop: '10px',
                paddingBottom: '10px',
                borderRadius: '12px',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Role Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users style={{ width: '15px', height: '15px', color: 'var(--color-text-tertiary)' }} />
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="input-field"
              style={{
                padding: '9px 14px',
                borderRadius: '11px',
                fontSize: '12px',
                fontWeight: 650,
                cursor: 'pointer'
              }}>
              <option value="all">All Roles</option>
              {allDocumentRoles.map(r => (
                <option key={r} value={r}>Role: {r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Format Filter Pills */}
          <div style={{
            display: 'flex',
            gap: '4px',
            padding: '3px',
            borderRadius: '12px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-default)',
            boxShadow: 'var(--card-shadow)'
          }}>
            {['all', 'pdf', 'docx', 'txt'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '9px',
                  fontSize: '11.5px',
                  fontWeight: 650,
                  fontFamily: 'inherit',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  transition: 'all 0.15s ease',
                  color: filterType === t ? 'var(--color-cyan)' : 'var(--color-text-secondary)',
                  background: filterType === t ? 'var(--color-bg-hover)' : 'transparent'
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Document Items List */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '84px', borderRadius: '14px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-default)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="enterprise-card" style={{
            textAlign: 'center',
            padding: '64px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <FileText style={{ width: '24px', height: '24px', color: '#818cf8' }} />
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 650, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              {documents.length === 0 ? 'No documents ingested yet' : 'No documents match filter criteria'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '360px', lineHeight: 1.5 }}>
              {documents.length === 0
                ? 'Upload your first organization documents to populate the Pinecone vector index.'
                : 'Try clearing your search query or switching role filter.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map((doc, idx) => {
              const fb = fileBadges[doc.file_type] || fileBadges.txt;
              const docRoles = doc.allowed_roles || (doc.access_level === 'private' ? ['org_admin'] : ['org_admin', 'end_user']);
              
              return (
                <div
                  key={doc._id}
                  className="enterprise-card group a-in"
                  style={{
                    padding: '18px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    animationDelay: `${Math.min(idx * 0.03, 0.3)}s`
                  }}>
                  {/* File Badge */}
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '11px',
                    background: fb.bg,
                    border: `1px solid ${fb.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: fb.color,
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    {fb.label}
                  </div>

                  {/* Document Meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {doc.title}
                      </span>

                      {doc.organization_name && (
                        <span className="badge-pill badge-indigo" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Building2 style={{ width: '10px', height: '10px' }} />
                          {doc.organization_name}
                        </span>
                      )}
                    </div>

                    {/* Allowed Role Badges Checklist Display */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                        Chatbot Access:
                      </span>
                      {docRoles.map(role => {
                        const badge = getRoleBadge(role);
                        return (
                          <span
                            key={role}
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                            ✓ {badge.label}
                          </span>
                        );
                      })}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      fontSize: '11.5px',
                      color: 'var(--color-text-tertiary)',
                      flexWrap: 'wrap'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Layers style={{ width: '12px', height: '12px', color: '#818cf8' }} />
                        {doc.chunk_count || 0} vector chunks
                      </span>
                      <span>•</span>
                      <span>{fmtSize(doc.file_size)}</span>
                      <span>•</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar style={{ width: '12px', height: '12px' }} />
                        {fmtDate(doc.created_at)}
                      </span>
                      {doc.uploaded_by_email && (
                        <>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User style={{ width: '12px', height: '12px' }} />
                            {doc.uploaded_by_email.split('@')[0]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <button
                      onClick={() => deleteDocument(doc._id)}
                      disabled={deletingId === doc._id}
                      style={{
                        padding: '8px',
                        borderRadius: '9px',
                        background: 'none',
                        border: '1px solid transparent',
                        cursor: 'pointer',
                        color: 'var(--color-text-tertiary)',
                        transition: 'all 0.15s',
                        flexShrink: 0
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.2)';
                        e.currentTarget.style.color = '#fb7185';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'none';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      }}
                      title="Delete from knowledge base">
                      {deletingId === doc._id ? (
                        <RefreshCw style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
