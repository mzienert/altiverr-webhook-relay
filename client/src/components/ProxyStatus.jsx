import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

const ProxyStatus = ({ status, onRestart }) => {
  const getStatusClass = () => {
    switch (status.state) {
      case 'running':
        return 'bg-success';
      case 'stopped':
        return 'bg-error';
      case 'restarting':
        return 'bg-warning';
      default:
        return 'bg-neutral';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Proxy Status</CardTitle>
        <Button onClick={onRestart} variant="outline" size="sm">
          Restart Proxy
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status:</span>
              <span style={{ 
                padding: '0.25rem 0.5rem', 
                borderRadius: '9999px', 
                fontSize: '0.75rem', 
                fontWeight: '600',
                backgroundColor: status.state === 'running' ? 'var(--success-color)' : 
                                status.state === 'stopped' ? 'var(--error-color)' : 
                                status.state === 'restarting' ? 'var(--warning-color)' : 
                                '#6b7280',
                color: 'white'
              }}>
                {status.state?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Uptime:</span>
              <span className="text-sm">{status.uptime || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Memory Usage:</span>
              <span className="text-sm">{status.memory || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">CPU Usage:</span>
              <span className="text-sm">{status.cpu || 'N/A'}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Port:</span>
              <span className="text-sm">{status.port || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Environment:</span>
              <span className="text-sm">{status.environment || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Public URL:</span>
              <span style={{ 
                fontSize: '0.875rem', 
                maxWidth: '200px', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>
                {status.publicUrl || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Process ID:</span>
              <span className="text-sm">{status.pid || 'N/A'}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProxyStatus; 