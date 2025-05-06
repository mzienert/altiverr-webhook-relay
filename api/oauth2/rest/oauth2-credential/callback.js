const https = require('https');
const crypto = require('crypto');

// Provider configurations
const PROVIDERS = {
  google: {
    name: 'Google',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    supportsPkce: true,
    requiresPkce: false,
    defaultScopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly']
  },
  slack: {
    name: 'Slack',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    supportsPkce: false,
    requiresPkce: false,
    defaultScopes: ['channels:read', 'chat:write', 'incoming-webhook']
  }
};

// Configuration
const REDIRECT_URI = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';

/**
 * Base64URL encoding function as per RFC 7636
 * @param {Buffer|string} buffer - The buffer or string to encode
 * @returns {string} The base64url encoded string
 */
function base64URLEncode(buffer) {
  // Ensure buffer is converted to base64 properly
  let base64;
  if (typeof buffer === 'string') {
    base64 = Buffer.from(buffer).toString('base64');
  } else {
    base64 = buffer.toString('base64');
  }
  
  // Convert to base64url encoding
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Creates a code challenge using SHA256 as per RFC 7636
 * @param {string} verifier - The code verifier
 * @returns {string} The code challenge
 */
function generateCodeChallenge(verifier) {
  // Log verifier encoding checks
  console.log('Code verifier type:', typeof verifier);
  console.log('Code verifier length:', verifier.length);
  console.log('Code verifier regex match:', /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier));
  
  // Return SHA256 hash
  return base64URLEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );
}

/**
 * Ensures a code verifier meets RFC 7636 requirements
 * @param {string} verifier - The code verifier to check/fix
 * @returns {string|null} - A valid code verifier or null if it can't be fixed
 */
function ensureValidCodeVerifier(verifier) {
  // Check if verifier is valid
  if (!verifier) return null;
  
  // Check if already valid
  if (/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
    return verifier;
  }
  
  // If it's too short, pad it
  if (verifier.length < 43) {
    // Use the verifier as a seed to generate additional length
    const randomBytes = crypto.createHash('sha256').update(verifier).digest('hex');
    const padding = randomBytes.substring(0, 43 - verifier.length);
    const paddedVerifier = verifier + padding;
    console.log('Padded code_verifier to valid length:', paddedVerifier.length);
    
    // Ensure it's valid now
    if (/^[A-Za-z0-9\-._~]{43,128}$/.test(paddedVerifier)) {
      return paddedVerifier;
    }
  }
  
  // If it contains invalid characters or other issues, return null
  return null;
}

/**
 * Generates a proper OAuth authorization URL with PKCE
 * @param {string} providerKey - The provider key
 * @param {string} codeVerifier - The code verifier to use
 * @param {string[]} [scopes] - Optional scopes to request
 * @returns {string} The authorization URL
 */
function generateAuthUrl(providerKey, codeVerifier, scopes) {
  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
  
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
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
  
  if (provider.supportsPkce) {
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', 'S256');
  }
  
  return `${provider.authUrl}?${params.toString()}`;
}

/**
 * Generates authorization URLs for each provider
 * This is useful for debugging and documentation
 */
function getProviderAuthUrls() {
  const urls = {};
  
  // Generate a valid code verifier
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  
  // Generate URLs for each provider
  Object.keys(PROVIDERS).forEach(key => {
    try {
      const provider = PROVIDERS[key];
      if (provider.supportsPkce) {
        urls[key] = generateAuthUrl(key, codeVerifier);
      } else {
        // For providers without PKCE, generate a simpler URL
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: `[${provider.clientIdEnv}]`, // Placeholder
          redirect_uri: REDIRECT_URI,
          scope: provider.defaultScopes.join(' ')
        });
        urls[key] = `${provider.authUrl}?${params.toString()}`;
      }
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
    return req.query.provider;
  }
  
  // Try to extract from state parameter
  if (req.query.state) {
    try {
      const stateData = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
      if (stateData.provider && PROVIDERS[stateData.provider]) {
        return stateData.provider;
      }
      
      // n8n specific: check for oAuthTokenData which might contain service info
      if (stateData.oAuthTokenData && stateData.oAuthTokenData.service) {
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
    return 'google';
  }
  
  if (req.query.error_description && req.query.error_description.includes('slack')) {
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

    // Parse state for code_verifier (n8n might be sending it here)
    let stateData = {};
    let codeVerifier = null;
    let originalVerifier = null;
    let scopes = null;
    
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('State data contains:', Object.keys(stateData));
        
        // Extract scopes if available
        if (stateData.scopes) {
          scopes = Array.isArray(stateData.scopes) ? stateData.scopes : [stateData.scopes];
        }
        
        // n8n typically stores the code_verifier as "token" in the state
        if (stateData.token) {
          originalVerifier = stateData.token;
          console.log('Found code_verifier in state data (token field):', originalVerifier);
          
          // Ensure it's valid according to RFC 7636
          codeVerifier = ensureValidCodeVerifier(originalVerifier);
          if (codeVerifier) {
            console.log('Using valid code_verifier:', codeVerifier);
            
            // Generate proper code challenge for debugging
            const codeChallenge = generateCodeChallenge(codeVerifier);
            console.log('Generated S256 code challenge:', codeChallenge);
          } else {
            console.log('Could not create valid code_verifier from:', originalVerifier);
          }
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    // Generate a proper authorization URL for debugging
    if (codeVerifier && provider.supportsPkce) {
      const properAuthUrl = generateAuthUrl(providerKey, codeVerifier, scopes);
      console.log('For reference, a proper authorization URL would be:', properAuthUrl);
    }

    // Try different approaches in sequence until one works
    const approaches = [];
    
    // Try standard OAuth without PKCE first
    approaches.push({ name: "Standard OAuth without PKCE", config: { code, provider: providerKey, scopes } });
    
    // If provider supports PKCE and we have a valid code verifier, try PKCE methods
    if (provider.supportsPkce && codeVerifier) {
      approaches.push({ name: "PKCE with S256", config: { code, codeVerifier, provider: providerKey, pkce: true, scopes } });
      
      // Try with original verifier as last resort
      if (originalVerifier !== codeVerifier) {
        approaches.push({ name: "PKCE with original verifier", config: { code, codeVerifier: originalVerifier, provider: providerKey, pkce: true, scopes } });
      }
    }

    let lastError = null;
    let allErrors = [];
    
    // Try each approach in order
    for (const approach of approaches) {
      try {
        console.log(`Attempting ${approach.name}...`);
        const tokenData = await exchangeCodeForToken(approach.config);
        console.log(`${approach.name} succeeded!`);
        return res.json({
          ...tokenData,
          _debug: {
            successMethod: approach.name,
            provider: provider.name
          },
          successfulConnect: true
        });
      } catch (error) {
        console.log(`${approach.name} failed:`, error.message);
        lastError = error;
        allErrors.push({ method: approach.name, error: error.message });
      }
    }
    
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
    
    // If we get here, all approaches failed
    return res.status(200).json({ 
      error: 'OAuth authentication failed', 
      details: `All authentication approaches for ${provider.name} failed`,
      lastError: lastError?.message,
      allErrors,
      debugInfo: {
        provider: provider.name,
        codeVerifierOriginal: originalVerifier,
        codeVerifierLength: originalVerifier ? originalVerifier.length : null,
        codeVerifierFixed: codeVerifier,
        codeVerifierValid: codeVerifier ? /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier) : false,
        receivedCode: code ? code.substring(0, 10) + '...' : null
      },
      recommendedAction,
      requiredSettings,
      successfulConnect: false
    });
    
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
 * @param {string|null} [config.codeVerifier] - The PKCE code verifier if available
 * @param {boolean} [config.pkce] - Whether to use PKCE
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
    
    // Add code_verifier if PKCE is enabled and provider supports it
    if (config.pkce && config.codeVerifier && provider.supportsPkce) {
      data.append('code_verifier', config.codeVerifier);
      console.log('Including code_verifier in token request');
    }
    
    // Add scopes if provided
    if (config.scopes && config.scopes.length > 0) {
      data.append('scope', config.scopes.join(' '));
    }
    
    const pkceStatus = config.pkce ? 'enabled' : 'disabled';
    console.log(`Exchanging code for token with ${provider.name} (PKCE: ${pkceStatus})...`);
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