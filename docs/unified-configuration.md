# Unified Configuration System

## Overview

The configuration system has been unified to eliminate duplication and reduce maintenance overhead between the API and Proxy services. Both services now share a single source of truth for configuration while maintaining service-specific settings.

## Architecture

### Single Shared Configuration

All configuration is now centralized in:
- `shared/config/env.js` - Single source of truth for all configuration

### Service-Specific Adapters

Each service imports only what it needs:
- `src/config/env.js` - API service adapter (uses `getApiConfig()`)
- `proxy/config/env.js` - Proxy service adapter (uses `getProxyConfig()`)

## Configuration Structure

### Shared Configuration

**AWS Settings** - Used by both services:
```javascript
aws: {
  region: process.env.AWS_REGION || 'us-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  snsTopicArn: process.env.SNS_TOPIC_ARN
}
```

**n8n Settings** - Used by both services:
```javascript
n8n: {
  webhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
  webhookUrlDev: process.env.N8N_WEBHOOK_URL_DEV || 'http://localhost:5678/webhook-test',
  calendly: { /* Calendly-specific URLs */ },
  slack: { /* Slack-specific URLs */ },
  timeout: parseInt(process.env.N8N_TIMEOUT || '10000', 10)
}
```

**Common Settings** - Shared utilities:
```javascript
common: {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production'
}
```

### Service-Specific Configuration

**API Service Only:**
```javascript
api: {
  port: parseInt(process.env.API_PORT || process.env.PORT || '8080', 10),
  host: process.env.API_HOST || 'localhost'
},
security: {
  webhookSecret: process.env.WEBHOOK_SECRET
},
calendly: {
  webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET
},
slack: {
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appId: process.env.SLACK_APP_ID,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET
}
```

**Proxy Service Only:**
```javascript
proxy: {
  port: parseInt(process.env.PROXY_PORT || process.env.PORT || '3333', 10),
  host: process.env.PROXY_HOST || '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3333'
},
notifications: {
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  notifyOnStart: process.env.NOTIFY_ON_START === 'true',
  notifyOnError: process.env.NOTIFY_ON_ERROR === 'true'
}
```

## Usage

### API Service

```javascript
// src/config/env.js
import { getApiConfig, debugConfig } from '../../shared/config/env.js';

const env = getApiConfig();
debugConfig('API Service');

export default env;
```

**Available Configuration:**
- `env.aws` - AWS settings
- `env.api` - API service settings
- `env.security` - Security settings
- `env.calendly` - Calendly settings
- `env.slack` - Slack settings
- `env.n8n` - n8n settings
- `env.server` - Legacy server settings
- `env.common` - Common utilities

### Proxy Service

```javascript
// proxy/config/env.js
import { getProxyConfig, debugConfig } from '../../shared/config/env.js';

const env = getProxyConfig();
debugConfig('Proxy Service');

export default env;
```

**Available Configuration:**
- `env.aws` - AWS settings
- `env.server` - Proxy server settings (mapped from proxy config)
- `env.n8n` - n8n settings
- `env.notifications` - Notification settings
- `env.common` - Common utilities

## Environment Variables

### Service-Specific Ports

To avoid conflicts, you can use service-specific port variables:

```bash
# API Service
API_PORT=8080
API_HOST=localhost

# Proxy Service  
PROXY_PORT=3333
PROXY_HOST=0.0.0.0

# Fallback (used by both if service-specific not set)
PORT=8080
HOST=localhost
```

### Shared Variables

These are used by both services:

```bash
# AWS Configuration
AWS_REGION=us-west-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
SNS_TOPIC_ARN=arn:aws:sns:region:account:topic

# n8n Configuration
N8N_WEBHOOK_URL=http://localhost:5678/webhook
N8N_WEBHOOK_URL_DEV=http://localhost:5678/webhook-test
N8N_SLACK_WEBHOOK_ID=your-slack-webhook-id
N8N_TIMEOUT=10000

# Common Settings
NODE_ENV=development
LOG_LEVEL=info
```

### API Service Only

```bash
# Security
WEBHOOK_SECRET=your_webhook_secret
CALENDLY_WEBHOOK_SECRET=your_calendly_secret

# Slack Integration
SLACK_SIGNING_SECRET=your_slack_secret
SLACK_APP_ID=your_app_id
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
```

### Proxy Service Only

```bash
# Proxy Settings
PUBLIC_URL=https://your-domain.com

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/your/webhook
NOTIFY_ON_START=true
NOTIFY_ON_ERROR=true
```

## Benefits

1. **Single Source of Truth**: All configuration in one place
2. **Reduced Duplication**: Eliminated ~100 lines of duplicate config code
3. **Consistent Defaults**: Same defaults across both services
4. **Service Isolation**: Each service only gets what it needs
5. **Easy Maintenance**: Changes only needed in one place
6. **Environment Flexibility**: Support for service-specific overrides

## Migration Guide

### Before (Duplicated)
```javascript
// src/config/env.js - 73 lines
const env = {
  aws: { /* duplicate config */ },
  n8n: { /* duplicate config */ },
  // ... more duplicated settings
};

// proxy/config/env.js - 60 lines  
const env = {
  aws: { /* duplicate config */ },
  n8n: { /* duplicate config */ },
  // ... more duplicated settings
};
```

### After (Unified)
```javascript
// shared/config/env.js - Single source of truth
const env = { /* all configuration */ };

// src/config/env.js - 10 lines
import { getApiConfig } from '../../shared/config/env.js';
const env = getApiConfig();

// proxy/config/env.js - 10 lines
import { getProxyConfig } from '../../shared/config/env.js';
const env = getProxyConfig();
```

## Testing

Test the unified configuration:

```bash
# Test shared config
node -e "import { getApiConfig, getProxyConfig } from './shared/config/env.js'; console.log('✅ Works');"

# Test service configs
node -c src/config/env.js
node -c proxy/config/env.js
```

## Adding New Configuration

To add new configuration:

1. **Shared Settings**: Add to `shared/config/env.js` main config object
2. **Service-Specific**: Add to appropriate service section
3. **Update Helpers**: Modify `getApiConfig()` or `getProxyConfig()` as needed
4. **Environment Variables**: Document new variables in this file

## Debugging

The system includes automatic debug logging in development:

```javascript
debugConfig('Service Name');
```

This will output:
- Environment variables status
- Configuration values
- Service-specific settings
- Missing required variables

Only runs in development mode for security. 