import { useState, useEffect } from 'react';
import ConnectForm from './components/ConnectForm';
import Dashboard from './components/Dashboard';
import { checkConnectionStatus } from './api';

function App() {
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Efeito de Inicialização: Restaura sessão se houver conexão ativa no backend
  useEffect(() => {
    async function restoreSession() {
      try {
        const status = await checkConnectionStatus();
        if (status.connected) {
          console.log('Sessão restaurada no backend:', status.config);
          setConnectionInfo(status);
        }
      } catch (err) {
        console.error('Erro ao verificar status da conexão:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    restoreSession();
  }, []);

  const handleConnect = (info) => {
    setConnectionInfo(info);
  };

  const handleDisconnect = () => {
    setConnectionInfo(null);
  };

  if (isInitializing) {
    return (
      <div className="login-container" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-dark)'
      }}>
        <div className="spinner"></div>
        <p style={{ marginTop: 20, color: 'var(--text-muted)', fontSize: '14px' }}>Verificando conexão ativa...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {connectionInfo ? (
        <Dashboard connectionInfo={connectionInfo} onDisconnect={handleDisconnect} />
      ) : (
        <ConnectForm onConnected={handleConnect} />
      )}
    </div>
  );
}

export default App;
