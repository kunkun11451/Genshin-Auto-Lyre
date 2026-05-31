import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, dirname } from 'path'
import { readFile, readdir, stat, mkdir, rename } from 'fs/promises'
import { watch } from 'fs'
import { initKeyboardSimulator, simulateKeyDown, simulateKeyUp, destroyKeyboardSimulator } from './keyboard-simulator'

// 判断是否为开发模式
const isDev = !app.isPackaged

// MIDI 根目录配置
const midiDirPath = isDev 
  ? join(process.cwd(), 'midi') 
  : join(process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe')), 'midi')

// 创建主窗口
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false, // 无边框窗口
    transparent: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 窗口准备就绪后显示，避免白屏闪烁
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 拦截新窗口请求，在外部浏览器中打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式加载 dev server，生产模式加载本地文件
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ===== 窗口控制 IPC =====
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow.close()
  })

  ipcMain.handle('window:toggleAlwaysOnTop', () => {
    const isAlwaysOnTop = !mainWindow.isAlwaysOnTop()
    if (isAlwaysOnTop) {
      // 使用更高级别的置顶（screen-saver），防止被全屏游戏压制
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    } else {
      mainWindow.setAlwaysOnTop(false)
    }
    return isAlwaysOnTop
  })

  let standardBounds: Electron.Rectangle | null = null

  ipcMain.on('window:setMiniMode', (_event, isMini: boolean) => {
    if (isMini) {
      standardBounds = mainWindow.getBounds()
      // 解除原有的最小尺寸限制并设置为小窗尺寸
      mainWindow.setMinimumSize(360, 520)
      mainWindow.setSize(360, 520)
    } else {
      // 恢复限制和尺寸
      mainWindow.setMinimumSize(960, 640)
      if (standardBounds) {
        mainWindow.setBounds(standardBounds)
      } else {
        mainWindow.setSize(1280, 800)
      }
    }
  })

  // ===== 文件操作 IPC =====
  ipcMain.handle('midi:list', async () => {
    return await scanMidiFiles(midiDirPath)
  })

  ipcMain.on('midi:openDir', () => {
    shell.openPath(midiDirPath)
  })

  ipcMain.handle('midi:rename', async (_event, oldPath: string, newName: string) => {
    const finalName = newName.toLowerCase().endsWith('.mid') ? newName : newName + '.mid'
    const newPath = join(dirname(oldPath), finalName)
    await rename(oldPath, newPath)
    return newPath
  })

  ipcMain.handle('midi:delete', async (_event, filePath: string) => {
    await shell.trashItem(filePath)
  })

  ipcMain.handle('midi:readFile', async (_event, filePath: string) => {
    const buffer = await readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })
  // ===== 键盘模拟 IPC =====
  ipcMain.on('keyboard:keyDown', (_event, key: string) => {
    simulateKeyDown(key)
  })

  ipcMain.on('keyboard:keyUp', (_event, key: string) => {
    simulateKeyUp(key)
  })

  return mainWindow
}

// 应用准备就绪后创建窗口
app.whenReady().then(async () => {
  // 确保目录存在
  try {
    await mkdir(midiDirPath, { recursive: true })
  } catch (err) {
    console.error('无法创建 midi 目录:', err)
  }

  // 初始化键盘模拟器
  await initKeyboardSimulator()
  
  const mainWindow = createWindow()

  // 监听目录变化，使用防抖以避免频繁触发
  let watchTimeout: NodeJS.Timeout | null = null
  watch(midiDirPath, () => {
    if (watchTimeout) clearTimeout(watchTimeout)
    watchTimeout = setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('midi:dirChanged')
      }
    }, 500)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  destroyKeyboardSimulator()
})

// 递归扫描目录内 MIDI 文件
async function scanMidiFiles(dir: string): Promise<string[]> {
  let results: string[] = []
  try {
    const list = await readdir(dir)
    for (const file of list) {
      const filePath = join(dir, file)
      const fileStat = await stat(filePath)
      if (fileStat.isDirectory()) {
        results = results.concat(await scanMidiFiles(filePath))
      } else {
        const lowerPath = filePath.toLowerCase()
        if (lowerPath.endsWith('.mid') || lowerPath.endsWith('.midi')) {
          results.push(filePath)
        }
      }
    }
  } catch (err) {
    console.error('Scan dir error:', err)
  }
  return results
}
