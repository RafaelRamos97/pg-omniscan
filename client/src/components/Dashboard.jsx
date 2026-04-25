import { useState, useEffect } from 'react';
import { 
  runStreamingAnalysis, 
  disconnectDB, 
  getScriptsMetadata, 
  getHistory, 
  getAnalysisDetail,
  getDatabases,
  switchDatabase 
} from '../api';
import CategorySection from './CategorySection';
import Recommendations from './Recommendations';
import AIPanel from './AIPanel';
import HistoryPanel from './HistoryPanel';
import { exportToPDF, exportToMarkdown } from '../utils/exporter';
import StreamingConsole from './StreamingConsole';
import OverviewMetrics from './OverviewMetrics';

export default function Dashboard({ connectionInfo, onDisconnect, onUpdateConnection }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('select');
  
  // Estados de Progresso
  const [progress, setProgress] = useState({ percent: 0, message: '', logs: [] });

  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableDatabases, setAvailableDatabases] = useState([]);
  const [switchingDb, setSwitchingDb] = useState(false);
  
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
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [cats, dbs] = await Promise.all([
        getScriptsMetadata(),
        getDatabases()
      ]);
      setAvailableCategories(cats);
      setAvailableDatabases(dbs);
    } catch (err) {
      setError('Erro ao carregar metadados: ' + err.message);
    }
  };

  const handleSwitchDatabase = async (newDb) => {
    if (newDb === connectionInfo.dbname) return;
    
    setSwitchingDb(true);
    setError('');
    try {
      const result = await switchDatabase(newDb);
      // Notifica o componente pai para atualizar o connectionInfo global
      onUpdateConnection({
        ...connectionInfo,
        dbname: result.dbname,
        database: result.dbname
      });
      // Limpa análise atual e recarrega categorias (podem mudar por versão)
      setAnalysis(null);
      setActiveTab('select');
      const cats = await getScriptsMetadata();
      setAvailableCategories(cats);
    } catch (err) {
      setError('Erro ao trocar de banco: ' + err.message);
    } finally {
      setSwitchingDb(false);
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

  const calculateDelta = async (currentAnalysis) => {
    try {
      const history = await getHistory();
      // Encontra a análise anterior para o MESMO banco, excluindo a que acabou de ser salva
      const previous = history.find(h => h.database === currentAnalysis.database && h.id !== currentAnalysis.savedAs);
      
      if (!previous) return currentAnalysis;

      const prevDetail = await getAnalysisDetail(previous.id);
      
      // Itera sobre as categorias e scripts para calcular o delta
      const enrichedCategories = { ...currentAnalysis.categories };
      
      Object.keys(enrichedCategories).forEach(catName => {
        enrichedCategories[catName] = enrichedCategories[catName].map(currentScript => {
          const prevCat = prevDetail.categories[catName] || [];
          const prevScript = prevCat.find(s => s.baseName === currentScript.baseName);
          
          if (prevScript) {
            const delta = currentScript.rowCount - prevScript.rowCount;
            return { ...currentScript, delta };
          }
          return currentScript;
        });
      });

      return { ...currentAnalysis, deltaInfo: { comparedTo: previous.date }, categories: enrichedCategories };
    } catch (err) {
      console.warn('Falha ao calcular delta:', err);
      return currentAnalysis;
    }
  };

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
      await runStreamingAnalysis(selectedCategories, async (msg) => {
        if (msg.type === 'progress' || msg.type === 'status') {
          setProgress(prev => ({
            percent: msg.percent !== undefined ? msg.percent : prev.percent,
            message: msg.message || prev.message,
            logs: msg.message ? [msg.message, ...prev.logs].slice(0, 10) : prev.logs
          }));
        } else if (msg.type === 'script_complete') {
          // ATUALIZAÇÃO EM TEMPO REAL: Injeta o resultado do script na UI na hora
          setAnalysis(prev => {
            const current = prev || { 
              categories: {}, 
              recommendations: [], 
              stats: { total: selectedCategories.length, executed: 0, empty: 0 },
              timestamp: new Date().toISOString()
            };
            
            const catName = msg.catName;
            const newCategories = { ...current.categories };
            if (!newCategories[catName]) newCategories[catName] = [];
            
            // Adiciona se não existir (evita duplicados em retry)
            if (!newCategories[catName].some(s => s.baseName === msg.result.baseName)) {
              newCategories[catName].push(msg.result);
            }

            return { ...current, categories: newCategories };
          });
          
          setProgress(prev => ({ ...prev, percent: msg.percent }));
          
          // Muda para a aba de análise assim que o primeiro dado chegar
          if (activeTab !== 'analysis') setActiveTab('analysis');

        } else if (msg.type === 'complete') {
          // Finaliza com o objeto completo e calcula deltas
          const enriched = await calculateDelta(msg.data);
          setAnalysis(enriched);
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

  const handleExportPDF = () => {
    exportToPDF(analysis, connectionInfo.config);
  };

  const handleExportMD = () => {
    exportToMarkdown(analysis, connectionInfo.config);
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
        <StreamingConsole progress={progress} onCancel={handleCancel} />
      )}

      {error && (
        <div className="error-toast" onClick={() => setError('')}>
          ⚠️ {error}
        </div>
      )}

      <div className="app-main">
        <div className="dashboard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="brand-logo" style={{ fontSize: '20px' }}>⚡ PG-OmniScan</div>
            
            {/* Database Switcher */}
            <div className="db-switcher" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              background: 'rgba(255,255,255,0.05)',
              padding: '6px 16px',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.1)',
              position: 'relative',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}>
              <span style={{ fontSize: '12px', opacity: 0.6 }}>Database:</span>
              {switchingDb ? (
                <div className="spinner-small" style={{ width: '16px', height: '16px', borderTopColor: '#50fa7b' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select 
                    value={connectionInfo.dbname} 
                    onChange={(e) => handleSwitchDatabase(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-glow)',
                      fontWeight: '700',
                      fontSize: '14px',
                      cursor: 'pointer',
                      outline: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      paddingRight: '16px' // Espaço para a seta customizada
                    }}
                  >
                    {availableDatabases.map(db => (
                      <option key={db} value={db} style={{ background: '#1e293b', color: '#f8fafc' }}>
                        {db}
                      </option>
                    ))}
                  </select>
                  {/* Seta Customizada Elegante */}
                  <svg 
                    width="10" height="6" viewBox="0 0 10 6" fill="none" 
                    style={{ position: 'absolute', right: '14px', pointerEvents: 'none', opacity: 0.7 }}
                  >
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
            
            <div className="connection-badge">
              <span className="pulse-dot"></span>
              {connectionInfo.host}:{connectionInfo.port}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-outline-danger" onClick={handleDisconnect}>
              <span style={{ fontSize: '14px' }}>Desconectar</span>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '24px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={handleExportMD}
                style={{ fontSize: '12px', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                📝 Exportar Markdown
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleExportPDF}
                style={{ fontSize: '12px', padding: '8px 16px', background: '#6366f1', border: 'none' }}
              >
                📄 Exportar PDF Oficial
              </button>
            </div>
            
            <OverviewMetrics analysis={analysis} connectionInfo={connectionInfo} />

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
