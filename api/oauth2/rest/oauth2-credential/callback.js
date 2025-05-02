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
    
    // Try to extract code_verifier from state if present
    let code_verifier;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      console.log('Parsed state data:', stateData);
      code_verifier = stateData.codeVerifier;
    } catch (e) {
      console.log('Error parsing state for code_verifier:', e);
    }
    
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: serviceConfig.clientId,
      client_secret: serviceConfig.clientSecret,
      code: code,
      redirect_uri: serviceConfig.redirectUri
    });

    // Add PKCE parameters if available
    if (code_verifier) {
      data.append('code_verifier', code_verifier);
    }

    const url = new URL(serviceConfig.tokenUrl);
    
    // Add detailed logging
    console.log('Full token exchange details:', {
      url: url.toString(),
      redirect_uri: serviceConfig.redirectUri,
      client_id: serviceConfig.clientId,
      client_secret: '(hidden)',
      code: code,
      code_verifier: code_verifier || '(not provided)',
      grant_type: 'authorization_code',
      full_payload: data.toString()
    });

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.toString().length
      }
    };

    const req = https.request(options, (res) => {
      console.log('Token exchange response status:', res.statusCode);
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          console.log('Raw response data:', responseData);
          const parsedData = JSON.parse(responseData);
          console.log('Parsed response:', {
            ...parsedData,
            access_token: parsedData.access_token ? '(set)' : '(not set)',
            refresh_token: parsedData.refresh_token ? '(set)' : '(not set)'
          });
          
          if (service === 'slack' && !parsedData.ok) {
            reject(new Error(parsedData.error || 'Failed to exchange code for token'));
          } else if (service === 'salesforce' && parsedData.error) {
            reject(new Error(parsedData.error_description || parsedData.error));
          } else {
            // Transform response to match n8n expectations if needed
            if (service === 'salesforce') {
              resolve({
                access_token: parsedData.access_token,
                refresh_token: parsedData.refresh_token,
                token_type: parsedData.token_type,
                instance_url: parsedData.instance_url,
                scope: parsedData.scope
              });
            } else {
              resolve(parsedData);
            }
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