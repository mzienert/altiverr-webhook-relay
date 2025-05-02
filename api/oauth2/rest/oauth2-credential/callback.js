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

    // Try standard OAuth flow with code parameter only
    try {
      console.log('Attempting standard OAuth flow without PKCE...');
      const tokenData = await exchangeCodeForToken(code);
      console.log('Standard OAuth flow succeeded');
      return res.json(tokenData);
    } catch (standardError) {
      console.log('Standard OAuth flow failed:', standardError.message);
      
      // If we have a code_verifier, try with it
      if (codeVerifier) {
        try {
          console.log('Attempting PKCE flow with code_verifier...');
          const tokenData = await exchangeCodeForToken(code, codeVerifier);
          console.log('PKCE flow succeeded');
          return res.json(tokenData);
        } catch (pkceError) {
          console.error('PKCE flow failed:', pkceError.message);
          
          // Return detailed error for troubleshooting
          return res.json({ 
            error: 'OAuth authentication failed', 
            details: 'Both authentication flows failed. Please check Salesforce Connected App settings.',
            standardError: standardError.message,
            pkceError: pkceError.message,
            recommendedActions: [
              'Enable or disable PKCE consistently in the Salesforce Connected App',
              'Verify the exact callback URL matches',
              'Check that n8n is properly configured for PKCE',
              'Try setting code_challenge_method=S256 in the initial authorization request',
              'Ensure client ID and secret are correct'
            ]
          });
        }
      } else {
        return res.status(500).json({ 
          error: 'OAuth authentication failed', 
          details: standardError.message 
        });
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
 * @param {string} code - The authorization code
 * @param {string|null} codeVerifier - The PKCE code verifier if available
 */
async function exchangeCodeForToken(code, codeVerifier = null) {
  return new Promise((resolve, reject) => {
    // Create form data
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    });
    
    // Add code_verifier if provided
    if (codeVerifier) {
      data.append('code_verifier', codeVerifier);
      console.log('Including code_verifier in token request');
    }
    
    console.log(`Exchanging code for token${codeVerifier ? ' with PKCE' : ' without PKCE'}...`);
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