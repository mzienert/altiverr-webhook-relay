import { useState, useEffect } from 'react';
import LogViewer from './components/LogViewer';
import ProxyStatus from './components/ProxyStatus';
import ProxyMode from './components/ProxyMode';
import { connectSocket, fetchLogs, fetchProxyStatus, fetchProxyConfig, restartProxy, setProxyMode } from './lib/api';

function App() {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({
    state: 'unknown',
    uptime: 'N/A',
    memory: 'N/A',
    cpu: 'N/A',
    port: 'N/A',
    environment: 'N/A',
    publicUrl: 'N/A',
    pid: 'N/A'
  });
  const [config, setConfig] = useState({
    server: {},
    n8n: {}
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toast, setToast] = useState({ visible: false, title: '', message: '', type: 'info' });
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const socket = connectSocket(
      // onConnect
      () => {
        setSocketConnected(true);
        showToast('Connected', 'Successfully connected to the proxy server', 'success');
      },
      // onDisconnect
      (reason) => {
        setSocketConnected(false);
        showToast('Disconnected', `Lost connection to proxy server: ${reason}`, 'error');
      },
      // onLogEvent
      (logData) => {
        setLogs(prev => [logData, ...prev].slice(0, 1000)); // Keep last 1000 logs
      },
      // onStatusUpdate
      (statusData) => {
        setStatus(statusData);
      }
    );

    // Load initial data
    loadData();

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const loadData = async () => {
    try {
      // Fetch logs
      const logsData = await fetchLogs(100);
      setLogs(logsData);

      // Fetch status
      const statusData = await fetchProxyStatus();
      setStatus(statusData);

      // Fetch config
      const configData = await fetchProxyConfig();
      setConfig(configData);
    } catch (error) {
      showToast('Error', 'Failed to load data from proxy server', 'error');
    }
  };

  const handleRestartProxy = async () => {
    try {
      await restartProxy();
      showToast('Proxy Restarted', 'The proxy server has been restarted', 'success');
    } catch (error) {
      showToast('Error', 'Failed to restart proxy server', 'error');
    }
  };

  const handleModeChange = async (mode) => {
    try {
      await setProxyMode(mode);
      showToast('Mode Changed', `Proxy mode changed to ${mode}`, 'success');
      
      // Refresh data
      setTimeout(loadData, 1000);
    } catch (error) {
      showToast('Error', `Failed to change proxy mode to ${mode}`, 'error');
    }
  };

  const showToast = (title, message, type = 'info') => {
    setToast({
      visible: true,
      title,
      message,
      type
    });

    // Auto-hide toast after 5 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000);
  };

  return (
    <div className="container">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1>Proxy Monitor</h1>
            <p>Local monitoring dashboard for the webhook relay proxy</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`status-indicator ${socketConnected ? 'status-connected' : 'status-disconnected'}`}></div>
            <span>{socketConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <div className="tabs">
        <div 
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </div>
        <div 
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Logs
        </div>
        <div 
          className={`tab ${activeTab === 'configuration' ? 'active' : ''}`}
          onClick={() => setActiveTab('configuration')}
        >
          Configuration
        </div>
      </div>
      
      <div className="tab-content">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <ProxyStatus status={status} onRestart={handleRestartProxy} />
            <ProxyMode 
              mode={config.server?.env || 'development'} 
              config={config} 
              onModeChange={handleModeChange} 
            />
          </div>
        )}
        
        {activeTab === 'logs' && (
          <LogViewer logs={logs} />
        )}
        
        {activeTab === 'configuration' && (
          <div>
            <div className="card">
              <h2 className="card-title">Current Configuration</h2>
              <pre className="mt-4" style={{ 
                overflow: 'auto', 
                backgroundColor: '#f8f8f8', 
                padding: '1rem', 
                borderRadius: '0.375rem',
                color: '#333'
              }}>
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {toast.visible && (
        <div className={`toast toast-${toast.type}`} style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          backgroundColor: 'var(--card-bg)',
          borderLeft: toast.type === 'error' ? '4px solid var(--error-color)' : 
                      toast.type === 'success' ? '4px solid var(--success-color)' : 
                      '4px solid var(--accent-color)',
          padding: '1rem',
          borderRadius: '0.375rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          maxWidth: '350px',
          zIndex: 50
        }}>
          <div className="flex justify-between items-center">
            <strong>{toast.title}</strong>
            <button 
              onClick={() => setToast(prev => ({ ...prev, visible: false }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}
            >
              &times;
            </button>
          </div>
          <p>{toast.message}</p>
        </div>
      )}
    </div>
  );
}

export default App;
