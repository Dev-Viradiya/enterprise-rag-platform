import { useState, useRef, useCallback, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { 
  Upload, X, CheckCircle2, AlertCircle, Loader2, ChevronDown, 
  FileText, Zap, ShieldCheck, ArrowUpRight, Database, Cpu, 
  Lock, Globe, Sparkles, Building2
} from 'lucide-react';

export default function DocumentUpload({ onUploadComplete }) {
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';
  const [organizations, setOrganizations] = useState([]);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/admin/organizations')
        .then(res => {
          setOrganizations(res.data);
          if (res.data.length > 0) {
            setTargetOrgId(res.data[0]._id);
          }
        })
        .catch(err => console.error(err));
    }
  }, [isSuperAdmin]);

  const addFiles = useCallback((newFiles) => {
    const entries = Array.from(newFiles)
      .filter(f => ['pdf', 'docx', 'txt'].includes(f.name.split('.').pop().toLowerCase()))
      .map(f => ({
        file: f,
        id: `${f.name}-${Date.now()}-${Math.random()}`,
        accessLevel: 'public',
        status: 'pending',
        result: null,
        errorMsg: ''
      }));
    setFiles(prev => [...prev, ...entries]);
  }, []);

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));
  const updateAccess = (id, level) => setFiles(prev => prev.map(f => f.id === id ? { ...f, accessLevel: level } : f));

  const handleUploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length) return;
    setIsUploading(true);
    for (const entry of pending) {
      setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'uploading' } : f));
      const formData = new FormData();
      formData.append('file', entry.file);
      formData.append('access_level', entry.accessLevel);
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

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '36px 32px' }}>
      <div className="a-up">
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
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
              <Upload style={{ width: '20px', height: '20px', color: 'var(--color-accent-bright)' }} />
            </div>
            <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
              Ingest Documents
            </h2>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginLeft: '52px' }}>
            Upload PDF, DOCX, or TXT documents. Files are automatically chunked, transformed into dense embeddings, and indexed into Pinecone for enterprise retrieval.
          </p>
        </div>

        {/* Pipeline Info Architecture Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' }}>
          {[
            { icon: FileText, label: 'Document Parser', desc: 'Text & layout extraction', color: '#38bdf8' },
            { icon: Cpu, label: 'Dense Embedder', desc: 'all-MiniLM-L6-v2 model', color: '#818cf8' },
            { icon: Database, label: 'Pinecone Index', desc: 'Isolated vector storage', color: '#34d399' },
          ].map((step, i) => (
            <div key={i} className="enterprise-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: `${step.color}12`,
                border: `1px solid ${step.color}25`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <step.icon style={{ width: '16px', height: '16px', color: step.color }} />
              </div>
              <div>
                <p style={{ fontSize: '12.5px', fontWeight: 650, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{step.label}</p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Target Organization Selector (Super Admin only) */}
        {isSuperAdmin && (
          <div style={{
            marginBottom: '24px',
            padding: '16px 20px',
            borderRadius: '16px',
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
                  Target Organization Namespace
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Select which client tenant will own this vector knowledge base index
                </span>
              </div>
            </div>
            <select
              value={targetOrgId}
              onChange={e => setTargetOrgId(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                outline: 'none'
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
            borderRadius: '20px',
            padding: '52px 30px',
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
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              margin: '0 auto 18px',
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.18), rgba(6, 182, 212, 0.12))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: isDragOver ? 'scale(1.08)' : 'scale(1)',
              transition: 'transform 0.2s',
              boxShadow: '0 4px 20px rgba(79, 70, 229, 0.2)'
            }}>
              <Upload style={{ width: '28px', height: '28px', color: '#818cf8' }} />
            </div>
            <p style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              {isDragOver ? 'Drop organization files here' : 'Click to select or drag & drop files'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Accepts PDF, DOCX, TXT  •  Multiple file batching  •  Max 50MB per file
            </p>
          </div>
        </div>

        {/* Staged File List */}
        {files.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {files.map(entry => {
                const ext = entry.file.name.split('.').pop().toLowerCase();
                const fb = fileBadges[ext] || fileBadges.txt;
                return (
                  <div
                    key={entry.id}
                    className="enterprise-card a-in"
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      ...(entry.status === 'success' ? { borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.04)' }
                        : entry.status === 'error' ? { borderColor: 'rgba(244, 63, 94, 0.3)', background: 'rgba(244, 63, 94, 0.04)' }
                        : entry.status === 'uploading' ? { borderColor: 'rgba(99, 102, 241, 0.35)', background: 'rgba(99, 102, 241, 0.04)' }
                        : {})
                    }}>
                    {/* Badge */}
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
                      fontSize: '10px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>
                      {entry.status === 'uploading' ? (
                        <Loader2 style={{ width: '16px', height: '16px', color: 'var(--color-accent-bright)', animation: 'spin 1s linear infinite' }} />
                      ) : fb.label}
                    </div>

                    {/* Metadata */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: '13px',
                        fontWeight: 650,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: '3px'
                      }}>
                        {entry.file.name}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        <span>{fSize(entry.file.size)}</span>
                        {entry.status === 'success' && entry.result && (
                          <>
                            <span>•</span>
                            <span style={{ color: '#34d399', fontWeight: 650 }}>
                              ✓ Ingested ({entry.result.chunks_created} vector chunks)
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
                              Chunking & generating vector embeddings...
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Access Level Selector */}
                    {entry.status === 'pending' && (
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <select
                          value={entry.accessLevel}
                          onChange={e => updateAccess(entry.id, e.target.value)}
                          style={{
                            appearance: 'none',
                            padding: '7px 28px 7px 12px',
                            borderRadius: '9px',
                            fontSize: '11.5px',
                            fontWeight: 650,
                            background: '#0d101a',
                            border: '1px solid rgba(255, 255, 255, 0.09)',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            outline: 'none',
                            color: entry.accessLevel === 'public' ? '#34d399' : '#fbbf24'
                          }}>
                          <option value="public">🌐 Public (All)</option>
                          <option value="private">🔒 Restricted (Admin)</option>
                        </select>
                        <ChevronDown style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '12px',
                          height: '12px',
                          color: '#64748b',
                          pointerEvents: 'none'
                        }} />
                      </div>
                    )}

                    {entry.status === 'success' && (
                      <CheckCircle2 style={{ width: '18px', height: '18px', color: '#34d399', flexShrink: 0 }} />
                    )}
                    {entry.status === 'error' && (
                      <AlertCircle style={{ width: '18px', height: '18px', color: '#fb7185', flexShrink: 0 }} />
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
                        <X style={{ width: '15px', height: '15px' }} />
                      </button>
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
                  marginTop: '20px',
                  padding: '14px',
                  borderRadius: '12px',
                  fontSize: '13.5px'
                }}>
                {isUploading ? (
                  <>
                    <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                    <span>Processing & Vectorizing Chunks...</span>
                  </>
                ) : (
                  <>
                    <Upload style={{ width: '16px', height: '16px' }} />
                    <span>Ingest {pendingCount} Document{pendingCount !== 1 ? 's' : ''} to Pinecone</span>
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
                    style={{ flex: 1 }}>
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