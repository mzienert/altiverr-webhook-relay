# Shared Webhook Detection System

## Overview

The webhook detection system has been centralized into a single shared utility to eliminate code duplication and provide consistent webhook type detection across both the API service and Proxy service.

## Architecture

### Single Shared Detection Logic

Both services now use the same webhook detection utility located at:
- `shared/utils/webhookDetector.js` - Single source of truth for all webhook detection

### Import Paths

**API Service:**
```javascript
import { detectWebhookFromRequest } from '../../shared/utils/webhookDetector.js';
```

**Proxy Service:**
```javascript
import { detectWebhookFromRequest } from '../../../shared/utils/webhookDetector.js';
```

### Usage Patterns

**API Service** - Primarily uses request-based detection:
- Receives direct webhooks from external services
- Uses `detectWebhookFromRequest(req)` for Express request objects
- Routes based on detected webhook type

**Proxy Service** - Minimal detection usage:
- Primarily processes SNS messages with embedded metadata
- SNS messages already contain `data.metadata.source` 
- Only uses detection for rare "direct webhook" edge cases

## Core Functions

#### `detectWebhookFromRequest(req)`
**Purpose**: Detect webhook type from Express request objects  
**Primary Use**: API service for incoming webhooks  
**Input**: Express request object with headers and body  
**Output**: Detailed detection result with confidence scoring

```javascript
{
  type: 'slack' | 'calendly' | 'unknown',
  confidence: 'high' | 'medium' | 'low' | 'none',
  indicators: { /* detection flags */ },
  details: { /* webhook-specific information */ }
}
```

#### `detectWebhookFromPayload(data)`
**Purpose**: Detect webhook type from raw data payloads  
**Primary Use**: Proxy service for SNS processing edge cases  
**Input**: Raw webhook payload data  
**Output**: Detection result with SNS metadata

```javascript
{
  type: 'slack' | 'calendly' | 'unknown',
  confidence: 'high' | 'medium' | 'low' | 'none',
  isSNS: boolean,
  dataType: string,
  dataKeys: string[],
  originalMessage?: Object, // If extracted from SNS
  details: { /* webhook-specific information */ }
}
```

## Detection Criteria

### Slack Webhooks

**High Confidence Indicators:**
- `x-slack-signature` header present
- `x-slack-request-timestamp` header present
- `type: 'event_callback'` in payload
- `type: 'url_verification'` in payload

**Medium Confidence Indicators:**
- `team_id` field present
- `event` object with `channel` field
- `event.type` is 'message' or 'app_mention'

**Low Confidence Indicators:**
- User-Agent contains 'Slackbot'

### Calendly Webhooks

**High Confidence Indicators:**
- `calendly-webhook-signature` header present
- `event: 'invitee.created'` in payload
- `event: 'invitee.canceled'` in payload
- `payload.event_type.kind === 'calendly'`

**Medium Confidence Indicators:**
- Structured event with `payload.event_type.uri`
- User-Agent contains 'Calendly'

**Low Confidence Indicators:**
- Event string contains 'calendly'

### SNS Wrapped Webhooks

The system automatically detects and extracts webhooks wrapped in SNS messages:

```javascript
{
  Message: JSON.stringify({
    data: {
      metadata: { source: 'slack' | 'calendly' },
      payload: { original: /* actual webhook payload */ }
    }
  })
}
```

## Usage Examples

### API Service (Primary Usage)

```javascript
import { detectWebhookFromRequest } from '../../shared/utils/webhookDetector.js';

router.post('/webhook', (req, res) => {
  const detection = detectWebhookFromRequest(req);
  
  if (detection.type === 'slack') {
    return slackController.handleSlackWebhook(req, res);
  } else if (detection.type === 'calendly') {
    return calendlyController.handleCalendlyWebhook(req, res);
  }
  
  // Handle unknown webhook type
});
```

### Proxy Service (Minimal Usage)

```javascript
import { detectWebhookSource } from '../../../shared/utils/webhookDetector.js';

async function forwardToN8n({ data, source }) {
  // Most SNS messages already have source in metadata
  // Only use detection as fallback for edge cases
  let webhookSource = source ? { source } : detectWebhookSource(data);
  
  // Route based on detected source
  const n8nUrl = webhookSource.source === 'slack' 
    ? env.n8n.slack.webhookUrl 
    : env.n8n.webhookUrl;
}
```

## Legacy Compatibility

The system provides backward-compatible functions for existing code:

- `detectWebhookType(req)` → Returns simple string type or null
- `detectWebhookSource(data)` → Returns legacy object format

## Benefits

1. **Single Source of Truth**: One file to maintain for all detection logic
2. **Consistency**: Identical detection across all services
3. **Reduced Complexity**: Proxy service rarely needs detection since SNS provides metadata
4. **Maintainability**: Changes only need to be made in one place
5. **Performance**: Optimized detection with early returns

## Architecture Insight

**Why This Works:**
- **API Service**: Receives raw webhooks → needs detection
- **Proxy Service**: Receives SNS messages → metadata already provided
- **Shared Logic**: Same detection rules when needed

**SNS Flow Eliminates Most Detection:**
```
External Service → API Service → SNS (with metadata) → Proxy Service → n8n
                     ↓                    ↓
               Detection here      No detection needed
```

## Adding New Webhook Types

To add support for a new webhook type:

1. Add detection criteria to `shared/utils/webhookDetector.js`
2. Update both detection functions
3. Update type union types in return objects
4. Add test cases to verify detection accuracy
5. Update this documentation

## Testing

The detection system includes comprehensive test coverage for:
- Header-based detection (Slack signatures, Calendly signatures)
- Payload-based detection (event types, structure patterns)
- SNS wrapper extraction
- Confidence scoring accuracy
- Unknown webhook handling

Test the shared detector:
```bash
node -e "import { detectWebhookType } from './shared/utils/webhookDetector.js'; console.log('✅ Works');"
``` 