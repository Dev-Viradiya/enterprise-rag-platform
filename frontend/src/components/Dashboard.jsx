import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import DocumentUpload from './DocumentUpload';
import DocumentLibrary from './DocumentLibrary';
import CentralAdmin from './CentralAdmin';
import OrgUserManagement from './OrgUserManagement';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Send, PanelLeftClose, PanelLeft, Sparkles, LogOut, FileText,
  MessagesSquare, Trash2, Bot, User, Upload, ChevronDown, Plus,
  Copy, Check, Clock, ShieldCheck, Zap, Database, Cpu, ThumbsUp,
  ThumbsDown, RotateCcw, Building2, CheckCircle2, Search, Users
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

/* ===== COPY BUTTON COMPONENT ===== */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="code-copy-btn">
      {copied ? (
        <>
          <Check style={{ width: '12px', height: '12px', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          Copied
        </>
      ) : (
        <>
          <Copy style={{ width: '12px', height: '12px', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          Copy
        </>
      )}
    </button>
  );
}

/* ===== CUSTOM MARKDOWN RENDERERS ===== */
const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    
    if (!inline && (match || codeString.includes('\n'))) {
      const lang = match ? match[1] : 'text';
      return (
        <div style={{
          position: 'relative',
          margin: '1.2em 0',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          <div className="code-header">
            <span>{lang}</span>
            <CopyButton text={codeString} />
          </div>
          <SyntaxHighlighter
            style={oneDark}
            language={lang}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: '16px 20px',
              background: '#090b11',
              fontSize: '0.84em',
              lineHeight: 1.65,
              borderRadius: 0,
            }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      );
    }
    return <code className="ai-inline-code" {...props}>{children}</code>;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  table({ children, ...props }) {
    return (
      <div className="ai-table-container">
        <table className="ai-table" {...props}>
          {children}
        </table>
      </div>
    );
  },
  th({ children, ...props }) {
    return <th className="ai-th" {...props}>{children}</th>;
  },
  td({ children, ...props }) {
    return <td className="ai-td" {...props}>{children}</td>;
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote className="ai-blockquote" {...props}>
        {children}
      </blockquote>
    );
  },
  h1: ({ children, ...props }) => <h1 className="ai-h1" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 className="ai-h2" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 className="ai-h3" {...props}>{children}</h3>,
  ul: ({ children, ...props }) => <ul className="ai-ul" {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol className="ai-ol" {...props}>{children}</ol>,
  li: ({ children, ...props }) => <li className="ai-li" {...props}>{children}</li>,
  strong: ({ children, ...props }) => <strong className="ai-strong" {...props}>{children}</strong>,
  p: ({ children, ...props }) => <p className="ai-p" {...props}>{children}</p>,
};

/* ===== ENHANCED MARKDOWN NORMALIZER & TABLE SANITIZER ===== */
function normalizeMarkdown(text) {
  if (!text) return '';

  // Preserve code blocks safely without altering their contents
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part) => {
    if (part.startsWith('```')) {
      return part;
    }

    let s = part;

    // 1. Convert double pipes (||) used between joined table rows into actual row breaks
    s = s.replace(/\|\s*\|+\s*/g, '|\n| ');

    // 2. Ensure clear spacing before headings (e.g. "### Header")
    s = s.replace(/([^\n])\n*(#{1,6}\s+[^\n]+)/g, '$1\n\n$2\n');

    // 3. Ensure bullet items start on fresh lines
    s = s.replace(/([^\n])\n*([*-]\s+\*\*)/g, '$1\n$2');
    s = s.replace(/([^\n])\n*(\d+\.\s+)/g, '$1\n$2');

    // 4. Ensure blockquotes have proper spacing
    s = s.replace(/([^\n])\n*(>\s+)/g, '$1\n\n$2');

    // 5. Ensure proper blank lines around tables so remark-gfm parses them seamlessly
    const lines = s.split('\n');
    const result = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length >= 2;

      if (isTableRow) {
        if (!inTable) {
          inTable = true;
          // Ensure empty line before table starts
          if (result.length > 0 && result[result.length - 1].trim() !== '') {
            result.push('');
          }
        }
        result.push(line);

        // If next line is another row but there's no separator row at all in the 2-row table
        if (!trimmed.includes('---')) {
          const nextTrimmed = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
          const nextIsRow = nextTrimmed.startsWith('|') && nextTrimmed.endsWith('|');
          if (nextIsRow && !nextTrimmed.includes('---')) {
            // Check if this was the header row (previous line wasn't table row)
            const prevTrimmed = (result.length >= 2) ? result[result.length - 2].trim() : '';
            if (!prevTrimmed.startsWith('|')) {
              // Auto inject separator
              const cols = trimmed.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
              const colCount = Math.max(1, cols.length);
              result.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
            }
          }
        }
      } else {
        if (inTable) {
          inTable = false;
          // Ensure empty line after table ends
          if (trimmed !== '') {
            result.push('');
          }
        }
        result.push(line);
      }
    }

    return result.join('\n');
  }).join('');
}

export default function Dashboard() {
  const { user, logout } = useContext(AuthContext);
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'org_admin' || isSuperAdmin;
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? 'central_admin' : 'chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const [availableOrgs, setAvailableOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('all');

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/admin/organizations').then(res => {
        setAvailableOrgs(res.data || []);
      }).catch(() => {});
    }
  }, [isSuperAdmin]);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const isStreamingRef = useRef(false);

  const orgDomain = user?.email?.split('@')[1]?.toUpperCase() || 'ORGANIZATION';
  const userName = user?.email?.split('@')[0] || 'User';

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { loadConvs(); }, []);
  const loadConvs = async () => {
    try { setConversations((await api.get('/chat/conversations')).data); }
    catch {} finally { setLoadingConvs(false); }
  };

  useEffect(() => {
    if (activeConversationId) {
      if (!isStreamingRef.current) {
        loadMsgs(activeConversationId);
      }
    } else {
      if (!isStreamingRef.current) {
        setChatHistory([]);
      }
    }
  }, [activeConversationId]);

  const loadMsgs = async (id) => {
    try { setChatHistory((await api.get(`/chat/conversations/${id}/messages`)).data); } catch {}
  };

  const scroll = useCallback(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
  useEffect(() => { scroll(); }, [chatHistory, scroll]);

  const newChat = () => {
    setActiveConversationId(null);
    setChatHistory([]);
    setActiveTab('chat');
    inputRef.current?.focus();
  };

  const delConv = async (e, id) => {
    e.stopPropagation();
    try {
      await api.delete(`/chat/conversations/${id}`);
      setConversations(p => p.filter(c => c._id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setChatHistory([]);
      }
    } catch {}
  };

  const copyMsg = (content, idx) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  };

  const handleFeedback = (idx, type) => {
    setFeedbackGiven(prev => ({ ...prev, [idx]: type }));
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;
    const msg = { role: 'user', content: query };
    setChatHistory(p => [...p, msg, { role: 'ai', content: '' }]);
    setQuery('');
    setIsLoading(true);
    isStreamingRef.current = true;
    try {
      const r = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          query: msg.content,
          conversation_id: activeConversationId,
          target_org_id: isSuperAdmin ? selectedOrgId : undefined
        })
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder('utf-8');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6);
          if (d === '[DONE]') break;
          try {
            const p = JSON.parse(d);
            if (p.conversation_id) {
              setActiveConversationId(p.conversation_id);
              loadConvs();
              continue;
            }
            setChatHistory(prev => {
              const h = [...prev];
              if (h.length === 0) {
                return [{ role: 'ai', content: p.content }];
              }
              const last = h[h.length - 1];
              if (last.role === 'ai') {
                h[h.length - 1] = {
                  ...last,
                  content: last.content + p.content
                };
              } else {
                h.push({ role: 'ai', content: p.content });
              }
              return h;
            });
          } catch {}
        }
      }
    } catch {
      setChatHistory(p => {
        const h = [...p];
        if (h.length > 0 && h[h.length - 1].role === 'ai') {
          h[h.length - 1] = { ...h[h.length - 1], content: '⚠️ Connection lost with FastAPI server. Please check that port 8000 is running.' };
        }
        return h;
      });
    } finally {
      isStreamingRef.current = false;
      setIsLoading(false);
    }
  };

  const grouped = (() => {
    const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const y = new Date(t); y.setDate(t.getDate() - 1);
    const w = new Date(t); w.setDate(t.getDate() - 7);
    const g = { Today: [], Yesterday: [], 'This Week': [], Older: [] };
    conversations.forEach(c => {
      const d = new Date(c.updated_at || c.created_at);
      if (d >= t) g.Today.push(c);
      else if (d >= y) g.Yesterday.push(c);
      else if (d >= w) g['This Week'].push(c);
      else g.Older.push(c);
    });
    return g;
  })();

  const tabs = [
    ...(isSuperAdmin ? [{ id: 'central_admin', icon: ShieldCheck, label: 'Central Admin Portal' }] : []),
    { id: 'chat', icon: MessagesSquare, label: 'AI Knowledge Chat' },
    { id: 'documents', icon: FileText, label: 'Document Library' },
    ...(isAdmin ? [{ id: 'upload', icon: Upload, label: 'Ingest Documents' }] : []),
    ...(isAdmin ? [{ id: 'team', icon: Users, label: isSuperAdmin ? 'Tenant Team' : 'Team Members' }] : []),
  ];

  const SB = sidebarOpen ? 300 : 0;

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
      {/* ==================== ENTERPRISE SIDEBAR ==================== */}
      <aside style={{
        width: `${SB}px`,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--color-bg-secondary)',
        borderRight: SB ? '1px solid var(--color-border-default)' : 'none',
        transition: 'width 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        zIndex: 20
      }}>
        {/* Organization Brand Header */}
        <div style={{ padding: '18px 16px 14px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(79, 70, 229, 0.35)'
              }}>
                <Sparkles style={{ width: '16px', height: '16px', color: '#ffffff' }} />
              </div>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', display: 'block' }}>
                  Enterprise RAG
                </span>
                <span style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', fontWeight: 550, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 style={{ width: '10px', height: '10px', color: 'var(--color-cyan)' }} />
                  {orgDomain}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                padding: '6px',
                borderRadius: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}>
              <PanelLeftClose style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* New Chat Primary Action */}
          <button
            onClick={newChat}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '11px',
              border: '1px solid var(--color-border-default)',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              fontWeight: 650,
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: 'var(--card-shadow)',
              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-bg-card-hover)';
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--color-bg-card)';
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.transform = 'none';
            }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus style={{ width: '16px', height: '16px', color: 'var(--color-accent-bright)' }} />
              New Conversation
            </span>
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '5px', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-tertiary)' }}>
              ⌘K
            </span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: active ? 650 : 500,
                  transition: 'all 0.15s ease',
                  background: active ? 'var(--color-accent-soft)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)'
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}>
                <t.icon style={{ width: '16px', height: '16px', color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} />
                <span>{t.label}</span>
                {t.id === 'upload' && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#a5b4fc'
                  }}>
                    ADMIN
                  </span>
                )}
                {t.id === 'team' && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '9.5px',
                    fontWeight: 750,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: '#06b6d4'
                  }}>
                    USERS
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Conversation History */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)'
        }}>
          <p style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '6px 10px',
            marginBottom: '4px'
          }}>
            Recent Conversations
          </p>

          {loadingConvs ? (
            <div style={{ padding: '16px 10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
              <div style={{ width: '12px', height: '12px', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              Loading history...
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>
              No previous threads.
            </div>
          ) : (
            Object.entries(grouped).map(([lbl, cs]) => cs.length > 0 && (
              <div key={lbl} style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '10px', fontWeight: 650, color: 'var(--color-text-muted)', padding: '4px 10px', marginBottom: '2px' }}>
                  {lbl}
                </p>
                {cs.map(c => {
                  const active = activeConversationId === c._id && activeTab === 'chat';
                  return (
                    <button
                      key={c._id}
                      onClick={() => { setActiveConversationId(c._id); setActiveTab('chat'); }}
                      className="group"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '9px',
                        padding: '9px 10px',
                        borderRadius: '9px',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '12.5px',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        background: active ? 'var(--color-accent-soft)' : 'transparent',
                        fontWeight: active ? 650 : 500
                      }}
                      onMouseEnter={e => {
                        if (!active) {
                          e.currentTarget.style.background = 'var(--color-bg-hover)';
                          e.currentTarget.style.color = 'var(--color-text-primary)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--color-text-secondary)';
                        }
                      }}>
                      {active && (
                        <div style={{
                          position: 'absolute',
                          left: 0,
                          top: '20%',
                          bottom: '20%',
                          width: '3px',
                          borderRadius: '0 4px 4px 0',
                          background: 'var(--color-accent)'
                        }} />
                      )}
                      <MessagesSquare style={{ width: '13px', height: '13px', color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </span>
                      <span
                        onClick={ev => delConv(ev, c._id)}
                        className="opacity-0 group-hover:opacity-100"
                        style={{
                          padding: '3px',
                          cursor: 'pointer',
                          color: 'var(--color-text-tertiary)',
                          transition: 'all 0.15s',
                          borderRadius: '5px'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = 'var(--color-rose)';
                          e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = 'var(--color-text-tertiary)';
                          e.currentTarget.style.background = 'none';
                        }}>
                        <Trash2 style={{ width: '12px', height: '12px' }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* User Account / Organization Profile footer */}
        <div ref={menuRef} style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            {userMenuOpen && (
              <div className="a-scale" style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: '16px',
                boxShadow: 'var(--glass-shadow)',
                overflow: 'hidden',
                zIndex: 50
              }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 650, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{userName}</p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`badge-pill ${isAdmin ? 'badge-indigo' : 'badge-emerald'}`}>
                      {isAdmin ? <ShieldCheck style={{ width: '11px', height: '11px' }} /> : <User style={{ width: '11px', height: '11px' }} />}
                      {user?.role?.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="badge-pill badge-cyan">
                      {orgDomain}
                    </span>
                  </div>
                </div>
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 550 }}>Interface Theme</span>
                  <ThemeToggle showLabel={true} />
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setActiveTab('team');
                      setUserMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '12.5px',
                      fontWeight: 550,
                      color: 'var(--color-text-primary)',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <Users style={{ width: '14px', height: '14px', color: '#06b6d4' }} /> Manage Team & End Users
                  </button>
                )}
                <button
                  onClick={logout}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '12.5px',
                    fontWeight: 550,
                    color: 'var(--color-rose)',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <LogOut style={{ width: '14px', height: '14px' }} /> Sign out of workspace
                </button>
              </div>
            )}

            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '12px',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-card)',
                boxShadow: 'var(--card-shadow)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--color-bg-card-hover)';
                e.currentTarget.style.borderColor = 'var(--color-border-strong)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--color-bg-card)';
                e.currentTarget.style.borderColor = 'var(--color-border-default)';
              }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 750,
                textTransform: 'uppercase',
                flexShrink: 0
              }}>
                {userName.charAt(0)}
              </div>
              <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                <p style={{ fontSize: '12.5px', fontWeight: 650, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userName}
                </p>
                <p style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isSuperAdmin ? '#6366f1' : isAdmin ? '#06b6d4' : '#10b981' }} />
                  {isSuperAdmin ? 'Central Super Admin' : (user?.role ? user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Member')}
                </p>
              </div>
              <ChevronDown style={{
                width: '14px',
                height: '14px',
                color: 'var(--color-text-tertiary)',
                transform: userMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s'
              }} />
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT AREA ==================== */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', background: 'var(--color-bg-primary)' }}>
        {/* Top Navbar */}
        <header style={{
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid var(--color-border-default)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-default)',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}>
                <PanelLeft style={{ width: '15px', height: '15px' }} />
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--color-text-primary)' }}>
                {activeTab === 'central_admin' ? 'Central Platform Control Center' : activeTab === 'team' ? 'Organization Team & End Users' : activeTab === 'chat' ? 'Knowledge Base Assistant' : activeTab === 'documents' ? 'Organization Documents' : 'Ingest Documents'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>/</span>
              {isSuperAdmin && activeTab === 'chat' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select
                    value={selectedOrgId}
                    onChange={e => setSelectedOrgId(e.target.value)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: 650,
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: 'var(--color-accent-bright)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      outline: 'none',
                      cursor: 'pointer'
                    }}>
                    <option value="all">🌐 Scope: Global (All Platform Documents)</option>
                    {availableOrgs.map(o => (
                      <option key={o._id} value={o._id}>🏢 {o.name} ({o.domain})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {orgDomain}
                </span>
              )}
            </div>
          </div>

          {/* Model Status Pills & Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="badge-pill badge-indigo">
              <Cpu style={{ width: '11px', height: '11px' }} />
              <span>Groq LLaMA 3.3 70B</span>
            </div>
            <div className="badge-pill badge-emerald">
              <Database style={{ width: '11px', height: '11px' }} />
              <span>Pinecone Vector Index</span>
            </div>
            <div style={{ width: '1px', height: '18px', background: 'var(--color-border-default)' }} />
            <ThemeToggle showLabel={false} />
          </div>
        </header>

        {/* ======= TAB 1: CHAT ASSISTANT ======= */}
        {activeTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>
            {/* Messages Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 28px' }}>
                {chatHistory.length === 0 && (
                  <div className="a-up" style={{
                    minHeight: '62vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    paddingTop: '3vh'
                  }}>
                    {/* Emblem */}
                    <div style={{ position: 'relative', marginBottom: '28px' }}>
                      <div style={{
                        width: '84px',
                        height: '84px',
                        borderRadius: '24px',
                        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.2) 0%, rgba(6, 182, 212, 0.15) 100%)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 36px rgba(79, 70, 229, 0.25)'
                      }}>
                        <Bot style={{ width: '40px', height: '40px', color: '#818cf8' }} />
                      </div>
                      <div style={{
                        position: 'absolute',
                        inset: '-6px',
                        borderRadius: '28px',
                        border: '1px solid rgba(6, 182, 212, 0.2)',
                        animation: 'subtlePulse 3s infinite'
                      }} />
                    </div>

                    <h2 style={{
                      fontSize: '32px',
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      marginBottom: '10px',
                      color: 'var(--color-text-primary)'
                    }}>
                      Enterprise Knowledge Assistant
                    </h2>
                    <p style={{
                      fontSize: '14.5px',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '460px',
                      lineHeight: 1.6,
                      marginBottom: '38px'
                    }}>
                      Grounded in <strong style={{ color: 'var(--color-text-primary)' }}>{orgDomain}</strong>'s private documents. Ask any question to retrieve cited, policy-compliant answers.
                    </p>

                    {/* Business Starter Prompts */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '12px',
                      width: '100%',
                      maxWidth: '740px'
                    }}>
                      {[
                        { title: 'Summarize Document Policies', desc: 'Synthesize internal rules and guidelines', query: 'Summarize the primary guidelines and policies in our documents.' },
                        { title: 'Technical Prerequisites', desc: 'Extract requirements, dependencies & steps', query: 'What are the main technical requirements mentioned in our knowledge base?' },
                        { title: 'Executive Overview', desc: 'Generate an executive bulleted brief', query: 'Provide an executive summary of our indexed documentation.' },
                        { title: 'Security & Access Protocols', desc: 'Inspect governance & access controls', query: 'What are our document security and access classification policies?' },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => setQuery(item.query)}
                          className="enterprise-card"
                          style={{
                            padding: '16px',
                            textAlign: 'left',
                            cursor: 'pointer'
                          }}>
                          <div style={{ fontSize: '13px', fontWeight: 650, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                            {item.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages Loop */}
                {chatHistory.map((m, i) => (
                  <div key={i} className="msg-container" style={{
                    display: 'flex',
                    gap: '14px',
                    padding: '14px 0',
                    animationDelay: `${Math.min(i * 0.04, 0.3)}s`,
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '11px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...(m.role === 'user'
                        ? { background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', boxShadow: '0 2px 10px rgba(79, 70, 229, 0.3)' }
                        : { background: 'var(--color-bg-card)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--card-shadow)' })
                    }}>
                      {m.role === 'user' ? (
                        <User style={{ width: '16px', height: '16px', color: '#ffffff' }} />
                      ) : (
                        <Bot style={{ width: '16px', height: '16px', color: 'var(--color-accent-bright)' }} />
                      )}
                    </div>

                    {/* Content Column */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: m.role === 'user' ? 'var(--color-text-primary)' : 'var(--color-accent)',
                          letterSpacing: '0.01em'
                        }}>
                          {m.role === 'user' ? 'You' : 'Enterprise AI Assistant'}
                        </span>
                        {m.role === 'ai' && (
                          <span style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(6, 182, 212, 0.12)',
                            color: 'var(--color-cyan)',
                            fontWeight: 650
                          }}>
                            RAG Citations
                          </span>
                        )}
                        {m.created_at && (
                          <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '3px', marginLeft: 'auto' }}>
                            <Clock style={{ width: '10px', height: '10px' }} /> {fmtTime(m.created_at)}
                          </span>
                        )}
                      </div>

                      {/* Bubble */}
                      {m.role === 'ai' ? (
                        <div className="msg-ai-bubble" style={{ position: 'relative' }}>
                          <div className="ai-md">
                            {m.content ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {normalizeMarkdown(m.content)}
                              </ReactMarkdown>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 2px' }}>
                                <span className="tdot" /><span className="tdot" /><span className="tdot" />
                                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                                   Retrieving documents & reasoning...
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Response Action Toolbar */}
                          {m.content && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginTop: '14px',
                              paddingTop: '10px',
                              borderTop: '1px solid var(--color-border-subtle)'
                            }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => copyMsg(m.content, i)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '4px 10px',
                                    borderRadius: '7px',
                                    background: 'var(--color-bg-hover)',
                                    border: '1px solid var(--color-border-default)',
                                    color: copiedMsgIdx === i ? 'var(--color-emerald)' : 'var(--color-text-secondary)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}>
                                  {copiedMsgIdx === i ? <Check style={{ width: '11px', height: '11px' }} /> : <Copy style={{ width: '11px', height: '11px' }} />}
                                  {copiedMsgIdx === i ? 'Copied' : 'Copy'}
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  onClick={() => handleFeedback(i, 'up')}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '7px',
                                    background: feedbackGiven[i] === 'up' ? 'rgba(16, 185, 129, 0.15)' : 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: feedbackGiven[i] === 'up' ? 'var(--color-emerald)' : 'var(--color-text-tertiary)',
                                    transition: 'all 0.15s'
                                  }}
                                  title="Helpful response">
                                  <ThumbsUp style={{ width: '12px', height: '12px' }} />
                                </button>
                                <button
                                  onClick={() => handleFeedback(i, 'down')}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '7px',
                                    background: feedbackGiven[i] === 'down' ? 'rgba(244, 63, 94, 0.15)' : 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: feedbackGiven[i] === 'down' ? 'var(--color-rose)' : 'var(--color-text-tertiary)',
                                    transition: 'all 0.15s'
                                  }}
                                  title="Unhelpful response">
                                  <ThumbsDown style={{ width: '12px', height: '12px' }} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="msg-user-bubble">
                          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--msg-user-text)' }}>
                            {m.content}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={endRef} style={{ height: '18px' }} />
              </div>
            </div>

            {/* Prompt Input Container */}
            <div style={{ flexShrink: 0, position: 'relative', zIndex: 5 }}>
              <div style={{
                position: 'absolute',
                top: '-70px',
                left: 0,
                right: 0,
                height: '70px',
                background: 'linear-gradient(transparent, var(--color-bg-primary))',
                pointerEvents: 'none'
              }} />

              <div style={{ maxWidth: '840px', margin: '0 auto', padding: '0 28px 24px' }}>
                <form onSubmit={handleChat}>
                  <div style={{
                    position: 'relative',
                    borderRadius: '18px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    boxShadow: 'var(--input-shadow)',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={
                        isSuperAdmin 
                          ? (selectedOrgId === 'all' ? 'Ask anything across all platform documents (Global Knowledge Base)...' : `Ask anything about ${availableOrgs.find(o => o._id === selectedOrgId)?.name || 'this organization'}'s internal documents...`)
                          : `Ask anything about ${orgDomain}'s internal documents...`
                      }
                      disabled={isLoading}
                      style={{
                        width: '100%',
                        padding: '18px 60px 18px 22px',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !query.trim()}
                      className="btn-primary"
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '40px',
                        height: '40px',
                        padding: 0,
                        borderRadius: '12px'
                      }}>
                      {isLoading ? (
                        <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      ) : (
                        <Send style={{ width: '15px', height: '15px' }} />
                      )}
                    </button>
                  </div>
                </form>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  marginTop: '10px',
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck style={{ width: '12px', height: '12px', color: 'var(--color-emerald)' }} />
                    Zero external training
                  </span>
                  <span>•</span>
                  <span>Press <kbd style={{ padding: '1px 5px', borderRadius: '4px', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Enter</kbd> to send</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======= TAB 2: DOCUMENT LIBRARY ======= */}
        {activeTab === 'documents' && (
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
            <DocumentLibrary isAdmin={isAdmin} />
          </div>
        )}

        {/* ======= TAB 3: DOCUMENT UPLOAD (ADMIN) ======= */}
        {activeTab === 'upload' && isAdmin && (
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
            <DocumentUpload onUploadComplete={() => setActiveTab('documents')} />
          </div>
        )}

        {/* ======= TAB 4: CENTRAL ADMIN PORTAL (SUPER ADMIN) ======= */}
        {activeTab === 'central_admin' && isSuperAdmin && (
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
            <CentralAdmin />
          </div>
        )}

        {/* ======= TAB 5: ORGANIZATION TEAM & END USERS (ORG ADMIN / SUPER ADMIN) ======= */}
        {activeTab === 'team' && isAdmin && (
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
            <OrgUserManagement targetOrgId={isSuperAdmin && selectedOrgId !== 'all' ? selectedOrgId : null} />
          </div>
        )}
      </main>
    </div>
  );
}