n8n: {
  webhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678',
  webhookEndpoint: process.env.N8N_WEBHOOK_ENDPOINT || 'webhook',
  webhookPath: process.env.N8N_WEBHOOK_PATH || '/calendly',
  timeout: parseInt(process.env.N8N_TIMEOUT || '10000', 10) // 10 seconds default
} 