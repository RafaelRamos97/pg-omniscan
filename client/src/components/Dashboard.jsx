import { useState, useEffect } from 'react';
import { runStreamingAnalysis, disconnectDB, getScriptsMetadata } from '../api';
import CategorySection from './CategorySection';
import Recommendations from './Recommendations';
import AIPanel from './AIPanel';
import HistoryPanel from './HistoryPanel';

export default function Dashboard({ connectionInfo, onDisconnect }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('select');
  
  // Estados de Progresso
  const [progress, setProgress] = useState({ percent: 0, message: '', logs: [] });

  const [availableCategories, setAvailableCategories] = useState([]);
  
  // Carrega preferências iniciais do localStorage
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const saved = localStorage.getItem('pg_selected_categories');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [excludedScripts, setExcludedScripts] = useState(() => {
    const saved = localStorage.getItem('pg_excluded_scripts');
    return saved ? JSON.parse(saved) : [];
  });

  const [expandedCategory, setExpandedCategory] = useState(null);

  // Efeito para salvar alterações
  useEffect(() => {
    localStorage.setItem('pg_selected_categories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  useEffect(() => {
    localStorage.setItem('pg_excluded_scripts', JSON.stringify(excludedScripts));
  }, [excludedScripts]);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const cats = await getScriptsMetadata();
      setAvailableCategories(cats);
    } catch (err) {
      setError('Erro ao carregar metadados: ' + err.message);
    }
  };

  const toggleCategory = (id) => {
    const isSelected = selectedCategories.includes(id);
    setSelectedCategories(prev =>
      isSelected ? prev.filter(k => k !== id) : [...prev, id]
    );
    // Se desmarcar categoria, limpa as exclusões dela
    if (isSelected) {
      const cat = availableCategories.find(c => c.id === id);
      if (cat) {
        const scriptNames = cat.scripts.map(s => s.baseName);
        setExcludedScripts(prev => prev.filter(s => !scriptNames.includes(s)));
      }
    }
  };

  const toggleScript = (e, scriptBase) => {
    e.stopPropagation();
    setExcludedScripts(prev =>
      prev.includes(scriptBase) ? prev.filter(s => s !== scriptBase) : [...prev, scriptBase]
    );
  };

  const selectOnly = (id, e) => {
    e.stopPropagation();
    setSelectedCategories([id]);
    setExcludedScripts([]); // Reinicia filtros
  };

  const selectAll = () => {
    setSelectedCategories(availableCategories.map(c => c.id));
    setExcludedScripts([]);
  };

  const selectNone = () => {
    setSelectedCategories([]);
    setExcludedScripts([]);
  };

  const [abortController, setAbortController] = useState(null);

  const handleAnalyze = async () => {
    if (selectedCategories.length === 0) {
      setError('Selecione ao menos uma categoria para analisar.');
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setLoading(true);
    setError('');
    setProgress({ percent: 0, message: 'Iniciando diagnóstico...', logs: [] });
    
    try {
      await runStreamingAnalysis(selectedCategories, (msg) => {
        if (msg.type === 'progress' || msg.type === 'status') {
          setProgress(prev => ({
            percent: msg.percent !== undefined ? msg.percent : prev.percent,
            message: msg.message || prev.message,
            logs: msg.message ? [msg.message, ...prev.logs].slice(0, 10) : prev.logs
          }));
        } else if (msg.type === 'complete') {
          setAnalysis(msg.data);
          setLoading(false);
          setActiveTab('analysis');
          setAbortController(null);
        } else if (msg.type === 'error') {
          throw new Error(msg.message);
        }
      }, controller.signal, excludedScripts);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Análise cancelada pelo usuário.');
      } else {
        setError(err.message);
      }
      setLoading(false);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleDisconnect = async () => {
    await disconnectDB();
    onDisconnect();
  };

  const getTotalIssues = () => {
    if (!analysis) return 0;
    return Object.values(analysis.categories).reduce((sum, cat) => {
      return sum + (Array.isArray(cat) ? cat.reduce((s, item) => s + (item.data ? item.data.length : 0), 0) : 0);
    }, 0);
  };

  return (
    <>
      {loading && (
        <div className="loading-overlay" style={{ background: 'rgba(10, 11, 14, 0.95)', backdropFilter: 'blur(10px)' }}>
          <div className="diagnostic-console" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 24px' }}></div>
            <h2 style={{ marginBottom: 8, fontSize: 20 }}>Análise em Curso...</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>{progress.message}</p>
            
            <div className="progress-container" style={{ 
              width: '100%', 
              height: 8, 
              background: 'rgba(255,255,255,0.05)', 
              borderRadius: 4, 
              overflow: 'hidden',
              marginBottom: 24
            }}>
              <div className="progress-bar" style={{ 
                width: `${progress.percent}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-green))',
                transition: 'width 0.3s ease'
              }}></div>
            </div>

            <div className="console-logs" style={{ 
              textAlign: 'left', 
              background: 'black', 
              padding: 16, 
              borderRadius: 8, 
              fontSize: 12, 
              fontFamily: 'monospace',
              color: '#00ff00',
              opacity: 0.8,
              minHeight: 120,
              marginBottom: 24
            }}>
              {progress.logs.map((log, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ opacity: 0.5 }}>[{new Date().toLocaleTimeString()}]</span> {log}
                </div>
              ))}
              <div style={{ animation: 'blink 1s infinite' }}>_</div>
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={handleCancel}
              style={{ padding: '10px 24px', fontSize: 13, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              🛑 Cancelar Análise
            </button>
            
            <div style={{ marginTop: 20, color: 'var(--text-muted)', fontSize: 11 }}>
              🔒 Garantia Read-Only: Verificando assinaturas SELECT...
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-toast" onClick={() => setError('')}>
          ⚠️ {error}
        </div>
      )}

      <div className="app-main">
        <div className="dashboard-header">
          <div>
            <h1>🐘 PG Health Analyzer</h1>
            <div className="db-info">
              Conectado a <strong>{connectionInfo.config.database}</strong> em {connectionInfo.config.host}:{connectionInfo.config.port}
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="btn btn-danger" onClick={handleDisconnect}>
              Desconectar
            </button>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: '32px' }}>
          <button className={`tab ${activeTab === 'select' ? 'active' : ''}`} onClick={() => setActiveTab('select')}>
            🎯 Selecionar Análise
          </button>
          {analysis && (
            <>
              <button className={`tab ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
                📊 Resultados
              </button>
              <button className={`tab ${activeTab === 'recommendations' ? 'active' : ''}`} onClick={() => setActiveTab('recommendations')}>
                💡 Recomendações
              </button>
              <button className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                🤖 IA
              </button>
            </>
          )}
          <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            📜 Histórico
          </button>
        </div>

        {activeTab === 'select' && (
          <div className="selection-screen">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                🚀 Selecione o que deseja analisar
              </h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={selectAll} style={{ fontSize: '11px', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  ✓ Selecionar Tudo
                </button>
                <button className="btn btn-secondary" onClick={selectNone} style={{ fontSize: '11px', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  ✕ Limpar
                </button>
              </div>
            </div>

            <div className="score-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
              gap: '20px',
              marginBottom: '48px'
            }}>
              {availableCategories.map(cat => {
                const isSelected = selectedCategories.includes(cat.id);
                const isExpanded = expandedCategory === cat.id;
                const icon = cat.icon || '📁';
                const label = cat.label || cat.id;
                
                // Contar scripts ativos nesta categoria
                const compatibleScripts = cat.scripts.filter(s => s.compatible);
                const activeCount = compatibleScripts.filter(s => !excludedScripts.includes(s.baseName)).length;

                return (
                  <div
                    key={cat.id}
                    className={`score-card ${isSelected ? 'active' : ''}`}
                    onClick={() => toggleCategory(cat.id)}
                    style={{
                      cursor: 'pointer',
                      background: 'rgba(23, 24, 37, 0.6)',
                      border: `2px solid ${isSelected ? '#6366f1' : 'transparent'}`,
                      borderRadius: '16px',
                      padding: isExpanded ? '24px' : '32px 20px',
                      position: 'relative',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isSelected ? '0 0 30px rgba(99, 102, 241, 0.2)' : '0 4px 12px rgba(0,0,0,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gridColumn: isExpanded ? '1 / -1' : 'auto',
                      minHeight: isExpanded ? 'auto' : '260px'
                    }}
                  >
                    {!isExpanded && (
                      <div style={{ 
                        fontSize: '40px', 
                        marginBottom: '16px',
                        filter: isSelected ? 'drop-shadow(0 0 10px rgba(255,255,255,0.3))' : 'none'
                      }}>
                        {icon}
                      </div>
                    )}
                    
                    <div style={{ 
                      position: 'absolute', 
                      top: '16px', 
                      right: '16px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      border: `2px solid ${isSelected ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                      background: isSelected ? '#6366f1' : 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 900
                    }}>
                      {isSelected ? '✓' : ''}
                    </div>

                    <div style={{ 
                      fontSize: isExpanded ? '20px' : '14px', 
                      fontWeight: 800, 
                      color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '2px',
                      lineHeight: '1.4'
                    }}>
                      {isExpanded ? `${icon} ${label}` : label}
                    </div>
                    
                    <div style={{ 
                      fontSize: '12px', 
                      color: isSelected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)',
                      fontWeight: 500,
                      marginBottom: '12px'
                    }}>
                      {activeCount} de {compatibleScripts.length} scripts ativos
                    </div>

                    {isExpanded ? (
                      <div style={{ 
                        width: '100%', 
                        marginTop: '20px', 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                        gap: '12px',
                        textAlign: 'left'
                      }}>
                        {cat.scripts.map(s => {
                          const isExcluded = excludedScripts.includes(s.baseName);
                          const isDisabled = !s.compatible;
                          return (
                            <div 
                              key={s.baseName}
                              onClick={(e) => !isDisabled && toggleScript(e, s.baseName)}
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                opacity: isDisabled ? 0.3 : 1,
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div style={{
                                width: '18px',
                                height: '18px',
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: '4px',
                                background: isExcluded ? 'transparent' : '#6366f1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '12px'
                              }}>
                                {!isExcluded && '✓'}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{s.name}</div>
                                {isDisabled && <div style={{ fontSize: '10px', color: '#ff4444' }}>{s.reason}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedCategory(isExpanded ? null : cat.id); }}
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: '9px',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Ver Scripts
                        </button>
                        <button
                          onClick={(e) => selectOnly(cat.id, e)}
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: '9px',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Focar
                        </button>
                      </div>
                    )}

                    {isExpanded && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedCategory(null); }}
                        style={{
                          marginTop: '24px',
                          background: '#6366f1',
                          border: 'none',
                          color: 'white',
                          padding: '8px 24px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Fechar Detalhes
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={loading || selectedCategories.length === 0}
                style={{ 
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  padding: '16px 64px', 
                  fontSize: '16px', 
                  fontWeight: 800,
                  borderRadius: '100px',
                  border: 'none',
                  color: 'white',
                  boxShadow: '0 8px 25px rgba(79, 70, 229, 0.4)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.2s ease',
                  textTransform: 'none'
                }}
              >
                {loading ? '⏳' : '🚀'} 
                {loading ? 'Analisando...' : `Analisar ${selectedCategories.length} Categoria(s)`}
              </button>
              <div style={{ marginTop: '20px', color: 'rgba(255,255,255,0.2)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🔒</span> Somente comandos SELECT serão executados. Garantia read-only.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && analysis && (
          <>
            <div className="score-grid">
              <div className="score-card info">
                <div className="card-icon">🗄️</div>
                <div className="card-title">Database</div>
                <div className="card-value" style={{ fontSize: 18 }}>{connectionInfo.config.database}</div>
                <div className="card-detail">PG v{Math.floor(analysis.version / 10000)}</div>
              </div>
              <div className={`score-card ${getTotalIssues() > 10 ? 'critical' : getTotalIssues() > 0 ? 'warning' : 'good'}`}>
                <div className="card-icon">📋</div>
                <div className="card-title">Achados Totais</div>
                <div className="card-value">{getTotalIssues()}</div>
                <div className="card-detail">alinhados por saúde</div>
              </div>
              <div className={`score-card ${(analysis.recommendations || []).length > 3 ? 'warning' : 'good'}`}>
                <div className="card-icon">💡</div>
                <div className="card-title">Recomendações</div>
                <div className="card-value">{(analysis.recommendations || []).length}</div>
                <div className="card-detail">passivas encontradas</div>
              </div>
              <div className="score-card info">
                <div className="card-icon">🕐</div>
                <div className="card-title">Execução</div>
                <div className="card-value" style={{ fontSize: 14 }}>{new Date(analysis.timestamp).toLocaleString()}</div>
                <div className="card-detail">{analysis.stats.executed}/{analysis.stats.total} scripts</div>
              </div>
            </div>

            {Object.entries(analysis.categories).map(([catName, items]) => (
              <CategorySection
                key={catName}
                name={catName}
                icon={availableCategories.find(c => c.id === catName)?.icon || '📁'}
                label={availableCategories.find(c => c.id === catName)?.label || catName}
                items={items}
              />
            ))}
          </>
        )}

        {activeTab === 'recommendations' && analysis && (
          <Recommendations recommendations={analysis.recommendations || []} />
        )}

        {activeTab === 'ai' && analysis && (
          <AIPanel analysisId={analysis.savedAs} />
        )}

        {activeTab === 'history' && (
          <HistoryPanel onLoad={(data) => { setAnalysis(data); setActiveTab('analysis'); }} />
        )}
      </div>
    </>
  );
}
