import { useState } from 'react';
import { connectDB } from '../api';

export default function ConnectForm({ onConnected }) {
  const [form, setForm] = useState({
    host: 'localhost',
    port: '5432',
    database: '',
    user: 'postgres',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await connectDB(form);
      onConnected({ ...result, config: form });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-page">
      <form className="connect-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 48 }}>🐘</span>
        </div>
        <h2>PG Health Analyzer</h2>
        <p>Conecte ao seu banco PostgreSQL para iniciar a análise de saúde.</p>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="host">Host</label>
            <input id="host" type="text" name="host" value={form.host} onChange={handleChange} placeholder="localhost" />
          </div>
          <div className="form-group">
            <label htmlFor="port">Porta</label>
            <input id="port" type="number" name="port" value={form.port} onChange={handleChange} placeholder="5432" />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="database">Database</label>
          <input id="database" type="text" name="database" value={form.database} onChange={handleChange} placeholder="minha_base" required />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="user">Usuário</label>
            <input id="user" type="text" name="user" value={form.user} onChange={handleChange} placeholder="postgres" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
            ⚠️ {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '⏳ Conectando...' : '🔌 Conectar ao Banco'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          🔒 Somente comandos SELECT serão executados. Garantia read-only.
        </div>
      </form>
    </div>
  );
}
