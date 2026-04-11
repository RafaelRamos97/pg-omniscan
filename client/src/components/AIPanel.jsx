import { useState } from 'react';
import { runAIAnalysis } from '../api';

export default function AIPanel({ analysisId }) {
  const [provider, setProvider] = useState('none');
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (provider === 'none') return;
    if (!apiKey.trim()) {
      setError('Insira a API key do provedor selecionado.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await runAIAnalysis(provider, apiKey, analysisId);
      setResult(res.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-panel">
      <h2>🤖 Análise com Inteligência Artificial</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
        Envie os dados da análise para um LLM e receba recomendações aprofundadas de um DBA virtual.
        Você pode escolher o provedor ou usar sem IA.
      </p>

      <div className="ai-config">
        <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
          <label>Provedor de IA</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="none">🚫 Nenhuma IA (usar regras locais)</option>
            <option value="gemini">🟢 Google Gemini</option>
            <option value="openai">🔵 OpenAI (GPT-4)</option>
          </select>
        </div>

        {provider !== 'none' && (
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-... ou AIza..."
            />
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: 'auto', marginBottom: 20 }}
          onClick={handleAnalyze}
          disabled={loading || provider === 'none'}
        >
          {loading ? '⏳ Analisando com IA...' : '🚀 Analisar com IA'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div className="ai-result">
          {result}
        </div>
      )}

      {provider === 'none' && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
          💡 As recomendações locais (sem IA) já estão disponíveis na aba "Recomendações".
          Selecione um provedor acima para obter uma análise mais detalhada com IA.
        </div>
      )}
    </div>
  );
}
