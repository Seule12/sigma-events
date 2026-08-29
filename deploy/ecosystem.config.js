// ============================================================
// SIGMA EVENTS — Configuration PM2 (ecosystem.config.js)
// Gère : Next.js ( SSR + API ) + Worker email
// ============================================================

module.exports = {
  apps: [
    {
      name: "sigma-events",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/var/www/sigma-events",
      instances: "max", // Clustering : 1 worker par CPU
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Logs
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/sigma-events/error.log",
      out_file: "/var/log/sigma-events/out.log",
      merge_logs: true,
      // Restart策略
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
