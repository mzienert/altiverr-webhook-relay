module.exports = {
  apps: [
    {
      name: 'webhook-proxy-dev',
      script: 'src/index.js',
      cwd: '/Users/matthewzienert/Documents/altiverr-webhook-relay/proxy',
      interpreter: '/Users/matthewzienert/.nvm/versions/node/v22.13.1/bin/node',
      watch: ['src'],
      env: {
        NODE_ENV: 'development',
        PORT: 3333,
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/matthewzienert/Documents/altiverr-webhook-relay/proxy/logs/proxy-error.log',
      out_file: '/Users/matthewzienert/Documents/altiverr-webhook-relay/proxy/logs/proxy.log',
      autorestart: true,
    },
    {
      name: 'webhook-proxy-prod',
      script: 'src/index.js',
      cwd: '/Users/matthewzienert/Documents/altiverr-webhook-relay/proxy',
      interpreter: '/Users/matthewzienert/.nvm/versions/node/v22.13.1/bin/node',
      env: {
        NODE_ENV: 'production',
        PORT: 3333,
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        AWS_SDK_LOAD_CONFIG: 'true'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/matthewzienert/Documents/altiverr-webhook-relay/proxy/logs/proxy-error.log',
      out_file: '/Users/matthewzienert/Documents/altiverr-webhook-relay/proxy/logs/proxy.log',
      autorestart: true,
    }
  ]
}; 