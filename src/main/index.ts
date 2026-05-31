import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { readFile, readdir, stat } from 'fs/promises'
import { initKeyboardSimulator, simulateKeyDown, simulateKeyUp, destroyKeyboardSimulator } from './keyboard-simulator'

// 判断是否为开发模式
const isDev = !app.isPackaged

// 创建主窗口
function createWindow(): void {
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

  // ===== 文件操作 IPC =====
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 MIDI 文件',
      filters: [{ name: 'MIDI 文件', extensions: ['mid', 'midi'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return null
    return result.filePaths
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择文件夹',
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    
    // 递归扫描文件夹内的所有 midi 文件
    const dir = result.filePaths[0]
    return await scanMidiFiles(dir)
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
}

// 应用准备就绪后创建窗口
app.whenReady().then(async () => {
  // 初始化键盘模拟器
  await initKeyboardSimulator()
  
  createWindow()

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
