import { useState } from 'react';

const ProxyMode = ({ mode, config, onModeChange }) => {
  const [currentMode, setCurrentMode] = useState(mode);
  
  const handleModeChange = (newMode) => {
    setCurrentMode(newMode);
    onModeChange(newMode);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Proxy Mode</h2>
      </div>
      <div className="card-content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn ${currentMode === 'development' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleModeChange('development')}
              style={{ flex: 1 }}
            >
              Development
            </button>
            <button 
              className={`btn ${currentMode === 'production' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleModeChange('production')}
              style={{ flex: 1 }}
            >
              Production
            </button>
          </div>
          
          <div style={{ 
            border: '1px solid var(--border-color)', 
            borderRadius: '0.375rem', 
            padding: '1rem', 
            marginTop: '1rem' 
          }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Current Configuration</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <span style={{ fontWeight: '500' }}>Environment:</span>
                <span>{config.server?.env || 'N/A'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <span style={{ fontWeight: '500' }}>Port:</span>
                <span>{config.server?.port || 'N/A'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <span style={{ fontWeight: '500' }}>Host:</span>
                <span>{config.server?.host || 'N/A'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <span style={{ fontWeight: '500' }}>Public URL:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {config.server?.publicUrl || 'N/A'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <span style={{ fontWeight: '500' }}>Log Level:</span>
                <span>{config.server?.logLevel || 'N/A'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <span style={{ fontWeight: '500' }}>n8n Webhook URL:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentMode === 'development' 
                    ? config.n8n?.webhookUrlDev 
                    : config.n8n?.webhookUrl || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProxyMode; 