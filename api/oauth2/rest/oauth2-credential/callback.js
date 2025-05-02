const https = require('https');

// Configuration
const REDIRECT_URI = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';
const TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';

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
          console.log('Found code_verifier in state data (token field)');
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    // First try with PKCE if we have a code_verifier
    if (codeVerifier) {
      try {
        console.log('Attempting token exchange with PKCE...');
        const tokenData = await exchangeCodeForToken(code, codeVerifier, true);
        return res.json(tokenData);
      } catch (error) {
        console.log('PKCE attempt failed:', error.message);
        // If PKCE fails, try without it (fallback)
        console.log('Falling back to standard OAuth flow...');
      }
    }

    // Standard OAuth flow without PKCE (fallback)
    const tokenData = await exchangeCodeForToken(code, null, false);
    
    // Return token to client (n8n)
    return res.json(tokenData);
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
 * @param {boolean} usePkce - Whether to include the code_verifier in the request
 */
async function exchangeCodeForToken(code, codeVerifier, usePkce) {
  return new Promise((resolve, reject) => {
    // Create form data
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    });
    
    // Add code_verifier if using PKCE
    if (usePkce && codeVerifier) {
      data.append('code_verifier', codeVerifier);
      console.log('Including code_verifier in token request:', codeVerifier.substring(0, 5) + '...');
    }
    
    console.log(`Exchanging code for token${usePkce ? ' with PKCE' : ''}...`);
    
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