module.exports = {
  apps: [
    {
      name: 'jade-accounting-server',
      cwd: './apps/server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        SERVER_PORT: 4731,
        PORT: 4731,
      },
      error_file: '../../logs/server-error.log',
      out_file: '../../logs/server-out.log',
    },
  ],
}
