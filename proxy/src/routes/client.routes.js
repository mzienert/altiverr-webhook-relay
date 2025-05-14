import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './api.js';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Mount API routes at /api
router.use('/api', apiRoutes);

// Serve static files from public directory
const publicDir = path.resolve(__dirname, '../../public');
router.use('/monitor', express.static(publicDir));

// Serve index.html for any /monitor/* routes to support client-side routing
router.get('/monitor/*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

export default router; 