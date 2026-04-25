import { useState, useEffect } from 'react';
import { getHistory, getAnalysisDetail, deleteHistoryItem, clearAllHistory } from '../api';

export default function HistoryPanel({ onLoad }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const list = await getHistory();
      setHistory(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadAnalysis = async (id) => {
    try {
      const data = await getAnalysisDetail(id);
      onLoad(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir esta análise?')) return;
    
    try {
      await deleteHistoryItem(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('ATENÇÃO: Isso apagará TODO o histórico de análises. Continuar?')) return;
    
    try {
      await clearAllHistory();
      setHistory([]);
    } catch (err) {
      alert('Erro ao limpar histórico: ' + err.message);
    }
  };

  if (loading) {
    return <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /><p style={{ marginTop: 12 }}>Carregando histórico...</p></div>;
  }

  if (history.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📜</div>
        <h3>Sem análises salvas</h3>
        <p>Execute uma análise para salvar no histórico.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>📜 Histórico de Análises</h2>
        <button 
          className="btn btn-outline-danger" 
          onClick={handleClearAll}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          🗑️ Limpar Tudo
        </button>
      </div>
      
      <div className="history-list">
        {history.map((item) => (
          <div key={item.id} className="history-item" onClick={() => handleLoadAnalysis(item.id)} style={{ position: 'relative' }}>
            <div>
              <div className="hi-date">{new Date(item.date).toLocaleString('pt-BR')}</div>
              <div className="hi-meta">DB: {item.database}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div className="hi-meta" style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: item.issuesCount > 0 ? '#ff4444' : '#10b981' }}>Problemas: {item.issuesCount}</span>
                <span style={{ color: 'var(--accent-cyan)' }}>Dicas: {item.recommendationsCount}</span>
              </div>
              
              <button 
                onClick={(e) => handleDelete(e, item.id)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  cursor: 'pointer', 
                  fontSize: '16px',
                  opacity: 0.4,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
                title="Excluir esta análise"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
