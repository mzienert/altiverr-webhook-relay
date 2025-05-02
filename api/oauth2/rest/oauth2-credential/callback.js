const https = require('https');
const crypto = require('crypto');

const BASE_URL = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';

function getRedirectUri(service) {
  return process.env.OAUTH_REDIRECT_URI || BASE_URL;
}

// OAuth2 configuration
const config = {
  salesforce: {
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    get redirectUri() {
      return getRedirectUri('salesforce');
    }
  }
};

// PKCE Utilities
function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received OAuth callback with query params:', req.query);
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Parse state parameter to get code verifier
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      console.log('State data contains:', Object.keys(stateData));
    } catch (e) {
      console.log('Error parsing state:', e);
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await exchangeCodeForToken(code, stateData);

    // Return the token response in the format n8n expects
    return res.json(tokenResponse);
  } catch (error) {
    console.error('OAuth error:', error);
    return res.status(500).json({ 
      error: 'OAuth authentication failed',
      details: error.message 
    });
  }
}

async function exchangeCodeForToken(code, stateData) {
  return new Promise((resolve, reject) => {
    const serviceConfig = config.salesforce;
    
    // Generate code verifier if not provided
    const code_verifier = crypto.randomBytes(32).toString('hex');
    
    // Calculate code challenge
    const code_challenge = base64URLEncode(sha256(Buffer.from(code_verifier)));
    
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: serviceConfig.clientId,
      client_secret: serviceConfig.clientSecret,
      code: code,
      redirect_uri: serviceConfig.redirectUri,
      code_verifier: code_verifier,
      code_challenge_method: 'S256'
    });

    const url = new URL(serviceConfig.tokenUrl);
    
    // Add detailed logging (with sensitive data masked)
    console.log('Token exchange request:', {
      url: url.toString(),
      redirect_uri: serviceConfig.redirectUri,
      client_id: maskString(serviceConfig.clientId),
      code: maskString(code),
      code_verifier: maskString(code_verifier),
      code_challenge: code_challenge,
      grant_type: 'authorization_code'
    });

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': data.toString().length
      }
    };

    const req = https.request(options, (res) => {
      console.log('Response status:', res.statusCode);
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          
          // Log response without sensitive data
          console.log('Response:', {
            status: res.statusCode,
            error: parsedData.error,
            error_description: parsedData.error_description,
            has_access_token: !!parsedData.access_token,
            has_refresh_token: !!parsedData.refresh_token,
            token_type: parsedData.token_type,
            scope: parsedData.scope,
            instance_url: parsedData.instance_url
          });
          
          if (parsedData.error) {
            reject(new Error(parsedData.error_description || parsedData.error));
          } else {
            resolve({
              access_token: parsedData.access_token,
              refresh_token: parsedData.refresh_token,
              token_type: parsedData.token_type,
              instance_url: parsedData.instance_url,
              scope: parsedData.scope
            });
          }
        } catch (error) {
          console.error('Error parsing response:', error);
          reject(error);
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

function maskString(str) {
  if (!str) return '(not set)';
  if (str.length <= 8) return '***';
  return str.substr(0, 4) + '...' + str.substr(-4);
} 