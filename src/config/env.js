// API Service Configuration
// Now uses shared configuration to eliminate duplication
import { getApiConfig, debugConfig } from '../../shared/config/env.js';

// Get API service specific configuration
const env = getApiConfig();

// Debug configuration in development
debugConfig('API Service');

export default env; 