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
          console.log('Found code_verifier in state data (token field):', codeVerifier);
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    // Use PKCE if we have a code_verifier, as Salesforce seems to require it
    if (codeVerifier) {
      try {
        console.log('Using code_verifier from state:', codeVerifier);
        const tokenData = await exchangeCodeForToken(code, codeVerifier);
        return res.json(tokenData);
      } catch (error) {
        console.error('Token exchange failed:', error.message);
        return res.status(500).json({ 
          error: 'OAuth authentication failed', 
          details: error.message 
        });
      }
    } else {
      // Try without code_verifier (though this will likely fail based on errors)
      console.log('No code_verifier found in state, attempting standard flow');
      const tokenData = await exchangeCodeForToken(code);
      return res.json(tokenData);
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
    
    console.log('Exchanging code for token...');
    
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