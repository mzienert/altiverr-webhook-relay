const https = require('https');
const crypto = require('crypto');

// Configuration
const REDIRECT_URI = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';
const TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';

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
  
  // Try both methods to see which works
  const directHash = base64URLEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );
  
  const bufferHash = base64URLEncode(
    crypto.createHash('sha256').update(Buffer.from(verifier)).digest()
  );
  
  console.log('Code challenge (direct):', directHash);
  console.log('Code challenge (buffer):', bufferHash);
  
  return directHash;
}

export default async function handler(req, res) {
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

    // Parse state for code_verifier (n8n might be sending it here)
    let stateData = {};
    let codeVerifier = null;
    
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('State data contains:', Object.keys(stateData));
        console.log('Complete state data:', JSON.stringify(stateData, null, 2));
        
        // n8n typically stores the code_verifier as "token" in the state
        if (stateData.token) {
          codeVerifier = stateData.token;
          console.log('Found code_verifier in state data (token field):', codeVerifier);
          
          // Generate proper code challenges for debugging
          const codeChallenge = generateCodeChallenge(codeVerifier);
          console.log('Generated S256 code challenge:', codeChallenge);
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    // Try different approaches in sequence until one works
    const approaches = [
      { name: "Standard OAuth", config: { code } },
      { name: "PKCE with S256", config: { code, codeVerifier, pkce: true } },
      { name: "PKCE with 'plain' method", config: { code, codeVerifier, pkce: true, method: "plain" } }
    ];

    let lastError = null;
    
    // Try each approach in order
    for (const approach of approaches) {
      try {
        console.log(`Attempting ${approach.name}...`);
        const tokenData = await exchangeCodeForToken(approach.config);
        console.log(`${approach.name} succeeded!`);
        return res.json(tokenData);
      } catch (error) {
        console.log(`${approach.name} failed:`, error.message);
        lastError = error;
      }
    }
    
    // If we get here, all approaches failed
    return res.json({ 
      error: 'OAuth authentication failed', 
      details: 'All authentication approaches failed',
      lastError: lastError?.message,
      debugInfo: {
        codeVerifierLength: codeVerifier ? codeVerifier.length : null,
        codeVerifierValid: codeVerifier ? /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier) : false,
        receivedCode: code ? code.substring(0, 10) + '...' : null
      },
      recommendedActions: [
        'Verify client ID and secret are correct',
        'Check if Salesforce requires specific PKCE method',
        'Try setting up a completely new Connected App',
        'Use a test client (like Postman) to verify if the issue is with n8n or Salesforce'
      ]
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
 * @param {string|null} [config.codeVerifier] - The PKCE code verifier if available
 * @param {boolean} [config.pkce] - Whether to use PKCE
 * @param {string} [config.method] - The PKCE method (S256 or plain)
 */
async function exchangeCodeForToken(config) {
  return new Promise((resolve, reject) => {
    // Create form data
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: config.code,
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    });
    
    // Add code_verifier if PKCE is enabled
    if (config.pkce && config.codeVerifier) {
      data.append('code_verifier', config.codeVerifier);
      
      // If using plain method, append it
      if (config.method === 'plain') {
        data.append('code_challenge_method', 'plain');
      }
      
      console.log(`Including code_verifier in token request${config.method ? ' with method ' + config.method : ''}`);
    }
    
    const pkceStatus = config.pkce ? (config.method || 'S256') : 'disabled';
    console.log(`Exchanging code for token (PKCE: ${pkceStatus})...`);
    console.log('Request data:', data.toString());
    
    // Parse token URL
    const url = new URL(TOKEN_URL);
    
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
          const parsedData = JSON.parse(responseData);
          
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
            token_type: parsedData.token_type,
            instance_url: parsedData.instance_url
          });
          
          resolve(parsedData);
        } catch (error) {
          console.error('Error parsing token response', error);
          reject(new Error('Failed to parse token response'));
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