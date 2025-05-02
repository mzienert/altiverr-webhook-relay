const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const https = require('https');

// Salesforce OAuth configuration
const config = {
  tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
  clientId: process.env.SALESFORCE_CLIENT_ID,
  username: process.env.SALESFORCE_USERNAME,
  privateKeyPath: path.join(process.cwd(), 'certs', 'salesforce_private.key')
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read the private key
    const privateKey = fs.readFileSync(config.privateKeyPath, 'utf8');

    // Create JWT claims
    const claims = {
      iss: config.clientId, // Connected App Consumer Key
      sub: config.username, // The Salesforce username
      aud: 'https://login.salesforce.com', // For production. Use https://test.salesforce.com for sandbox
      exp: Math.floor(Date.now() / 1000) + 60 * 3 // 3 minutes expiration
    };

    // Sign the JWT
    const assertion = jwt.sign(claims, privateKey, { algorithm: 'RS256' });

    // Prepare token request
    const data = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion
    });

    // Log the request details (excluding sensitive data)
    console.log('Token request details:', {
      url: config.tokenUrl,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      clientId: config.clientId ? '(set)' : '(not set)',
      username: config.username ? '(set)' : '(not set)',
      privateKeyPath: config.privateKeyPath
    });

    // Request access token
    const tokenResponse = await new Promise((resolve, reject) => {
      const url = new URL(config.tokenUrl);
      
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
            if (parsedData.error) {
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

    // Return the token response
    return res.json(tokenResponse);
  } catch (error) {
    console.error('JWT authentication error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
} 