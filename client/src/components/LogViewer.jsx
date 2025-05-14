import { useState, useEffect } from 'react';

const LogViewer = ({ logs }) => {
  const [filter, setFilter] = useState('all');
  const [filteredLogs, setFilteredLogs] = useState([]);

  useEffect(() => {
    if (filter === 'all') {
      setFilteredLogs(logs);
    } else {
      setFilteredLogs(logs.filter(log => log.level === filter));
    }
  }, [logs, filter]);

  const getLogClass = (level) => {
    switch (level) {
      case 'error':
        return 'log-error';
      case 'warn':
        return 'log-warn';
      case 'info':
        return 'log-info';
      case 'debug':
        return 'log-debug';
      default:
        return '';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Logs</h2>
        <div className="flex">
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '0.375rem 0.75rem',
              border: '1px solid var(--border-color)',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--background-color)',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </div>
      <div className="card-content">
        <div className="log-viewer">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <div key={index} className={getLogClass(log.level)} style={{ marginBottom: '0.5rem' }}>
                <span style={{ opacity: 0.7 }}>[{new Date(log.timestamp).toLocaleString()}]</span> 
                <span style={{ fontWeight: 'bold' }}> [{log.level.toUpperCase()}]</span>: 
                <span> {log.message}</span>
                {log.meta && Object.keys(log.meta).length > 0 && (
                  <div style={{ paddingLeft: '1rem', fontSize: '0.75rem', opacity: 0.8 }}>
                    {JSON.stringify(log.meta)}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#777' }}>No logs available</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogViewer; 