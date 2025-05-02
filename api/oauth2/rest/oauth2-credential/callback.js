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
        
        // Look for code_verifier or similar field in state data
        if (stateData.code_verifier) {
          codeVerifier = stateData.code_verifier;
        } else if (stateData.codeVerifier) {
          codeVerifier = stateData.codeVerifier;
        } else if (stateData.verifier) {
          codeVerifier = stateData.verifier;
        } else if (stateData.token) {
          // Some implementations use the token as code_verifier
          codeVerifier = stateData.token;
        }
        
        if (codeVerifier) {
          console.log('Found potential code_verifier in state data');
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
    }

    // Exchange code for token
    const tokenData = await exchangeCodeForToken(code, codeVerifier);
    
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
 * Simple function to exchange authorization code for access token
 * Now with support for PKCE code_verifier
 */
async function exchangeCodeForToken(code, codeVerifier) {
  return new Promise((resolve, reject) => {
    // Create form data
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    });
    
    // Add code_verifier if available (required for PKCE)
    if (codeVerifier) {
      data.append('code_verifier', codeVerifier);
      console.log('Including code_verifier in token request');
    } else {
      console.log('No code_verifier available, proceeding without PKCE');
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
        'Content-Length': Buffer.byteLength(data.toString())
      }
    };
    
    // Make request
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error('Token response error:', res.statusCode, responseData);
          try {
            const errorData = JSON.parse(responseData);
            reject(new Error(errorData.error_description || errorData.error || 'Token request failed'));
          } catch (e) {
            reject(new Error(`Token request failed with status: ${res.statusCode}`));
          }
          return;
        }
        
        try {
          const tokenData = JSON.parse(responseData);
          console.log('Token received successfully');
          resolve(tokenData);
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