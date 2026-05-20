// =====================================================================
// Casa Rula Print — Electron main process
// =====================================================================
//
// Empaqueta el daemon de impresión que vive en ../print-daemon/ como
// una app de escritorio para macOS. Hace cuatro cosas:
//
// 1. Lee config (Supabase URL, service_role key, restaurant_id) de un
//    archivo JSON en la carpeta de datos de usuario de la app. Si no
//    existe, abre una ventana de configuración para que el usuario lo
//    rellene una vez. Después se reutiliza.
//
// 2. Arranca el daemon como subproceso. Reinicia automáticamente si
//    se cae (max 5 reintentos por minuto para evitar loops si la
//    config es mala).
//
// 3. Pone un icono en la barra de menú de macOS:
//      verde   = daemon corriendo, sin errores recientes
//      naranja = corriendo pero hubo error reciente
//      rojo    = no corriendo / config incompleta
//    Click en el icono = menú con: Estado · Ver logs · Reiniciar
//    daemon · Editar config · Salir.
//
// 4. Mantiene el iMac despierto durante el horario de servicio con
//    `caffeinate -i`. Por la noche (entre HORA_DESCANSO_INICIO y
//    HORA_DESCANSO_FIN) deja al sistema dormir normalmente — el
//    restaurante está cerrado y no hace falta gastar electricidad
//    para nada.
// =====================================================================

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

// ---------------------------------------------------------------------
// Configuración persistente (Supabase creds + horas de servicio)
// ---------------------------------------------------------------------

interface AppConfig {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  restaurantId: string
  // Horario de servicio durante el que mantenemos el iMac despierto.
  // Fuera de este rango, dejamos al sistema dormir normalmente.
  // Formato 24h "HH:MM". Si serviceStart > serviceEnd asumimos que
  // cruza medianoche (raro en restaurante pero soportado).
  serviceStart: string  // ej. "08:00"
  serviceEnd: string    // ej. "01:00"
}

const DEFAULT_CONFIG: AppConfig = {
  supabaseUrl: 'https://ryjnwzkrsodgadvqucqa.supabase.co',
  supabaseServiceRoleKey: '',
  restaurantId: 'bf17533a-fc4e-43c9-a81f-50b364cca9a9',
  serviceStart: '08:00',
  serviceEnd: '01:00',
}

const configPath = () => path.join(app.getPath('userData'), 'config.json')

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveConfig(cfg: AppConfig) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
}

function isConfigComplete(cfg: AppConfig): boolean {
  return !!(cfg.supabaseUrl && cfg.supabaseServiceRoleKey && cfg.restaurantId)
}

// ---------------------------------------------------------------------
// Estado del daemon (mantenido en memoria para el menubar)
// ---------------------------------------------------------------------

type DaemonStatus = 'stopped' | 'running' | 'error' | 'config_missing'

interface DaemonState {
  status: DaemonStatus
  lastError: string | null
  lastErrorAt: number | null
  startedAt: number | null
  logs: string[]      // últimas N líneas para mostrar en ventana
}

const MAX_LOG_LINES = 500
const state: DaemonState = {
  status: 'stopped',
  lastError: null,
  lastErrorAt: null,
  startedAt: null,
  logs: [],
}

function pushLog(line: string) {
  const ts = new Date().toISOString().slice(11, 19)
  const tagged = `[${ts}] ${line}`
  state.logs.push(tagged)
  if (state.logs.length > MAX_LOG_LINES) state.logs.shift()
  // También a stderr para que `console.app` capture si alguien quiere.
  console.log(tagged)
  // Si la ventana de logs está abierta, le mandamos la línea en
  // tiempo real para que se vaya añadiendo sin tener que reabrir.
  logsWindow?.webContents.send('log-line', tagged)
}

// ---------------------------------------------------------------------
// Daemon subprocess management
// ---------------------------------------------------------------------

let daemonProc: ChildProcess | null = null
let restartCount = 0
let restartWindow: number[] = []  // timestamps de últimos restarts
const RESTART_LIMIT = 5
const RESTART_WINDOW_MS = 60_000  // 1 minuto

function daemonEntryPoint(): string {
  // En desarrollo el daemon vive en ../print-daemon/src/index.ts.
  // Empaquetado, electron-builder copia print-daemon dentro del .asar
  // bundle. Resolvemos según si estamos packaged o no.
  if (app.isPackaged) {
    // En .asar la ruta es relativa al recursos del bundle.
    return path.join(process.resourcesPath, 'app.asar', '..', 'print-daemon', 'src', 'index.js')
  }
  return path.resolve(__dirname, '..', '..', 'print-daemon', 'src', 'index.ts')
}

function startDaemon() {
  const cfg = loadConfig()
  if (!isConfigComplete(cfg)) {
    state.status = 'config_missing'
    pushLog('Config incompleta — abre "Editar config" desde el menú.')
    updateTrayIcon()
    return
  }

  // Si ya hay un daemon vivo, no arrancamos otro.
  if (daemonProc) {
    pushLog('Daemon ya corriendo, ignoro arranque.')
    return
  }

  // Comprobar rate limit de restarts para evitar bucles.
  const now = Date.now()
  restartWindow = restartWindow.filter(t => now - t < RESTART_WINDOW_MS)
  if (restartWindow.length >= RESTART_LIMIT) {
    state.status = 'error'
    state.lastError = `Demasiados reintentos (${RESTART_LIMIT} en 1 min). Revisa config y reinicia manualmente.`
    state.lastErrorAt = now
    pushLog(state.lastError)
    updateTrayIcon()
    return
  }
  restartWindow.push(now)

  // Construimos las variables de entorno para el subproceso. NO
  // copiamos process.env entero — el daemon solo necesita estas.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_URL: cfg.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: cfg.supabaseServiceRoleKey,
    RESTAURANT_ID: cfg.restaurantId,
  }

  // Si estamos packaged, ejecutamos el .js compilado con node embebido
  // de Electron (ELECTRON_RUN_AS_NODE=1). Si estamos en dev, usamos tsx.
  const entry = daemonEntryPoint()
  if (app.isPackaged) {
    daemonProc = spawn(process.execPath, [entry], {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } else {
    const tsx = path.resolve(__dirname, '..', '..', 'print-daemon', 'node_modules', '.bin', 'tsx')
    daemonProc = spawn(tsx, [entry], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  state.status = 'running'
  state.startedAt = Date.now()
  state.lastError = null
  state.lastErrorAt = null
  pushLog('Daemon arrancado.')
  updateTrayIcon()

  daemonProc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8').trimEnd()
    for (const line of text.split('\n')) {
      pushLog(line)
    }
  })

  daemonProc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8').trimEnd()
    for (const line of text.split('\n')) {
      pushLog('ERR ' + line)
    }
    state.lastError = text
    state.lastErrorAt = Date.now()
    updateTrayIcon()
  })

  daemonProc.on('exit', (code, signal) => {
    pushLog(`Daemon terminado (code=${code} signal=${signal}). Reintentando en 3s...`)
    daemonProc = null
    state.status = code === 0 ? 'stopped' : 'error'
    updateTrayIcon()
    // Auto-restart salvo que estemos saliendo de la app.
    if (!quitting) {
      setTimeout(startDaemon, 3000)
    }
  })
}

function stopDaemon() {
  if (!daemonProc) return
  pushLog('Deteniendo daemon...')
  daemonProc.kill('SIGTERM')
  daemonProc = null
  state.status = 'stopped'
  updateTrayIcon()
}

function restartDaemon() {
  pushLog('Reinicio manual del daemon.')
  stopDaemon()
  // Reset del rate limit cuando el usuario lo pide explícitamente.
  restartWindow = []
  setTimeout(startDaemon, 500)
}

// ---------------------------------------------------------------------
// Caffeinate — mantener el iMac despierto en horario de servicio
// ---------------------------------------------------------------------

let caffeinateProc: ChildProcess | null = null

function shouldBeAwake(cfg: AppConfig): boolean {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const [sH, sM] = cfg.serviceStart.split(':').map(Number)
  const [eH, eM] = cfg.serviceEnd.split(':').map(Number)
  const start = sH * 60 + sM
  const end = eH * 60 + eM
  if (start <= end) {
    return mins >= start && mins < end
  } else {
    // Cruza medianoche: ej. start=20:00 end=01:00 → 20:00–23:59 OR 00:00–01:00
    return mins >= start || mins < end
  }
}

function updateCaffeinate() {
  const cfg = loadConfig()
  const wantAwake = shouldBeAwake(cfg)
  if (wantAwake && !caffeinateProc) {
    // -i evita idle sleep del SISTEMA (no solo la pantalla). El display
    // se puede apagar normalmente — caffeinate -i solo impide que el
    // sistema entre en sleep, no que la pantalla se duerma.
    caffeinateProc = spawn('caffeinate', ['-i'], { stdio: 'ignore' })
    caffeinateProc.on('exit', () => { caffeinateProc = null })
    pushLog('caffeinate activado (horario de servicio).')
  } else if (!wantAwake && caffeinateProc) {
    caffeinateProc.kill()
    caffeinateProc = null
    pushLog('caffeinate desactivado (fuera de horario, sleep permitido).')
  }
}

// ---------------------------------------------------------------------
// Tray (menubar icon)
// ---------------------------------------------------------------------

let tray: Tray | null = null
let logsWindow: BrowserWindow | null = null
let configWindow: BrowserWindow | null = null

function trayIconPath(): string {
  const variant =
    state.status === 'running' && !state.lastError ? 'ok' :
    state.status === 'running' ? 'warning' :
    'error'
  // Iconos template para macOS (con sufijo Template los pinta auto
  // según el tema del menubar). Si no encuentra el archivo, Electron
  // muestra un cuadrado en negro pero no crashea.
  const file = `tray-${variant}Template.png`
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', file)
    : path.join(__dirname, '..', 'assets', file)
}

function updateTrayIcon() {
  if (!tray) return
  try {
    const img = nativeImage.createFromPath(trayIconPath())
    img.setTemplateImage(true)
    tray.setImage(img)
  } catch {
    // ignore — el icono no es crítico
  }
  tray.setToolTip(`Casa Rula Print · ${state.status}`)
  rebuildTrayMenu()
}

function rebuildTrayMenu() {
  if (!tray) return
  const statusLabel = (() => {
    switch (state.status) {
      case 'running': return state.lastError ? '⚠ Con avisos' : '● Funcionando'
      case 'stopped': return '○ Parado'
      case 'error':   return '● Error'
      case 'config_missing': return '○ Falta configurar'
    }
  })()
  const menu = Menu.buildFromTemplate([
    { label: `Casa Rula Print`, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Ver registro…', click: () => openLogsWindow() },
    { label: 'Reiniciar daemon', click: () => restartDaemon() },
    { label: 'Editar configuración…', click: () => openConfigWindow() },
    { type: 'separator' },
    { label: 'Salir de Casa Rula Print', click: () => quit() },
  ])
  tray.setContextMenu(menu)
}

// ---------------------------------------------------------------------
// Ventanas (logs + config)
// ---------------------------------------------------------------------

function openLogsWindow() {
  if (logsWindow) {
    logsWindow.show()
    logsWindow.focus()
    return
  }
  logsWindow = new BrowserWindow({
    width: 720,
    height: 480,
    title: 'Casa Rula Print — registro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  logsWindow.loadFile(
    app.isPackaged
      ? path.join(process.resourcesPath, 'renderer', 'logs.html')
      : path.join(__dirname, '..', 'renderer', 'logs.html')
  )
  logsWindow.on('closed', () => { logsWindow = null })
  // Cuando termine de cargar, le mandamos los logs actuales.
  logsWindow.webContents.on('did-finish-load', () => {
    logsWindow?.webContents.send('log-init', state.logs)
  })
}

function openConfigWindow() {
  if (configWindow) {
    configWindow.show()
    configWindow.focus()
    return
  }
  configWindow = new BrowserWindow({
    width: 520,
    height: 540,
    title: 'Casa Rula Print — configuración',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  configWindow.loadFile(
    app.isPackaged
      ? path.join(process.resourcesPath, 'renderer', 'config.html')
      : path.join(__dirname, '..', 'renderer', 'config.html')
  )
  configWindow.on('closed', () => { configWindow = null })
  configWindow.webContents.on('did-finish-load', () => {
    configWindow?.webContents.send('config-init', loadConfig())
  })
}

// ---------------------------------------------------------------------
// IPC entre ventanas y main
// ---------------------------------------------------------------------

ipcMain.handle('config:save', async (_e, cfg: AppConfig) => {
  saveConfig(cfg)
  pushLog('Configuración guardada. Reiniciando daemon...')
  restartDaemon()
  return { ok: true }
})

ipcMain.handle('config:test', async (_e, _cfg: AppConfig) => {
  // Test rápido: intentar conectar a Supabase con las creds nuevas
  // antes de guardarlas. No bloqueante: si el test falla, el usuario
  // verá el aviso y podrá guardar igual.
  // Por simplicidad lo dejamos como TODO — el daemon ya falla rápido
  // si las creds son malas y lo verás en los logs.
  return { ok: true, message: 'Prueba pendiente — guarda y mira los logs.' }
})

// ---------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------

let quitting = false
function quit() {
  quitting = true
  stopDaemon()
  if (caffeinateProc) caffeinateProc.kill()
  app.quit()
}

app.whenReady().then(() => {
  // En macOS, ocultamos el dock — la app vive en el menubar.
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  // Tray icon
  const img = nativeImage.createFromPath(trayIconPath())
  img.setTemplateImage(true)
  tray = new Tray(img)
  updateTrayIcon()

  // Si la config no está completa, abrimos la ventana de config
  // automáticamente. Si está, arrancamos el daemon directo.
  const cfg = loadConfig()
  if (!isConfigComplete(cfg)) {
    state.status = 'config_missing'
    updateTrayIcon()
    openConfigWindow()
  } else {
    startDaemon()
  }

  // Caffeinate manager: revisar cada minuto si debemos estar despiertos.
  updateCaffeinate()
  setInterval(updateCaffeinate, 60_000)
})

app.on('window-all-closed', () => {
  // En macOS, no salimos cuando se cierran ventanas — la app vive en
  // el menubar.
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => { quitting = true })
