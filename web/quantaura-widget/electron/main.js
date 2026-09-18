const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { startUpdater, stopUpdater, setSymbol, refreshNow, setAuthToken, fetchAll } = require('./updater')

// ─── Constants ────────────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production' && !app.isPackaged
const DEV_URL = 'http://localhost:5173'
const WIDGET_WIDTH  = 380
const WIDGET_HEIGHT = 600

// ─── Auth Persistence Helpers ────────────────────────────────────────────────
function getAuthFilePath() {
  return path.join(app.getPath('userData'), 'auth.json')
}

function loadSavedAuth() {
  try {
    const p = getAuthFilePath()
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
  } catch (e) {
    console.warn('[Main] Failed to read auth file:', e.message)
  }
  return null
}

function saveAuth(data) {
  try {
    const p = getAuthFilePath()
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
    console.log('[Main] Auth saved to', p)
  } catch (e) {
    console.warn('[Main] Failed to save auth file:', e.message)
  }
}

function clearAuth() {
  try {
    const p = getAuthFilePath()
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      console.log('[Main] Auth file deleted')
    }
  } catch (e) {
    console.warn('[Main] Failed to delete auth file:', e.message)
  }
}

function getAssetPath(filename) {
  const paths = [
    path.join(__dirname, '..', 'public', 'assets', filename),
    path.join(__dirname, '..', 'dist', 'assets', filename),
    path.join(process.resourcesPath || '', 'app.asar', 'public', 'assets', filename),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'assets', filename)
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  return paths[0]
}

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null
let tray       = null
let isPinned   = true   // always-on-top by default
let lastSignal = null   // track signal changes for notification diffing

// ─── Window Creation ──────────────────────────────────────────────────────────
function createWindow() {
  const { screen } = require('electron')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize

  // Position docked at top-right side of screen like a true desktop widget
  const xPos = Math.max(20, screenW - WIDGET_WIDTH - 24)
  const yPos = Math.max(20, Math.floor((screenH - WIDGET_HEIGHT) / 2))

  const appIcon = nativeImage.createFromPath(getAssetPath('icon.png'))

  mainWindow = new BrowserWindow({
    width:           WIDGET_WIDTH,
    height:          WIDGET_HEIGHT,
    x:               xPos,
    y:               yPos,
    icon:            appIcon,
    frame:           false,
    transparent:     true,
    hasShadow:       true,
    resizable:       false,
    alwaysOnTop:     isPinned,
    skipTaskbar:     false,
    show:            true,
    center:          false,
    webPreferences: {
      preload:             path.join(__dirname, 'preload.js'),
      contextIsolation:    true,
      nodeIntegration:     false,
      sandbox:             false,
      webSecurity:         !IS_DEV,   // allow cross-origin fetches in dev
    },
  })
  
  if (isPinned) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  }

  // Intercept window.open calls — open in user's default system web browser (Chrome/Edge)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  console.log('[Main] BrowserWindow created')

  // Load app
  if (IS_DEV) {
    mainWindow.loadURL(DEV_URL)
    // Open DevTools in dev mode (comment out to hide)
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Show window gracefully when ready
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] ready-to-show fired — window visible')
    mainWindow.show()
    mainWindow.focus()
    // Immediately push fresh data so renderer doesn't wait 60s
    const { fetchAll } = require('./updater')
    fetchAll('BTCUSDT', handleSignalUpdate)
  })

  // Prevent window from being closed — hide to tray instead
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── System Tray ──────────────────────────────────────────────────────────────
function createTray() {
  let trayImage

  try {
    const mainIconPath = getAssetPath('icon.png')
    const mainIcon = nativeImage.createFromPath(mainIconPath)
    if (!mainIcon.isEmpty()) {
      trayImage = mainIcon.resize({ width: 32, height: 32 })
    } else {
      const fallbackPath = getAssetPath('tray-icon.png')
      trayImage = nativeImage.createFromPath(fallbackPath)
    }
  } catch (err) {
    console.error('[Main] Tray icon creation error:', err)
    trayImage = nativeImage.createEmpty()
  }

  tray = new Tray(trayImage)
  tray.setToolTip('QuantAura Widget')

  const buildMenu = () => Menu.buildFromTemplate([
    { label: 'QuantAura Widget', enabled: false },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? 'Hide Widget' : 'Show Widget',
      click: toggleWidget,
    },
    {
      label: isPinned ? 'Unpin (Always on Top)' : 'Pin (Always on Top)',
      click: () => {
        isPinned = !isPinned
        if (mainWindow) {
          if (isPinned) mainWindow.setAlwaysOnTop(true, 'screen-saver')
          else mainWindow.setAlwaysOnTop(false)
        }
        tray.setContextMenu(buildMenu())
        if (mainWindow) mainWindow.webContents.send('pin-status', isPinned)
      },
    },
    { type: 'separator' },
    {
      label: 'Refresh Now',
      click: () => {
        refreshNow(handleSignalUpdate)
      },
    },
    {
      label: 'Open QuantAura Web',
      click: () => shell.openExternal('https://quantaura.tech'),
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(buildMenu())

  tray.on('double-click', toggleWidget)

  return { buildMenu }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toggleWidget() {
  if (!mainWindow) return createWindow()
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

// ─── IPC Handlers (Renderer → Main) ──────────────────────────────────────────
ipcMain.on('toggle-pin', () => {
  isPinned = !isPinned
  if (mainWindow) {
    if (isPinned) mainWindow.setAlwaysOnTop(true, 'screen-saver')
    else mainWindow.setAlwaysOnTop(false)
  }
  if (mainWindow) mainWindow.webContents.send('pin-status', isPinned)
})

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('close-app', () => {
  app.isQuitting = true
  app.quit()
})

ipcMain.on('request-refresh', () => {
  refreshNow(handleSignalUpdate)
})

ipcMain.on('set-symbol', (_event, symbol) => {
  console.log('[Main] Received set-symbol:', symbol)
  setSymbol(symbol, handleSignalUpdate)
})

ipcMain.on('open-external', (_event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url)
  }
})

ipcMain.on('get-pin-status', (event) => {
  event.returnValue = isPinned
})

// ─── Auth IPC Handlers ────────────────────────────────────────────────────────
ipcMain.handle('get-auth', () => {
  return loadSavedAuth()
})

ipcMain.handle('set-auth', (_event, authData) => {
  saveAuth(authData)
  setAuthToken(authData?.token || null, handleSignalUpdate)
  return true
})

ipcMain.handle('logout', () => {
  clearAuth()
  setAuthToken(null, handleSignalUpdate)
  return true
})

// ─── Native Notifications ─────────────────────────────────────────────────────
/**
 * Called by updater.js when fresh signal data arrives.
 * Fires a native OS notification when signal changes or confidence > 80%.
 */
function handleSignalUpdate(signal) {
  if (!mainWindow) return

  // Push data to renderer
  mainWindow.webContents.send('data-update', signal)

  // Update tray tooltip with live price
  if (tray && signal.price) {
    const price   = parseFloat(signal.price).toLocaleString('en-US', { maximumFractionDigits: 2 })
    const dir     = signal.signal || '—'
    const symbol  = (signal.symbol || 'BTC').replace('USDT', '')
    tray.setToolTip(`QuantAura | ${symbol} $${price} • ${dir}`)
  }

  // OS Notifications disabled per user request
  lastSignal = signal
}

// Export so updater.js can call it
module.exports = { handleSignalUpdate }

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  const { buildMenu } = createTray()

  // Restore saved auth token before polling
  const saved = loadSavedAuth()
  if (saved?.token) {
    console.log('[Main] Restored saved auth for:', saved.user?.email || 'User')
    setAuthToken(saved.token)
  }

  // Start background polling (every 60s)
  startUpdater(handleSignalUpdate)

  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })
})

app.on('window-all-closed', (e) => {
  // Keep app alive in tray on all platforms
  e.preventDefault()
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopUpdater()
})
