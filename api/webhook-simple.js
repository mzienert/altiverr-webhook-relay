// Basic webhook handler that just logs and acknowledges
const crypto = require('crypto');

// Signature verification function
function verifyCalendlySignature(payload, signature, timestamp) {
  try {
    const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (!key) {
      console.error('Missing CALENDLY_WEBHOOK_SIGNING_KEY environment variable');
      return false;
    }
    
    const signaturePayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', key)
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

export default async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook received');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));

    // Verify webhook signature
    const signature = req.headers['x-calendly-signature'];
    const timestamp = req.headers['x-calendly-timestamp'];
    
    if (!signature || !timestamp) {
      console.log('Missing signature headers');
      return res.status(401).json({ error: 'Missing signature headers' });
    }

    const rawBody = JSON.stringify(req.body);
    const isValid = verifyCalendlySignature(rawBody, signature, timestamp);
    
    console.log('Signature validation result:', isValid);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Just log the data and return success
    console.log('Webhook verified successfully');
    console.log('Event type:', req.body.event);
    console.log('Timestamp:', req.body.time);
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: "Webhook received and processed" 
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
} 