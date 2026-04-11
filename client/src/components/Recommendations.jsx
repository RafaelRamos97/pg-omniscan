import { useState } from 'react';

export default function Recommendations({ recommendations }) {
  const [copiedIdx, setCopiedIdx] = useState(null);

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="recommendations-panel">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>💡</span> Recomendações de Saúde
        </h2>
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <h3>Tudo em dia!</h3>
          <p>O sistema de regras não detectou anomalias críticas nos dados analisados.</p>
        </div>
      </div>
    );
  }

  const sorted = [...recommendations].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.priority] || 4) - (order[b.priority] || 4);
  });

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'CRITICAL': return '🚨';
      case 'HIGH': return '⚠️';
      case 'MEDIUM': return '🔔';
      case 'LOW': return 'ℹ️';
      default: return '•';
    }
  };

  const isSqlCommand = (text) => {
    if (!text) return false;
    const up = text.trim().toUpperCase();
    return up.startsWith('CREATE') || up.startsWith('DROP') || up.startsWith('ALTER') || up.startsWith('VACUUM') || up.startsWith('REINDEX');
  };

  return (
    <div className="recommendations-panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <span style={{ fontSize: '24px' }}>💡</span> 
        Recomendações Inteligentes ({sorted.length})
      </h2>
      
      <div className="recommendations-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {sorted.map((rec, idx) => {
          const isSql = isSqlCommand(rec.action);
          const isSre = rec.category === 'Segurança' || rec.priority === 'CRITICAL';
          
          return (
            <div key={idx} className={`recommendation-item ${rec.priority === 'CRITICAL' ? 'critical-pulse' : ''}`} style={{
              display: 'block',
              padding: '24px',
              background: 'var(--bg-glass)',
              border: `1px solid ${rec.priority === 'CRITICAL' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
              borderRadius: '16px',
              position: 'relative',
              boxShadow: rec.priority === 'CRITICAL' ? '0 0 20px rgba(239, 68, 68, 0.1)' : 'none',
              transition: 'transform 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                <div style={{ 
                  fontSize: '24px', 
                  width: '48px', 
                  height: '48px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  background: 'rgba(255,255,255,0.05)', 
                  borderRadius: '12px' 
                }}>
                  {getPriorityIcon(rec.priority)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                    <span className={`cat-badge ${rec.priority.toLowerCase()}`} style={{ 
                      fontSize: '10px', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      fontWeight: 800
                    }}>
                      {rec.priority}
                    </span>
                    <span style={{ 
                      fontSize: '10px', 
                      background: 'rgba(99, 102, 241, 0.1)', 
                      color: 'var(--accent-blue)', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      textTransform: 'uppercase', 
                      fontWeight: 800,
                      letterSpacing: '0.5px'
                    }}>
                      {rec.category}
                    </span>
                    {isSre && (
                      <span style={{ 
                        fontSize: '10px', 
                        background: 'rgba(244, 63, 94, 0.1)', 
                        color: '#f43f5e', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        fontWeight: 900
                      }}>
                        SHIELD ALERT
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
                    {rec.message}
                  </h3>
                </div>
              </div>

              {rec.detail && (
                <div style={{ 
                  marginLeft: '64px', 
                  marginBottom: '16px', 
                  color: 'var(--text-secondary)', 
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}>
                  {rec.detail}
                </div>
              )}

              <div style={{ 
                marginLeft: '64px', 
                padding: '16px', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '12px',
                borderLeft: '4px solid var(--accent-blue)',
                marginBottom: '20px',
                backdropFilter: 'blur(4px)'
              }}>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 900, 
                  color: 'var(--accent-blue)', 
                  textTransform: 'uppercase', 
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '14px' }}>📝</span> DBA Rationale
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                  {rec.rationale}
                </div>
              </div>

              <div style={{ marginLeft: '64px' }}>
                <div style={{ 
                  color: 'var(--accent-green)', 
                  fontWeight: 900, 
                  fontSize: '11px', 
                  marginBottom: '10px', 
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '14px' }}>⚡</span> Ação Corretiva
                </div>
                
                {isSql ? (
                  <div style={{ position: 'relative', marginTop: '4px' }}>
                    <code style={{ 
                      display: 'block',
                      background: '#0a0a0a', 
                      padding: '16px 48px 16px 16px', 
                      borderRadius: '10px', 
                      fontSize: '13px', 
                      color: '#d4d4d4',
                      border: '1px solid rgba(255,255,255,0.1)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                      lineHeight: '1.5'
                    }}>
                      {rec.action}
                    </code>
                    <button 
                      className={`btn ${copiedIdx === idx ? 'btn-success' : 'btn-secondary'}`}
                      style={{ 
                        position: 'absolute', 
                        right: '12px', 
                        top: '12px', 
                        padding: '6px 12px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        fontWeight: 700
                      }}
                      onClick={() => handleCopy(rec.action, idx)}
                    >
                      {copiedIdx === idx ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                ) : (
                  <div style={{ 
                    fontSize: '14px', 
                    color: 'var(--text-primary)', 
                    background: 'rgba(255,255,255,0.03)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px dashed var(--border-color)'
                  }}>
                    {rec.action}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '32px', padding: '16px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.05)', border: '1px dashed rgba(99, 102, 241, 0.3)', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          🔒 Recomendações baseadas em heurísticas locais e scripts geradores do PostgreSQL.
        </p>
      </div>
    </div>
  );
}
