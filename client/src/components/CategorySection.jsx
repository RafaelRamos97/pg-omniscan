import { useState } from 'react';

/**
 * Converte valores complexos do PostgreSQL (intervals, arrays, objetos) em texto legível.
 * O driver `pg` retorna tipos como `interval` como objetos JS: { hours: 1, minutes: 30, seconds: 5 }
 */
function formatCellValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'SIM' : 'NÃO';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(v => formatCellValue(v)).join(', ');
  
  // Objeto: provavelmente um interval do PostgreSQL { hours, minutes, seconds, ... }
  if (typeof val === 'object') {
    // Interval PostgreSQL: { years, months, days, hours, minutes, seconds, milliseconds }
    if ('hours' in val || 'minutes' in val || 'seconds' in val || 'days' in val || 'milliseconds' in val) {
      const parts = [];
      if (val.years) parts.push(`${val.years}a`);
      if (val.months) parts.push(`${val.months}m`);
      if (val.days) parts.push(`${val.days}d`);
      const h = val.hours || 0;
      const m = val.minutes || 0;
      const s = val.seconds || 0;
      const ms = val.milliseconds || 0;
      if (h || m || s || ms) {
        parts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(Math.floor(s)).padStart(2,'0')}`);
        if (ms) parts[parts.length - 1] += `.${String(ms).padStart(3,'0')}`;
      }
      return parts.length > 0 ? parts.join(' ') : '00:00:00';
    }
    // Fallback: tenta JSON compacto
    try { return JSON.stringify(val); } catch { return '—'; }
  }
  return String(val);
}

function ScriptItem({ item }) {
  const hasData = item.data && item.data.length > 0;
  const hasError = !!item.error;
  // Expande por padrão se tiver erro ou se tiver dados relevantes
  const [isExpanded, setIsExpanded] = useState(hasData || hasError);
  const [showSql, setShowSql] = useState(false);

  const scriptTitle = (item.baseName || item.script || '').replace(/_/g, ' ').replace('.sql', '').toUpperCase();

  return (
    <div className={`script-item-card ${isExpanded ? 'active' : ''}`} style={{ marginBottom: 12 }}>
      <div 
        className="script-header" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          fontSize: '13px', 
          fontWeight: 600, 
          color: isExpanded ? '#fff' : 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          padding: '10px 14px',
          background: isExpanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          border: isExpanded ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
          transition: 'all 0.2s ease'
        }}
      >
        <span style={{ fontSize: '16px', filter: isExpanded ? 'grayscale(0)' : 'grayscale(1)' }}>📄</span>
        <span style={{ flex: 1 }}>{scriptTitle}</span>
        
        {hasData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {item.delta !== undefined && (
              <span style={{ 
                fontSize: '11px', 
                fontWeight: 800, 
                color: item.delta > 0 ? '#ff4444' : (item.delta < 0 ? '#10b981' : 'rgba(255,255,255,0.3)'),
                background: 'rgba(0,0,0,0.2)',
                padding: '2px 6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '2px'
              }}>
                {item.delta > 0 ? '▲' : (item.delta < 0 ? '▼' : '●')}
                {item.delta !== 0 && Math.abs(item.delta)}
              </span>
            )}
            <span className="count-tag" style={{ 
              fontSize: '10px', 
              background: 'var(--accent-glow)', 
              padding: '2px 8px', 
              borderRadius: '10px',
              color: '#fff'
            }}>
              {item.data.length} achados
            </span>
          </div>
        )}
        
        {hasError && <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 'bold' }}>⚠️ ERRO</span>}
        
        {!hasData && !hasError && (
          <span style={{ color: '#10b981', fontSize: '11px', opacity: 0.8 }}>✓ OK</span>
        )}

        <span style={{ 
          fontSize: '10px', 
          opacity: 0.5, 
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s ease'
        }}>▼</span>
      </div>

      {isExpanded && (
        <div className="script-body" style={{ padding: '15px 5px 5px 5px' }}>
          
          {/* BANNER DE RECOMENDAÇÃO DBA (INTELIGÊNCIA NATIVA) */}
          {item.baseRecommendation && (
            <div style={{
              margin: '0 10px 15px 10px',
              padding: '12px 16px',
              borderRadius: '8px',
              borderLeft: `4px solid ${
                item.baseRecommendation.severity === 'critical' ? '#ef4444' : 
                item.baseRecommendation.severity === 'warning' ? '#f59e0b' : '#3b82f6'
              }`,
              background: 'rgba(255,255,255,0.03)',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontSize: '16px' }}>
                  {item.baseRecommendation.severity === 'critical' ? '🔴' : 
                   item.baseRecommendation.severity === 'warning' ? '🟠' : '🔵'}
                </span>
                <strong style={{ fontSize: '13px', color: '#fff' }}>{item.baseRecommendation.title}</strong>
              </div>
              <p style={{ fontSize: '12px', margin: '4px 0', color: 'rgba(255,255,255,0.9)', lineHeight: '1.4' }}>
                {item.baseRecommendation.advice}
              </p>
              {item.baseRecommendation.impact && (
                <div style={{ fontSize: '11px', marginTop: '6px', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                  Impacto: {item.baseRecommendation.impact}
                </div>
              )}
            </div>
          )}

          {/* Botão de Auditoria SQL */}
          <div style={{ marginBottom: 15, padding: '0 10px' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowSql(!showSql);
              }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              {showSql ? '✕ Fechar SQL' : '🔍 Ver SQL de Auditoria'}
            </button>
            
            {showSql && (
              <pre style={{ 
                marginTop: 10, 
                padding: 12, 
                background: '#000', 
                color: '#50fa7b', 
                fontSize: '11px', 
                borderRadius: '6px',
                overflowX: 'auto',
                border: '1px solid #333',
                maxHeight: '200px'
              }}>
                {item.content || '-- SQL não disponível para este item'}
              </pre>
            )}
          </div>

          {item.data && item.data.length > 0 ? (
            <div className="data-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(item.data[0]).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.data.slice(0, 100).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {Object.values(row).map((val, colIdx) => (
                        <td key={colIdx}>{formatCellValue(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {item.data.length > 100 && (
                <div style={{ 
                  padding: '12px', 
                  textAlign: 'center', 
                  fontSize: '11px', 
                  color: 'var(--text-muted)',
                  background: 'rgba(0,0,0,0.2)',
                  borderTop: '1px solid var(--border-color)'
                }}>
                  💡 Mais {item.data.length - 100} linhas ocultas para manter a performance. 
                  <strong> Exporte o PDF para visualizar o relatório completo.</strong>
                </div>
              )}
            </div>
          ) : (
            item.error ? (
              <div style={{ 
                padding: '12px', 
                background: 'rgba(239, 68, 68, 0.05)', 
                borderLeft: '3px solid #ef4444',
                color: '#fca5a5',
                fontSize: '13px',
                borderRadius: '4px'
              }}>
                <strong>Falha:</strong> {item.error}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '10px' }}>
                Relatório vazio. Nenhuma inconsistência detectada para este cenário.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function CategorySection({ icon, label, items }) {
  const [expanded, setExpanded] = useState(false);

  const totalRows = items.reduce((sum, i) => sum + (i.data ? i.data.length : 0), 0);
  const errors = items.filter(i => i.error).length;

  const getBadge = () => {
    if (errors > 0) return <span className="cat-badge warnings">{errors} erro(s)</span>;
    if (totalRows > 0) return <span className="cat-badge issues">{totalRows} itens</span>;
    return <span className="cat-badge ok">✓ OK</span>;
  };

  return (
    <div className={`category-section ${expanded ? 'expanded' : ''}`}>
      <div className="category-header" onClick={() => setExpanded(!expanded)}>
        <div className="cat-title">
          <span className="cat-icon">{icon}</span>
          <span>{label}</span>
          {getBadge()}
        </div>
        <span className="expand-icon" style={{ 
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s ease'
        }}>▼</span>
      </div>

      <div className="category-content">
        {items.map((item, idx) => (
          <ScriptItem key={idx} item={item} />
        ))}
      </div>
    </div>
  );
}
