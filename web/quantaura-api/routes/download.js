const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DOWNLOAD_NAME = 'QuantAura-Widget-Setup.exe';

// The Windows installer is placed on the server by the widget-build CI (scp),
// OUTSIDE the git tree so the ~80 MB binary never bloats the repo. First
// existing path wins — no manual .env needed on the standard server:
//   1. explicit WIDGET_INSTALLER_PATH override,
//   2. the server downloads dir the CI uploads to,
//   3. a local dev path.
const CANDIDATE_PATHS = [
  process.env.WIDGET_INSTALLER_PATH,
  `/home/quantaura.tech/downloads/${DOWNLOAD_NAME}`,
  path.join(__dirname, '..', 'downloads', DOWNLOAD_NAME),
].filter(Boolean);

function resolveInstaller() {
  for (const p of CANDIDATE_PATHS) {
    try { if (fs.statSync(p).isFile()) return p; } catch (_) { /* try next */ }
  }
  return null;
}

// GET /api/download/widget — stream the desktop-widget installer.
router.get('/widget', (req, res) => {
  const file = resolveInstaller();
  if (!file) {
    return res.status(404).json({
      success: false,
      error: 'The desktop widget installer is not available yet — please check back shortly.',
    });
  }
  const st = fs.statSync(file);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${DOWNLOAD_NAME}"`);
  res.setHeader('Content-Length', st.size);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const stream = fs.createReadStream(file);
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  stream.pipe(res);
});

module.exports = router;
