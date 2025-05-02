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
    let originalVerifier = null;
    
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('State data contains:', Object.keys(stateData));
        
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

    // Try different approaches in sequence until one works
    const approaches = [];
    
    // Try without PKCE first - this is the most likely to work with Salesforce
    approaches.push({ name: "Standard OAuth without PKCE", config: { code } });
    
    // If we have a valid code verifier, try PKCE methods
    if (codeVerifier) {
      approaches.push({ name: "PKCE with S256", config: { code, codeVerifier, pkce: true } });
      
      // Try with original verifier as last resort
      if (originalVerifier !== codeVerifier) {
        approaches.push({ name: "PKCE with original verifier", config: { code, codeVerifier: originalVerifier, pkce: true } });
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
            successMethod: approach.name
          }
        });
      } catch (error) {
        console.log(`${approach.name} failed:`, error.message);
        lastError = error;
        allErrors.push({ method: approach.name, error: error.message });
      }
    }
    
    // If we get here, all approaches failed
    return res.status(200).json({ 
      error: 'OAuth authentication failed', 
      details: 'All authentication approaches failed',
      lastError: lastError?.message,
      allErrors,
      debugInfo: {
        codeVerifierOriginal: originalVerifier,
        codeVerifierLength: originalVerifier ? originalVerifier.length : null,
        codeVerifierFixed: codeVerifier,
        codeVerifierValid: codeVerifier ? /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier) : false,
        receivedCode: code ? code.substring(0, 10) + '...' : null
      },
      recommendedActions: [
        'Run n8n callback with "Require Proof Key for Code Exchange (PKCE)" DISABLED in Salesforce Connected App',
        'Verify client ID and secret are correct',
        'Try setting up a completely new Connected App',
        'Use the Connected App settings exactly as shown in the n8n documentation'
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
      console.log('Including code_verifier in token request');
    }
    
    const pkceStatus = config.pkce ? 'enabled' : 'disabled';
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