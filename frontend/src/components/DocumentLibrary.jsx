import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { 
  FileText, Globe, Lock, Trash2, RefreshCw, Search, Calendar, 
  Layers, User, Database, ShieldCheck, Filter, ArrowUpRight, 
  Sparkles, CheckCircle2, AlertCircle, Building2
} from 'lucide-react';

export default function DocumentLibrary({ isAdmin }) {
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';
  const [documents, setDocuments] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [filterOrg, setFilterOrg] = useState('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAccess, setFilterAccess] = useState('all');
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

  const filtered = documents.filter(d => {
    const matchSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.organization_name && d.organization_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.organization_domain && d.organization_domain.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchAccess = filterAccess === 'all' || d.access_level === filterAccess;
    const matchType = filterType === 'all' || d.file_type === filterType;
    return matchSearch && matchAccess && matchType;
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
    pub: documents.filter(d => d.access_level === 'public').length,
    priv: documents.filter(d => d.access_level === 'private').length,
    chunks: documents.reduce((s, d) => s + (d.chunk_count || 0), 0),
  };

  const statCards = [
    { label: 'Total Ingested', value: stats.total, desc: 'Indexed documents', icon: FileText, color: '#818cf8', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.16)' },
    { label: 'Public Access', value: stats.pub, desc: 'Accessible by all members', icon: Globe, color: '#34d399', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.16)' },
    { label: 'Restricted Tier', value: stats.priv, desc: 'Admin & executive only', icon: Lock, color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.16)' },
    { label: 'Vector Chunks', value: stats.chunks, desc: 'Embeddings in Pinecone', icon: Database, color: '#38bdf8', bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.16)' },
  ];

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '36px 32px' }}>
      <div className="a-up">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(6, 182, 212, 0.1))',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 12px rgba(79, 70, 229, 0.2)'
              }}>
                <FileText style={{ width: '20px', height: '20px', color: '#818cf8' }} />
              </div>
              <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
                Document Library
              </h2>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginLeft: '52px' }}>
              {isSuperAdmin
                ? 'Central Platform Master View: Browse, inspect, and govern documents indexed across all client organizations in Pinecone.'
                : isAdmin
                ? 'Manage, inspect, and enforce governance over organization documents in Pinecone.'
                : 'Browse indexed knowledge base documents authorized for your organizational role.'}
            </p>
          </div>

          <button
            onClick={() => fetchDocuments()}
            className="btn-secondary"
            style={{ padding: '9px 14px' }}>
            <RefreshCw style={{ width: '14px', height: '14px', ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
            <span>Sync Index</span>
          </button>
        </div>

        {/* Executive Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '32px' }}>
          {statCards.map((s, i) => (
            <div key={i} className="enterprise-card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {s.label}
                </span>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <s.icon style={{ width: '15px', height: '15px', color: s.color }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                {s.value}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Search & Multi-Filters Toolbar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Organization Filter Dropdown (Super Admin only) */}
          {isSuperAdmin && (
            <div style={{ minWidth: '220px' }}>
              <select
                value={filterOrg}
                onChange={e => handleOrgFilterChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-default)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 650,
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  boxShadow: 'var(--card-shadow)',
                  outline: 'none'
                }}>
                <option value="all">🏢 All Organizations ({organizations.length})</option>
                {organizations.map(org => (
                  <option key={org._id} value={org._id}>
                    {org.name} ({org.domain})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div style={{ flex: 1, position: 'relative', minWidth: '240px' }}>
            <Search style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '15px',
              height: '15px',
              color: 'var(--color-text-muted)'
            }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search document names or keywords..."
              style={{
                width: '100%',
                padding: '12px 16px 12px 42px',
                borderRadius: '12px',
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-default)',
                fontFamily: 'inherit',
                fontSize: '13.5px',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxShadow: 'var(--card-shadow)',
                transition: 'border-color 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--color-border-default)'}
            />
          </div>

          {/* Access Filter Pills */}
          <div style={{
            display: 'flex',
            gap: '4px',
            padding: '3px',
            borderRadius: '12px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-default)',
            boxShadow: 'var(--card-shadow)'
          }}>
            {[
              { id: 'all', label: 'All Access' },
              { id: 'public', label: 'Public' },
              { id: 'private', label: 'Restricted' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterAccess(f.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '9px',
                  fontSize: '12px',
                  fontWeight: 650,
                  fontFamily: 'inherit',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  color: filterAccess === f.id ? (f.id === 'all' ? 'var(--color-accent-bright)' : f.id === 'public' ? 'var(--color-emerald)' : 'var(--color-amber)') : 'var(--color-text-secondary)',
                  background: filterAccess === f.id ? 'var(--color-bg-hover)' : 'transparent'
                }}>
                {f.label}
              </button>
            ))}
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
                  padding: '8px 12px',
                  borderRadius: '9px',
                  fontSize: '12px',
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
              <div key={i} style={{ height: '76px', borderRadius: '14px', background: '#111422', border: '1px solid rgba(255,255,255,0.05)' }} />
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
                : 'Try clearing your search query or switching access filter tabs.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((doc, idx) => {
              const fb = fileBadges[doc.file_type] || fileBadges.txt;
              return (
                <div
                  key={doc._id}
                  className="enterprise-card group a-in"
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
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
                    flexShrink: 0
                  }}>
                    {fb.label}
                  </div>

                  {/* Document Meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 650,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {doc.title}
                      </span>
                      <span className={`badge-pill ${doc.access_level === 'public' ? 'badge-emerald' : 'badge-amber'}`}>
                        {doc.access_level === 'public' ? <Globe style={{ width: '10px', height: '10px' }} /> : <Lock style={{ width: '10px', height: '10px' }} />}
                        {doc.access_level === 'public' ? 'Public' : 'Restricted'}
                      </span>
                      {doc.organization_name && (
                        <span className="badge-pill badge-indigo" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Building2 style={{ width: '10px', height: '10px' }} />
                          {doc.organization_name}
                        </span>
                      )}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      fontSize: '11.5px',
                      color: 'var(--color-text-tertiary)'
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
                        color: '#64748b',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.2)';
                        e.currentTarget.style.color = '#fb7185';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'none';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.color = '#64748b';
                      }}
                      title="Delete from knowledge base">
                      {deletingId === doc._id ? (
                        <RefreshCw style={{ width: '15px', height: '15px', animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Trash2 style={{ width: '15px', height: '15px' }} />
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
