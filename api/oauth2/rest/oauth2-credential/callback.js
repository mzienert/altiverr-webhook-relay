const https = require('https');
const crypto = require('crypto');

// Configuration
const REDIRECT_URI = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';
const TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';

/**
 * Base64URL encoding function as per RFC 7636
 * @param {Buffer} buffer - The buffer to encode
 * @returns {string} The base64url encoded string
 */
function base64URLEncode(buffer) {
  return buffer.toString('base64')
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
  return base64URLEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );
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
          
          // Generate a proper code challenge for debugging
          const codeChallenge = generateCodeChallenge(codeVerifier);
          console.log('Generated S256 code challenge:', codeChallenge);
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    let tokenData;
    
    // Try using standard OAuth first (no PKCE) - this might work if PKCE is actually disabled
    try {
      console.log('Attempting standard OAuth flow without PKCE first...');
      tokenData = await exchangeCodeForToken(code);
      console.log('Standard OAuth flow succeeded');
      return res.json(tokenData);
    } catch (error) {
      console.log('Standard OAuth flow failed:', error.message);
      
      // If standard flow fails and we have a code_verifier, try with PKCE
      if (codeVerifier) {
        try {
          console.log('Attempting PKCE flow with code_verifier...');
          tokenData = await exchangeCodeForToken(code, codeVerifier);
          console.log('PKCE flow succeeded');
          return res.json(tokenData);
        } catch (pkceError) {
          console.error('PKCE flow failed:', pkceError.message);
          return res.status(500).json({ 
            error: 'OAuth authentication failed', 
            details: 'Both standard and PKCE authentication flows failed. Please ensure your Salesforce Connected App is configured correctly.',
            standardError: error.message,
            pkceError: pkceError.message 
          });
        }
      } else {
        // If no code_verifier is available, return the original error
        return res.status(500).json({ 
          error: 'OAuth authentication failed', 
          details: error.message 
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