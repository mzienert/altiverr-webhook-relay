const AWS = require('aws-sdk');

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const payload = req.body;
    const message = {
      Id: Date.now().toString(),
      MessageBody: JSON.stringify(payload),
      MessageGroupId: "calendly-events"
    };

    await sqs.sendMessage({
      QueueUrl: QUEUE_URL,
      ...message
    }).promise();

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to queue message:', err);
    res.status(500).json({ error: 'Failed to queue message' });
  }
}
