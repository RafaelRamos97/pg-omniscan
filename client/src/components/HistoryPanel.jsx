import { useState, useEffect } from 'react';
import { getHistory, getAnalysisDetail } from '../api';

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
      <h2 style={{ marginBottom: 20 }}>📜 Histórico de Análises</h2>
      <div className="history-list">
        {history.map((item) => (
          <div key={item.id} className="history-item" onClick={() => handleLoadAnalysis(item.id)}>
            <div>
              <div className="hi-date">{new Date(item.date).toLocaleString('pt-BR')}</div>
              <div className="hi-meta">{item.id}</div>
            </div>
            <div className="hi-meta">{(item.size / 1024).toFixed(1)} KB</div>
          </div>
        ))}
      </div>
    </div>
  );
}
