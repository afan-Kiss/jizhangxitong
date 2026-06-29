module.exports = {
  apps: [
    {
      name: 'jade-accounting-server',
      cwd: '/www/wwwroot/jade-accounting/apps/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/www/wwwroot/jade-accounting/logs/server-error.log',
      out_file: '/www/wwwroot/jade-accounting/logs/server-out.log',
    },
  ],
}
