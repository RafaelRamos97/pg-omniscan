export default function StreamingConsole({ progress, onCancel }) {
  return (
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
          onClick={onCancel}
          style={{ padding: '10px 24px', fontSize: 13, borderColor: 'rgba(255,255,255,0.1)' }}
        >
          🛑 Cancelar Análise
        </button>
        
        <div style={{ marginTop: 20, color: 'var(--text-muted)', fontSize: 11 }}>
          🔒 Garantia Read-Only: Verificando assinaturas SELECT...
        </div>
      </div>
    </div>
  );
}
