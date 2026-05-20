// Preload script — puente seguro entre el renderer (HTML) y el main
// process. Expone una API mínima en window.electronAPI.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  onConfigInit: (cb: (cfg: unknown) => void) =>
    ipcRenderer.on('config-init', (_e, cfg) => cb(cfg)),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke('config:save', cfg),
  testConfig: (cfg: unknown) => ipcRenderer.invoke('config:test', cfg),

  // Logs
  onLogInit: (cb: (lines: string[]) => void) =>
    ipcRenderer.on('log-init', (_e, lines) => cb(lines)),
  onLogLine: (cb: (line: string) => void) =>
    ipcRenderer.on('log-line', (_e, line) => cb(line)),
})
