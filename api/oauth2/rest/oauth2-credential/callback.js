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
const DEBUG_MODE = true; // Enable detailed logging

/**
 * Enhanced logging function that provides more context
 */
function log(...args) {
  if (DEBUG_MODE) {
    console.log(`[OAuth Debug ${new Date().toISOString()}]`, ...args);
  }
}

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
  
  // Log request details
  log('OAuth Callback Request Headers:', req.headers);
  log('OAuth Callback Request Query:', req.query);
  log('OAuth Callback User Agent:', req.headers['user-agent']);
  log('OAuth Callback Referrer:', req.headers['referer']);
  
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    log('Received callback:', req.query);
    
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Detect which provider we're working with
    const providerKey = detectProvider(req);
    const provider = PROVIDERS[providerKey];
    
    log(`Detected OAuth provider: ${provider.name}`);

    // Parse state for additional information
    let stateData = {};
    let scopes = null;
    let isN8n = false;
    
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        log('State data contains:', Object.keys(stateData));
        log('Full state data:', stateData);
        
        // Check if this is an n8n request
        isN8n = stateData.oAuthTokenData || 
                stateData.n8n || 
                (stateData.cid && stateData.cid.length > 5);
        
        log('Is n8n request:', isN8n);
        
        // Extract scopes if available
        if (stateData.scopes) {
          scopes = Array.isArray(stateData.scopes) ? stateData.scopes : [stateData.scopes];
        }
      } catch (e) {
        log('Error parsing state:', e);
      }
    }

    try {
      log('Attempting OAuth code exchange...');
      const tokenData = await exchangeCodeForToken({
        code,
        provider: providerKey,
        scopes
      });
      
      // Extract the credential ID if present in state data
      const credentialId = stateData && stateData.cid ? stateData.cid : null;
      log('Credential ID from state:', credentialId);
      
      // Format tokens in the exact n8n expected structure
      // This is critical to ensure n8n recognizes the successful auth
      const responseData = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        
        // n8n specific data structure - this should match their expected format exactly
        oauthTokenData: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          scope: tokenData.scope,
          token_type: tokenData.token_type,
          expiry_date: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
          id_token: tokenData.id_token
        },
        
        // These flags trigger n8n to recognize success
        oauthCallbackReceived: true,
        successfulConnect: true,
        
        // Include the credential ID if available
        ...(credentialId ? { credentialId } : {})
      };
      
      // Log the response for debugging
      log('Sending formatted n8n response with these token details:');
      log('- access_token exists:', !!responseData.access_token);
      log('- refresh_token exists:', !!responseData.refresh_token);
      log('- oauthTokenData structure included:', Object.keys(responseData.oauthTokenData));
      
      // Check if we should return JSON or HTML based on the Accept header and origin
      const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
      const isN8nRequest = req.headers['user-agent']?.includes('n8n') || 
                           req.headers.origin?.includes('n8n') ||
                           req.headers.referer?.includes('n8n') ||
                           isN8n;
      
      if (wantsJson || isN8nRequest) {
        log('Returning JSON response for n8n');
        
        // Set CORS headers to ensure n8n can access the response
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        return res.json(responseData);
      } else {
        log('Returning HTML response with embedded data for browser');
        // Create an HTML response with auto-close script for browser popups
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; text-align: center; padding: 40px; }
              h1 { color: #4caf50; }
              p { margin: 20px 0; }
              .data { display: none; }
              .debug { background: #f5f5f5; border: 1px solid #ddd; padding: 10px; margin: 20px 0; text-align: left; }
              button { background: #4caf50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; margin: 5px; }
              button:hover { background: #45a049; }
            </style>
          </head>
          <body>
            <h1>Authentication Successful!</h1>
            <p>You can now close this window and return to n8n.</p>
            <p>Closing automatically in <span id="countdown">5</span> seconds...</p>
            
            <div>
              <button id="copy-token-btn">Copy Access Token</button>
              <button id="copy-refresh-btn">Copy Refresh Token</button>
              <button id="show-debug-btn">Show Debug Info</button>
            </div>
            
            <div id="debug-info" class="debug" style="display: none;">
              <h3>Debug Information</h3>
              <p>If n8n isn't detecting your authentication, you may need to manually enter these values:</p>
              <p><strong>Access Token:</strong> <span id="access-token-display">${tokenData.access_token.substring(0, 10)}...</span></p>
              <p><strong>Refresh Token:</strong> <span id="refresh-token-display">${tokenData.refresh_token ? tokenData.refresh_token.substring(0, 10) + '...' : 'Not provided'}</span></p>
              <p><strong>Expiry:</strong> ${tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toLocaleString() : 'Not provided'}</p>
            </div>
            
            <div id="response-data" class="data">${JSON.stringify(responseData)}</div>
            <script>
              // Store response data in localStorage for n8n to retrieve
              const data = JSON.parse(document.getElementById('response-data').textContent);
              console.log('OAuth data received:', data);
              
              try {
                // Store in localStorage - standard way
                window.localStorage.setItem('oauth-data', JSON.stringify(data));
                
                // Store in localStorage - specific n8n format
                window.localStorage.setItem('n8n-oauth-response', JSON.stringify(data));
                
                // n8n checks for this specific field format
                window.localStorage.setItem('n8n-oauth-state', JSON.stringify({
                  token: data.access_token,
                  refreshToken: data.refresh_token,
                  scope: data.scope,
                  tokenType: data.token_type,
                  expiresIn: data.expires_in,
                  oauthTokenData: data.oauthTokenData,
                  ...(data.credentialId ? { cid: data.credentialId } : {}),
                  closeWindow: true
                }));
                
                console.log('Successfully stored oauth data in localStorage');
              } catch (e) {
                console.error('Error setting localStorage:', e);
              }
              
              // Send a message to the parent window (n8n)
              try {
                if (window.opener && window.opener.postMessage) {
                  console.log('Sending postMessage to parent window');
                  // Try multiple message formats to ensure compatibility
                  window.opener.postMessage({ 
                    type: 'oauth-credential-auth-complete', 
                    data: data,
                    ...(data.credentialId ? { credentialId: data.credentialId } : {})
                  }, '*');
                  
                  window.opener.postMessage({
                    type: 'oauth-token',
                    data: {
                      token: data.access_token,
                      refreshToken: data.refresh_token,
                      scope: data.scope,
                      tokenType: data.token_type,
                      expiresIn: data.expires_in,
                      ...(data.credentialId ? { credentialId: data.credentialId } : {})
                    }
                  }, '*');
                }
              } catch (e) {
                console.error('Error posting message to parent:', e);
              }
              
              // Add button functionality
              document.getElementById('copy-token-btn').addEventListener('click', function() {
                navigator.clipboard.writeText(data.access_token);
                this.textContent = 'Access Token Copied!';
                setTimeout(() => this.textContent = 'Copy Access Token', 2000);
              });
              
              document.getElementById('copy-refresh-btn').addEventListener('click', function() {
                navigator.clipboard.writeText(data.refresh_token || '');
                this.textContent = 'Refresh Token Copied!';
                setTimeout(() => this.textContent = 'Copy Refresh Token', 2000);
              });
              
              document.getElementById('show-debug-btn').addEventListener('click', function() {
                const debugInfo = document.getElementById('debug-info');
                if (debugInfo.style.display === 'none') {
                  debugInfo.style.display = 'block';
                  this.textContent = 'Hide Debug Info';
                } else {
                  debugInfo.style.display = 'none';
                  this.textContent = 'Show Debug Info';
                }
              });
              
              // Countdown and close window
              let seconds = 5;
              const countdown = setInterval(() => {
                seconds--;
                document.getElementById('countdown').textContent = seconds;
                if (seconds <= 0) {
                  clearInterval(countdown);
                  // Don't auto-close to allow user to copy tokens if needed
                  // window.close();
                }
              }, 1000);
            </script>
          </body>
          </html>
        `;
        
        // Set content type to HTML and send the response
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlResponse);
      }
    } catch (error) {
      log(`OAuth code exchange failed:`, error.message);
      
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
      
      // Check if we should return JSON or HTML based on the Accept header
      const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
      
      if (wantsJson) {
        log('Returning JSON error response as requested');
        return res.status(200).json({
          error: 'OAuth authentication failed',
          details: `Authentication for ${provider.name} failed`,
          errorMessage: error.message,
          provider: provider.name,
          successfulConnect: false
        });
      } else {
        log('Returning HTML error response');
        // Create an HTML error response
        const htmlErrorResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; text-align: center; padding: 40px; }
              h1 { color: #f44336; }
              p { margin: 20px 0; }
              .error { color: #f44336; font-weight: bold; }
              ul { text-align: left; display: inline-block; }
              .debug { background: #f5f5f5; border: 1px solid #ddd; padding: 10px; margin: 20px 0; text-align: left; }
            </style>
          </head>
          <body>
            <h1>Authentication Failed</h1>
            <p class="error">${error.message}</p>
            <p>${recommendedAction}</p>
            <ul>
              ${requiredSettings.map(setting => `<li>${setting}</li>`).join('')}
            </ul>
            <div class="debug">
              <h3>Debug Information</h3>
              <p>Request details: ${JSON.stringify(req.query)}</p>
              <p>Error details: ${error.stack || error.message}</p>
            </div>
            <p>Please close this window and try again.</p>
            <script>
              // Even though authentication failed, we need to tell n8n about it
              try {
                window.localStorage.setItem('n8n-oauth-state', JSON.stringify({
                  error: "${error.message}",
                  closeWindow: true
                }));
                
                if (window.opener && window.opener.postMessage) {
                  window.opener.postMessage({ 
                    type: 'oauth-credential-auth-error', 
                    error: "${error.message}"
                  }, '*');
                }
              } catch (e) {
                console.error('Error communicating with n8n:', e);
              }
            </script>
          </body>
          </html>
        `;
        
        // Set content type to HTML and send the error response
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(htmlErrorResponse);
      }
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