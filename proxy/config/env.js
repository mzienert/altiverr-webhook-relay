// Proxy Service Configuration
// Now uses shared configuration to eliminate duplication
import { getProxyConfig, debugConfig } from '../../shared/config/env.js';

// Get proxy service specific configuration
const env = getProxyConfig();

// Debug configuration in development
debugConfig('Proxy Service');

export default env; 