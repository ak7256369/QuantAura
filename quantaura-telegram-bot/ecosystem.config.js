// PM2 entry for the bot on the QuantAura VPS. The product repo's own
// ecosystem.config.js (FYP) deliberately does NOT know about this process —
// each repo owns its runtime.
//
// restart_delay is high because the failure that matters is a 409 from
// getUpdates — two processes polling one bot token — and fast restarts would
// just make the two instances fight harder.
module.exports = {
  apps: [
    {
      name: "quantaura-bot",
      script: "bot.js",
      cwd: "/home/quantaura.tech/bots/quantaura-telegram-bot",
      interpreter: "node",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 15000,
      max_memory_restart: "200M",
      log_file: "/root/FYP/logs/telegram-bot.log",
      error_file: "/root/FYP/logs/telegram-bot-error.log",
    },
  ]
};
