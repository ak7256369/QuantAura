const { contextBridge, ipcRenderer } = require('electron')

/**
 * Secure IPC bridge between the Electron main process and the React renderer.
 * Only explicitly listed channels are exposed — nothing else from Node/Electron
 * is accessible to the renderer (contextIsolation: true).
 */
contextBridge.exposeInMainWorld('electronAPI', {

  // ── Renderer → Main (fire-and-forget & invoke) ────────────────────────────
  togglePin:       ()     => ipcRenderer.send('toggle-pin'),
  minimizeToTray:  ()     => ipcRenderer.send('minimize-to-tray'),
  closeApp:        ()     => ipcRenderer.send('close-app'),
  requestRefresh:  ()     => ipcRenderer.send('request-refresh'),
  setSymbol:       (s)    => ipcRenderer.send('set-symbol', s),
  openExternal:    (url)  => ipcRenderer.send('open-external', url),
  getPinStatus:    ()     => ipcRenderer.sendSync('get-pin-status'),
  getAuth:         ()     => ipcRenderer.invoke('get-auth'),
  setAuth:         (data) => ipcRenderer.invoke('set-auth', data),
  logout:          ()     => ipcRenderer.invoke('logout'),

  // ── Main → Renderer (subscriptions) ────────────────────────────────────────
  /** Called every 60s with fresh { signal, price, candles, ... } */
  onDataUpdate: (callback) => {
    ipcRenderer.on('data-update', (_event, data) => callback(data))
  },

  /** Called when the force-refresh trigger fires from tray menu */
  onForceRefresh: (callback) => {
    ipcRenderer.on('force-refresh', () => callback())
  },

  /** Called when pin state changes (from tray menu or keyboard) */
  onPinStatus: (callback) => {
    ipcRenderer.on('pin-status', (_event, pinned) => callback(pinned))
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
