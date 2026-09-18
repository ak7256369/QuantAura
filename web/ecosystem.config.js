// Serving only. Training runs on the workstation, which pushes the resulting
// weights to git; the deploy pulls them and restarts ml-api.
//
// There is deliberately NO autopilot-trainer here. The server treats the
// repository as the source of truth for saved_models/ — the deploy script
// discards local model changes so `git pull` cannot be blocked by them — so a
// trainer running here would have its freshly trained weights thrown away on
// the next deploy, and would meanwhile fight the deploy for the same files.
// Training on the server also needs data/prep (~1 GB, gitignored), which is
// not present. Re-adding a trainer entry means changing that ownership model
// first, not just uncommenting a block.
module.exports = {
  apps: [
    {
      name: "ml-api",
      script: "serve.py",
      cwd: "/home/quantaura.tech/public_html/quantaura-ml",
      interpreter: "/home/quantaura.tech/public_html/quantaura-ml/venv/bin/python",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 15000,          // 15s between restarts (was 5s)
      max_memory_restart: "1200M",   // 4 models + scalers + macro data ≈ 970MB
      log_file: "/root/FYP/logs/ml-api.log",
      error_file: "/root/FYP/logs/ml-api-error.log",
    },
    {
      name: "quantaura-api",
      script: "server.js",
      cwd: "/home/quantaura.tech/public_html/quantaura-api",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "300M",
      log_file: "/root/FYP/logs/node-backend.log",
      error_file: "/root/FYP/logs/node-backend-error.log",
    },
  ]
};
// The Telegram signal bot ("quantaura-bot") is deliberately NOT here: it lives
// in its own repo (quantaura-telegram-bot) with its own ecosystem.config.js
// and deploy workflow, checked out at /home/quantaura.tech/bots/. Each repo
// owns its runtime — this file only knows the processes this repo deploys.
