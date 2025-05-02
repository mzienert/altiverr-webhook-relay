const https = require('https');

const BASE_URL = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';

function getRedirectUri(service) {
  return process.env.OAUTH_REDIRECT_URI || BASE_URL;
}

// OAuth2 configuration
const config = {
  slack: {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    get redirectUri() {
      return getRedirectUri('slack');
    }
  },
  salesforce: {
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    get redirectUri() {
      return getRedirectUri('salesforce');
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received OAuth callback with query params:', req.query);
    const { code, service: explicitService, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Detect service based on query parameters if not explicitly provided
    let service = explicitService;
    if (!service) {
      try {
        // Try to parse the state parameter
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('Parsed state data:', stateData);
        
        // Check if this is an n8n state token
        if (stateData.cid === 'N7GoXIhuLOvxf9SO') {
          service = 'salesforce';
        }
      } catch (e) {
        console.log('Error parsing state:', e);
      }
      
      // Fallback detection
      if (!service) {
        if (state?.includes('salesforce') || req.query.instance_url) {
          service = 'salesforce';
        } else {
          service = 'slack';
        }
      }
    }
    
    console.log('Detected service:', service);

    if (!['slack', 'salesforce'].includes(service)) {
      return res.status(400).json({ error: 'Invalid service specified' });
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await exchangeCodeForToken(code, service, state);

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

async function exchangeCodeForToken(code, service, state) {
  return new Promise((resolve, reject) => {
    const serviceConfig = config[service];
    
    // Parse the state to get PKCE parameters
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      console.log('State data contains:', Object.keys(stateData));
    } catch (e) {
      console.log('Error parsing state:', e);
    }

    // Basic OAuth parameters
    const data = new URLSearchParams();
    data.append('grant_type', 'authorization_code');
    data.append('client_id', serviceConfig.clientId);
    data.append('client_secret', serviceConfig.clientSecret);
    data.append('code', code);
    data.append('redirect_uri', serviceConfig.redirectUri);

    // Add code challenge method and verifier for PKCE
    if (service === 'salesforce') {
      data.append('code_challenge_method', 'S256');
      // If no code_verifier in state, generate one
      const code_verifier = stateData?.code_verifier || generateCodeVerifier();
      data.append('code_verifier', code_verifier);
    }

    const url = new URL(serviceConfig.tokenUrl);
    
    // Add detailed logging (with sensitive data masked)
    console.log('Token exchange request:', {
      url: url.toString(),
      redirect_uri: serviceConfig.redirectUri,
      client_id: maskString(serviceConfig.clientId),
      code: maskString(code),
      grant_type: 'authorization_code',
      has_code_verifier: data.has('code_verifier')
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
            scope: parsedData.scope
          });
          
          if (service === 'salesforce' && parsedData.error) {
            reject(new Error(parsedData.error_description || parsedData.error));
          } else {
            resolve(parsedData);
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

// Utility functions
function maskString(str) {
  if (!str) return '(not set)';
  if (str.length <= 8) return '***';
  return str.substr(0, 4) + '...' + str.substr(-4);
}

function generateCodeVerifier() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < 128; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
} 