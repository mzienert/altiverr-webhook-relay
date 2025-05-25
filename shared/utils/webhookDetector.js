/**
 * Shared webhook detection utility
 * Used by both API and Proxy services to eliminate code duplication
 */

/**
 * Detect webhook type from Express request object
 * @param {Object} req - Express request object
 * @returns {Object} Detection result with type and confidence
 */
export function detectWebhookFromRequest(req) {
  const headers = req.headers || {};
  const body = req.body || {};
  
  // SLACK DETECTION - multiple strong indicators
  const slackIndicators = {
    // Header-based detection (strongest)
    hasSlackSignature: !!headers['x-slack-signature'],
    hasSlackTimestamp: !!headers['x-slack-request-timestamp'],
    hasSlackUserAgent: headers['user-agent']?.includes('Slackbot'),
    
    // Payload-based detection (strong)
    hasEventCallback: body?.type === 'event_callback',
    hasUrlVerification: body?.type === 'url_verification',
    hasTeamId: !!body?.team_id,
    hasSlackEvent: !!body?.event,
    hasSlackChannel: !!body?.event?.channel,
    hasSlackEventType: ['message', 'app_mention'].includes(body?.event?.type)
  };
  
  const slackScore = Object.values(slackIndicators).filter(Boolean).length;
  
  if (slackScore >= 2 || slackIndicators.hasSlackSignature) {
    return {
      type: 'slack',
      confidence: slackScore >= 4 ? 'high' : (slackScore >= 2 ? 'medium' : 'low'),
      indicators: slackIndicators,
      details: {
        eventType: body?.event?.type,
        isUserMessage: body?.event?.type === 'message' && !body?.event?.bot_id && !!body?.event?.user,
        teamId: body?.team_id,
        channel: body?.event?.channel
      }
    };
  }
  
  // CALENDLY DETECTION - multiple strong indicators
  const calendlyIndicators = {
    // Header-based detection (strong)
    hasCalendlySignature: !!headers['calendly-webhook-signature'],
    hasCalendlyUserAgent: headers['user-agent']?.includes('Calendly'),
    
    // Payload-based detection (strong)
    hasInviteeCreated: body?.event === 'invitee.created',
    hasInviteeCanceled: body?.event === 'invitee.canceled',
    hasCalendlyStructure: !!(body?.event && body?.payload?.event_type?.uri),
    hasCalendlyKind: body?.payload?.event_type?.kind === 'calendly',
    hasCalendlyEvent: typeof body?.event === 'string' && body?.event?.includes('calendly')
  };
  
  const calendlyScore = Object.values(calendlyIndicators).filter(Boolean).length;
  
  if (calendlyScore >= 1) {
    return {
      type: 'calendly',
      confidence: calendlyScore >= 3 ? 'high' : (calendlyScore >= 2 ? 'medium' : 'low'),
      indicators: calendlyIndicators,
      details: {
        event: body?.event,
        uri: body?.payload?.uri || body?.payload?.invitee?.uri,
        eventType: body?.payload?.event_type
      }
    };
  }
  
  // Could not determine with confidence
  return {
    type: 'unknown',
    confidence: 'none',
    indicators: {},
    details: {
      userAgent: headers['user-agent'],
      contentType: headers['content-type'],
      bodyType: body?.type,
      bodyEvent: body?.event,
      bodyKeys: Object.keys(body)
    }
  };
}

/**
 * Detect webhook type from raw data payload (for SNS processing)
 * @param {Object} data - Raw webhook payload data
 * @returns {Object} Detection result with type and metadata
 */
export function detectWebhookFromPayload(data) {
  // Early return if data is empty or invalid
  if (!data) {
    return { 
      type: 'unknown', 
      confidence: 'none',
      dataType: typeof data, 
      dataKeys: [] 
    };
  }
  
  // Extract metadata for inspection
  const dataType = typeof data;
  const dataKeys = data ? Object.keys(data) : [];
  
  // Handle string data (assuming it might be stringified JSON)
  let parsedData = data;
  if (dataType === 'string' && data.trim().startsWith('{')) {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      // Not valid JSON string, continue with original data
    }
  }
  
  // Check for SNS wrapper structure first
  if (parsedData?.Message && typeof parsedData.Message === 'string') {
    try {
      const innerMessage = JSON.parse(parsedData.Message);
      
      // Check for our SNS metadata wrapper structure
      if (innerMessage?.data?.metadata?.source) {
        const source = innerMessage.data.metadata.source;
        const originalPayload = innerMessage.data.payload?.original || {};
        
        return {
          type: source,
          confidence: 'high',
          isSNS: true,
          dataType: typeof originalPayload,
          dataKeys: Object.keys(originalPayload),
          originalMessage: originalPayload,
          details: {
            hasEvent: !!originalPayload.event,
            source: source,
            extractedFromSNS: true
          }
        };
      }
    } catch (e) {
      // Not a valid JSON string in Message field, continue with other checks
    }
  }
  
  // Direct payload detection (not wrapped in SNS)
  if (parsedData && typeof parsedData === 'object') {
    // SLACK DETECTION - Direct payload
    const hasSlackType = parsedData.type === 'event_callback' || parsedData.type === 'url_verification';
    const hasEventField = !!parsedData.event;
    const hasEventType = ['message', 'app_mention'].includes(parsedData.event?.type);
    const hasTeamID = !!parsedData.team_id;
    const hasChannelField = !!parsedData.event?.channel;
    
    if ((hasSlackType && hasEventField) || 
        (hasEventField && hasEventType && hasTeamID) ||
        (hasEventField && hasChannelField && hasTeamID)) {
      
      const isUserMessage = parsedData.event?.type === 'message' && 
                           !parsedData.event?.bot_id && 
                           parsedData.event?.user;
      
      return {
        type: 'slack',
        confidence: 'high',
        isSNS: false,
        dataType: typeof parsedData,
        dataKeys,
        details: {
          hasEvent: hasEventField,
          isManualMessage: isUserMessage,
          eventType: parsedData.event?.type,
          teamId: parsedData.team_id,
          channel: parsedData.event?.channel,
          user: parsedData.event?.user
        }
      };
    }
    
    // CALENDLY DETECTION - Direct payload
    if (parsedData.event === 'invitee.created' || 
        parsedData.event === 'invitee.canceled' || 
        (parsedData.payload?.event_type?.kind === 'calendly')) {
      
      return {
        type: 'calendly',
        confidence: 'high',
        isSNS: false,
        dataType: typeof parsedData,
        dataKeys,
        details: {
          event: parsedData.event,
          uri: parsedData.payload?.uri || parsedData.payload?.invitee?.uri,
          eventType: parsedData.payload?.event_type
        }
      };
    }
  }
  
  // If no specific source detected, return unknown
  return {
    type: 'unknown',
    confidence: 'none',
    isSNS: false,
    dataType,
    dataKeys,
    details: {
      couldNotDetermine: true,
      dataPreview: JSON.stringify(data).substring(0, 200)
    }
  };
}

/**
 * Legacy compatibility function for simple type detection
 * @param {Object} req - Express request object
 * @returns {string|null} Webhook type or null
 */
export function detectWebhookType(req) {
  const result = detectWebhookFromRequest(req);
  return result.type !== 'unknown' ? result.type : null;
}

/**
 * Legacy compatibility function for payload-based detection
 * @param {Object} data - Raw webhook payload data
 * @returns {Object} Detection result
 */
export function detectWebhookSource(data) {
  const result = detectWebhookFromPayload(data);
  return {
    source: result.type,
    dataType: result.dataType,
    dataKeys: result.dataKeys,
    isSNS: result.isSNS || false,
    hasEvent: result.details?.hasEvent || false,
    isManualMessage: result.details?.isManualMessage || false,
    originalMessage: result.originalMessage
  };
}

export default {
  detectWebhookFromRequest,
  detectWebhookFromPayload,
  detectWebhookType,
  detectWebhookSource
}; 