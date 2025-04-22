// Direct webhook handler that uses direct HTTPS requests to SQS instead of AWS SDK
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

// Environment variables
const REGION = process.env.AWS_REGION;
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

// Function to verify Calendly webhook signature
function verifySignature(payload, signature, timestamp) {
  try {
    const signaturePayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SIGNING_KEY)
      .update(signaturePayload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// AWS SQS direct API request
function sendToSQS(messageBody, messageGroupId, messageDeduplicationId) {
  return new Promise((resolve, reject) => {
    try {
      // Extract the hostname and path from the queue URL
      const queueUrl = new URL(QUEUE_URL);
      const host = queueUrl.hostname;
      const path = queueUrl.pathname;
      
      // Create a timestamp for request signing
      const date = new Date();
      const amzdate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const datestamp = amzdate.slice(0, 8);

      // Create payload
      const params = {
        'Action': 'SendMessage',
        'MessageBody': messageBody,
        'MessageGroupId': messageGroupId,
        'MessageDeduplicationId': messageDeduplicationId,
        'Version': '2012-11-05'
      };
      
      // Create canonical request
      const payload = querystring.stringify(params);
      
      // Get the queue hostname and path
      console.log('SQS queue info:', { host, path });

      // Authorization headers
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        'Host': host,
        'X-Amz-Date': amzdate
      };

      // Append auth headers if provided
      if (ACCESS_KEY && SECRET_KEY) {
        // AWS authorization using Signature V4
        const algorithm = 'AWS4-HMAC-SHA256';
        const service = 'sqs';
        
        // Create canonical request
        const canonicalUri = path;
        const canonicalQueryString = '';
        
        let canonicalHeaders = '';
        let signedHeaders = '';
        
        Object.keys(headers).sort().forEach(key => {
          canonicalHeaders += `${key.toLowerCase()}:${headers[key]}\n`;
          signedHeaders += `${key.toLowerCase()};`;
        });
        
        signedHeaders = signedHeaders.slice(0, -1); // Remove trailing semicolon
        
        const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
        
        const canonicalRequest = [
          'POST',
          canonicalUri,
          canonicalQueryString,
          canonicalHeaders,
          signedHeaders,
          payloadHash
        ].join('\n');
        
        // Create string to sign
        const credentialScope = `${datestamp}/${REGION}/${service}/aws4_request`;
        const requestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
        const stringToSign = [
          algorithm,
          amzdate,
          credentialScope,
          requestHash
        ].join('\n');
        
        // Calculate signature
        function getSignatureKey(key, dateStamp, regionName, serviceName) {
          const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
          const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
          const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
          const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
          return kSigning;
        }
        
        const signingKey = getSignatureKey(SECRET_KEY, datestamp, REGION, service);
        const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
        
        // Add authorization header
        const authorizationHeader = `${algorithm} Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        headers['Authorization'] = authorizationHeader;
      }
      
      // Log headers and payload (redact sensitive information)
      console.log('Request headers:', { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : undefined });
      console.log('Request payload length:', payload.length);
      
      // Options for the HTTPS request
      const options = {
        hostname: host,
        port: 443,
        path: path,
        method: 'POST',
        headers: headers
      };
      
      // Make the HTTPS request
      const req = https.request(options, (res) => {
        let responseBody = '';
        
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('SQS direct success:', responseBody);
            resolve({
              statusCode: res.statusCode,
              body: responseBody
            });
          } else {
            console.error('SQS direct error:', {
              statusCode: res.statusCode,
              body: responseBody
            });
            reject(new Error(`SQS request failed with status code ${res.statusCode}: ${responseBody}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('SQS request error:', error);
        reject(error);
      });
      
      // Send the request
      req.write(payload);
      req.end();
    } catch (error) {
      console.error('Error in sendToSQS:', error);
      reject(error);
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Direct webhook handler called');
    
    // Verify signature
    const signature = req.headers['x-calendly-signature'];
    const timestamp = req.headers['x-calendly-timestamp'];
    
    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature headers' });
    }

    const rawBody = JSON.stringify(req.body);
    if (!verifySignature(rawBody, signature, timestamp)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Extract data
    const webhookData = req.body;
    
    // Generate unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`direct-${Date.now()}`)
      .digest('hex');
    
    // Prepare message
    const messageBody = JSON.stringify({
      event: webhookData.event,
      time: webhookData.time,
      payload: webhookData.payload
    });
    
    // Send to SQS directly
    const response = await sendToSQS(
      messageBody,
      'calendly-events',
      deduplicationId
    );
    
    console.log('Direct SQS response:', response);
    
    // Parse the XML response to get the MessageId
    let messageId = 'unknown';
    const match = response.body.match(/<MessageId>(.*?)<\/MessageId>/);
    if (match && match[1]) {
      messageId = match[1];
    }
    
    return res.status(200).json({ 
      success: true, 
      messageId: messageId,
      response: response.body
    });
  } catch (error) {
    console.error('Direct webhook handler error:', error);
    return res.status(500).json({ 
      error: 'Failed to queue message',
      details: error.message
    });
  }
} 