const https = require('https');

// Provider configurations
const PROVIDERS = {
  google: {
    name: 'Google',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    defaultScopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly']
  },
  slack: {
    name: 'Slack',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    defaultScopes: ['channels:read', 'chat:write', 'incoming-webhook']
  }
};

// Configuration
const REDIRECT_URI = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';

/**
 * Generates an authorization URL for a provider
 * @param {string} providerKey - The provider key
 * @param {string[]} [scopes] - Optional scopes to request
 * @returns {string} The authorization URL
 */
function generateAuthUrl(providerKey, scopes) {
  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env[provider.clientIdEnv],
    redirect_uri: REDIRECT_URI
  });
  
  // Add scopes if provided, otherwise use defaults
  const scopesToUse = scopes || provider.defaultScopes;
  if (scopesToUse && scopesToUse.length > 0) {
    params.append('scope', scopesToUse.join(' '));
  }
  
  return `${provider.authUrl}?${params.toString()}`;
}

/**
 * Generates authorization URLs for each provider
 * This is useful for debugging and documentation
 */
function getProviderAuthUrls() {
  const urls = {};
  
  // Generate URLs for each provider
  Object.keys(PROVIDERS).forEach(key => {
    try {
      const provider = PROVIDERS[key];
      // Generate a simple URL
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: `[${provider.clientIdEnv}]`, // Placeholder
        redirect_uri: REDIRECT_URI,
        scope: provider.defaultScopes.join(' ')
      });
      urls[key] = `${provider.authUrl}?${params.toString()}`;
    } catch (e) {
      urls[key] = `Error: ${e.message}`;
    }
  });
  
  return urls;
}

/**
 * Detect the OAuth provider from the request
 * @param {Object} req - The request object
 * @returns {string|null} - The provider key or null if not detected
 */
function detectProvider(req) {
  // Check if the provider is explicitly specified in the query
  if (req.query.provider && PROVIDERS[req.query.provider]) {
    console.log('Provider explicitly specified:', req.query.provider);
    return req.query.provider;
  }
  
  // Try to extract from state parameter
  if (req.query.state) {
    try {
      const stateData = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
      if (stateData.provider && PROVIDERS[stateData.provider]) {
        console.log('Provider extracted from state:', stateData.provider);
        return stateData.provider;
      }
      
      // n8n specific: check for oAuthTokenData which might contain service info
      if (stateData.oAuthTokenData && stateData.oAuthTokenData.service) {
        console.log('oAuthTokenData found in state:', stateData.oAuthTokenData);
        const service = stateData.oAuthTokenData.service.toLowerCase();
        if (service.includes('google')) return 'google';
        if (service.includes('slack')) return 'slack';
      }
    } catch (e) {
      console.log('Error parsing state:', e);
    }
  }

  // Check common patterns in the query parameters
  if (req.query.error_uri && req.query.error_uri.includes('google')) {
    console.log('Google error detected in query parameters');
    return 'google';
  }
  
  if (req.query.error_description && req.query.error_description.includes('slack')) {
    console.log('Slack error detected in query parameters');
    return 'slack';
  }
  
  // Default to Google for most common usage
  return 'google';
}

export default async function handler(req, res) {
  // Handle special debug endpoint
  if (req.query.debug === 'auth_urls') {
    return res.json({
      debug: "Auth URL generation for testing",
      providers: getProviderAuthUrls(),
      redirectUri: REDIRECT_URI
    });
  }
  
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received callback:', req.query);
    
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Detect which provider we're working with
    const providerKey = detectProvider(req);
    const provider = PROVIDERS[providerKey];
    
    console.log(`Detected OAuth provider: ${provider.name}`);

    // Parse state for additional information
    let stateData = {};
    let scopes = null;
    
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('State data contains:', Object.keys(stateData));
        
        // Extract scopes if available
        if (stateData.scopes) {
          scopes = Array.isArray(stateData.scopes) ? stateData.scopes : [stateData.scopes];
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    try {
      console.log('Attempting OAuth code exchange...');
      const tokenData = await exchangeCodeForToken({
        code,
        provider: providerKey,
        scopes
      });
      
      console.log('OAuth code exchange succeeded!');
      return res.json({
        ...tokenData,
        _debug: {
          provider: provider.name
        },
        successfulConnect: true
      });
    } catch (error) {
      console.log(`OAuth code exchange failed:`, error.message);
      
      // Provider-specific error messages
      let recommendedAction = "";
      let requiredSettings = [];
      
      if (providerKey === 'google') {
        recommendedAction = "Make sure you have configured the OAuth consent screen and enabled the required APIs:";
        requiredSettings = [
          "Google Sheets API",
          "Google Drive API",
          "Make sure your authorized redirect URI is correctly set"
        ];
      } else if (providerKey === 'slack') {
        recommendedAction = "Ensure your Slack app is configured correctly:";
        requiredSettings = [
          "Add the OAuth Redirect URL in your Slack app settings",
          "Ensure you have the required scopes"
        ];
      }
      
      return res.status(200).json({ 
        error: 'OAuth authentication failed', 
        details: `Authentication for ${provider.name} failed`,
        errorMessage: error.message,
        debugInfo: {
          provider: provider.name,
          scopes: scopes || provider.defaultScopes,
          receivedCode: code ? code.substring(0, 10) + '...' : null
        },
        recommendedAction,
        requiredSettings,
        successfulConnect: false
      });
    }
    
  } catch (error) {
    console.error('OAuth error:', error);
    return res.status(500).json({ 
      error: 'OAuth authentication failed', 
      details: error.message 
    });
  }
}

/**
 * Exchange authorization code for an access token
 * @param {Object} config - Configuration for the token exchange
 * @param {string} config.code - The authorization code
 * @param {string} config.provider - The provider key
 * @param {string[]} [config.scopes] - OAuth scopes to request
 */
async function exchangeCodeForToken(config) {
  return new Promise((resolve, reject) => {
    const provider = PROVIDERS[config.provider];
    if (!provider) {
      return reject(new Error(`Unknown provider: ${config.provider}`));
    }
    
    // Create form data
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: config.code,
      client_id: process.env[provider.clientIdEnv],
      client_secret: process.env[provider.clientSecretEnv],
      redirect_uri: REDIRECT_URI
    });
    
    // Add scopes if provided
    if (config.scopes && config.scopes.length > 0) {
      data.append('scope', config.scopes.join(' '));
    }
    
    console.log(`Exchanging code for token with ${provider.name}...`);
    console.log('Request data:', data.toString());
    
    // Parse token URL
    const url = new URL(provider.tokenUrl);
    
    // Request options
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data.toString()),
        'Accept': 'application/json'
      }
    };
    
    // Make request
    const req = https.request(options, (res) => {
      let responseData = '';
      
      console.log('Token request status:', res.statusCode);
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          let parsedData;
          try {
            parsedData = JSON.parse(responseData);
          } catch (e) {
            // Some providers might not return valid JSON
            console.error('Failed to parse response as JSON:', responseData);
            reject(new Error('Failed to parse token response'));
            return;
          }
          
          if (res.statusCode !== 200) {
            console.error('Token response error:', res.statusCode, parsedData);
            if (parsedData.error) {
              reject(new Error(parsedData.error_description || parsedData.error));
            } else {
              reject(new Error(`Request failed with status: ${res.statusCode}`));
            }
            return;
          }
          
          console.log('Token received successfully:', {
            has_access_token: !!parsedData.access_token,
            has_refresh_token: !!parsedData.refresh_token,
            token_type: parsedData.token_type
          });
          
          // Add provider info to the token data
          parsedData.provider = provider.name;
          
          resolve(parsedData);
        } catch (error) {
          console.error('Error handling token response', error);
          reject(new Error('Failed to handle token response'));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
    
    req.write(data.toString());
    req.end();
  });
} 