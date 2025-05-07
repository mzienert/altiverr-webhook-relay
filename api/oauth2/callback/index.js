// Simple OAuth callback handler
export default function handler(req, res) {
  return res.status(200).json({
    message: 'OAuth callback handler',
    info: 'This placeholder will be updated when OAuth functionality is needed'
  });
} 