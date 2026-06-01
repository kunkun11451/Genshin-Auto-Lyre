import { app, BrowserWindow, ipcMain, shell, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { readFile, readdir, stat, mkdir, rename } from 'fs/promises'
import { watch } from 'fs'
import { initKeyboardSimulator, simulateKeyDown, simulateKeyUp, simulateKeyBatch, destroyKeyboardSimulator } from './keyboard-simulator'

// 判断是否为开发模式
const isDev = !app.isPackaged

// MIDI 根目录配置
const midiDirPath = isDev 
  ? join(process.cwd(), 'midi') 
  : join(process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe')), 'midi')

// 创建主窗口
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hidden',
    transparent: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121212',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  // 窗口准备就绪后显示，避免白屏闪烁
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximizedState', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximizedState', false)
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
      mainWindow.restore()
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
    const currentBounds = mainWindow.getBounds()
    // 改用透明度为0，避免系统级的隐藏动画带来的视觉残留
    mainWindow.setOpacity(0)

    if (isMini) {
      standardBounds = currentBounds
      // 解除原有的最小尺寸限制并设置为小窗尺寸
      mainWindow.setMinimumSize(360, 520)
      
      const newWidth = 360
      const newHeight = 520
      const newX = currentBounds.x + currentBounds.width - newWidth
      const newY = currentBounds.y
      
      mainWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
    } else {
      // 恢复限制和尺寸
      mainWindow.setMinimumSize(960, 640)
      if (standardBounds) {
        const newWidth = standardBounds.width
        const newHeight = standardBounds.height
        const newX = currentBounds.x + currentBounds.width - newWidth
        const newY = currentBounds.y
        
        mainWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
      } else {
        const newWidth = 1280
        const newHeight = 800
        const newX = currentBounds.x + currentBounds.width - newWidth
        const newY = currentBounds.y
        
        mainWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
      }
    }

    // 等待一小段时间让 React 重新渲染排版完成，然后再恢复透明度
    setTimeout(() => {
      mainWindow.setOpacity(1)
    }, 150)
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

  ipcMain.on('keyboard:keyBatch', (_event, downs: string[], ups: string[]) => {
    simulateKeyBatch(downs, ups)
  })

  // ===== 全局快捷键 IPC =====
  function normalizeAccelerator(shortcut: string): string {
    return shortcut
      .split('+')
      .map(part => {
        const lower = part.trim().toLowerCase()
        if (lower === '=') return '+'
        if (lower === 'plus') return '+'
        if (lower === 'minus') return '-'
        // 首字母大写，确保符合 Electron 规范
        if (lower.length > 1) {
          return part.charAt(0).toUpperCase() + part.slice(1)
        }
        return part.toUpperCase()
      })
      .join('+')
  }

  let currentShortcut = ''
  ipcMain.on('shortcut:register', (_event, shortcut: string) => {
    if (currentShortcut) {
      try {
        globalShortcut.unregister(normalizeAccelerator(currentShortcut))
      } catch (err) {
        console.error('Failed to unregister old shortcut:', err)
      }
    }
    currentShortcut = shortcut
    if (shortcut) {
      try {
        const norm = normalizeAccelerator(shortcut)
        const isRegistered = globalShortcut.register(norm, () => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('shortcut:triggered')
          }
        })
        if (!isRegistered) {
          console.error(`Failed to register global shortcut: ${norm}`)
        }
      } catch (err) {
        console.error(`Error registering shortcut ${shortcut}:`, err)
      }
    }
  })

  let stopShortcut = ''
  ipcMain.on('shortcut:registerStop', (_event, shortcut: string) => {
    if (stopShortcut) {
      try {
        globalShortcut.unregister(normalizeAccelerator(stopShortcut))
      } catch (err) {
        console.error('Failed to unregister stop shortcut:', err)
      }
    }
    stopShortcut = shortcut
    if (shortcut) {
      try {
        const norm = normalizeAccelerator(shortcut)
        const isRegistered = globalShortcut.register(norm, () => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('shortcut:stopTriggered')
          }
        })
        if (!isRegistered) {
          console.error(`Failed to register stop shortcut: ${norm}`)
        }
      } catch (err) {
        console.error(`Error registering stop shortcut ${shortcut}:`, err)
      }
    }
  })

  let speedUpShortcut = ''
  ipcMain.on('shortcut:registerSpeedUp', (_event, shortcut: string) => {
    if (speedUpShortcut) {
      try {
        globalShortcut.unregister(normalizeAccelerator(speedUpShortcut))
      } catch (err) {
        console.error('Failed to unregister speedUp shortcut:', err)
      }
    }
    speedUpShortcut = shortcut
    if (shortcut) {
      try {
        const norm = normalizeAccelerator(shortcut)
        const isRegistered = globalShortcut.register(norm, () => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('shortcut:speedUpTriggered')
          }
        })
        if (!isRegistered) {
          console.error(`Failed to register speedUp shortcut: ${norm}`)
        }
      } catch (err) {
        console.error(`Error registering speedUp shortcut ${shortcut}:`, err)
      }
    }
  })

  let speedDownShortcut = ''
  ipcMain.on('shortcut:registerSpeedDown', (_event, shortcut: string) => {
    if (speedDownShortcut) {
      try {
        globalShortcut.unregister(normalizeAccelerator(speedDownShortcut))
      } catch (err) {
        console.error('Failed to unregister speedDown shortcut:', err)
      }
    }
    speedDownShortcut = shortcut
    if (shortcut) {
      try {
        const norm = normalizeAccelerator(shortcut)
        const isRegistered = globalShortcut.register(norm, () => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('shortcut:speedDownTriggered')
          }
        })
        if (!isRegistered) {
          console.error(`Failed to register speedDown shortcut: ${norm}`)
        }
      } catch (err) {
        console.error(`Error registering speedDown shortcut ${shortcut}:`, err)
      }
    }
  })

  // ===== 在线曲库 IPC =====
  // 为 webview 的 session 设置 CSP 剥离和下载拦截
  let midiSessionSetup = false
  ipcMain.on('midi:setupSession', (_event, partitionName: string) => {
    if (midiSessionSetup) return
    midiSessionSetup = true

    const { session } = require('electron')
    const ses = session.fromPartition(partitionName)

    // 剥离 CSP 安全策略头
    ses.webRequest.onHeadersReceived((details: any, callback: any) => {
      const headers = { ...details.responseHeaders }
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-security-policy') {
          delete headers[key]
        }
      }
      callback({ responseHeaders: headers })
    })

    // 下载拦截：静默保存到 midi/cache
    ses.on('will-download', (_e: any, item: any) => {
      const cacheDir = join(midiDirPath, 'cache')
      const savePath = join(cacheDir, item.getFilename())
      item.setSavePath(savePath)

      item.once('done', (_ev: any, state: string) => {
        if (state === 'completed') {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('midi:downloaded', savePath)
          }
        }
      })
    })
  })

  // 抓取云端 HTML 页面内容（使用曲库专属 Session，以自动附带 Cookie 登录凭证）
  ipcMain.handle('midi:fetchCloudSearch', async (_event, url: string) => {
    try {
      const { net, session } = require('electron')
      const ses = session.fromPartition('persist:midishow')
      
      const response = await net.fetch(url, {
        session: ses, // 核心：使用指定的共享 Session 分区发送请求以带上 Cookie
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const html = await response.text()
      return { success: true, html }
    } catch (err: any) {
      console.error('Fetch cloud search error:', err)
      return { success: false, error: err.message }
    }
  })

  // 后台无头下载 MIDI
  ipcMain.handle('midi:downloadCloudMidi', async (_event, url: string) => {
    try {
      const downloadWin = new BrowserWindow({
        show: false, // 全程完全隐藏
        width: 800,
        height: 600,
        webPreferences: {
          partition: 'persist:midishow', // 共享相同的 Session，确保 Cookie 和拦截器有效
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false
        }
      })

      // 后台浏览器始终保持静音，防止试听网页播放出声音打扰用户
      downloadWin.webContents.audioMuted = true

      // 网页加载成功后，不断检测 JZZ，并模拟点击试听播放按钮触发拦截下载
      downloadWin.webContents.on('did-finish-load', () => {
        let retries = 0
        const interval = setInterval(() => {
          if (downloadWin.isDestroyed()) {
            clearInterval(interval)
            return
          }

          downloadWin.webContents.executeJavaScript(`
            (function() {
              // 1. 确保注入 JZZ 拦截脚本以捕获音频流并转为本地下载
              if (typeof JZZ !== "undefined" && JZZ.MIDI && JZZ.MIDI.SMF) {
                if (!window._hijacked_registered) {
                  window._hijacked_registered = true;
                  var Original_JZZ_MIDI_SMF = JZZ.MIDI.SMF;
                  JZZ.MIDI.SMF = function(Midi_File){
                    var Midi_File_Name = document.title.replace(" MIDI 音乐下载试听 :: MidiShow","") + ".mid"
                    var Midi_File_Binary_Array = new Uint8Array(Midi_File.length);
                    for (var Binary_Pointer = 0; Binary_Pointer < Midi_File.length ; Binary_Pointer++) { 
                      Midi_File_Binary_Array[Binary_Pointer] = Midi_File.charCodeAt(Binary_Pointer);
                    }
                    var Midi_File_Blob = new Blob([Midi_File_Binary_Array],{type:''});
                    var Midi_File_Url = URL.createObjectURL(Midi_File_Blob);
                    var Midi_Downloader = document.createElement("a");
                    Midi_Downloader.setAttribute("href",Midi_File_Url);
                    Midi_Downloader.setAttribute("download",Midi_File_Name);
                    Midi_Downloader.setAttribute("target","_blank");
                    let Click_Event = document.createEvent("MouseEvents");
                    Click_Event.initEvent("click",true,true);
                    Midi_Downloader.dispatchEvent(Click_Event);
                    return Original_JZZ_MIDI_SMF(Midi_File);
                  }
                  console.log('JZZ SMF Hijacked inside hidden window!');
                }
              }

              // 2. 模拟点击试听按钮
              var playBtn = document.querySelector('.j-play.ms-player-play');
              if (playBtn) {
                playBtn.click();
                return { success: true, msg: 'Clicked' };
              }
              return { success: false, msg: 'Waiting play button' };
            })()
          `).then((res) => {
            if (res && res.success) {
              clearInterval(interval)
              // 给 8 秒缓冲时间，供 will-download 拦截并静默下载文件，然后销毁窗口
              setTimeout(() => {
                if (!downloadWin.isDestroyed()) {
                  downloadWin.destroy()
                }
              }, 8000)
            }
          }).catch((err) => {
            console.error('Execute inject script error:', err)
          })

          if (retries++ > 30) { // 30秒超时自毁
            clearInterval(interval)
            if (!downloadWin.isDestroyed()) {
              downloadWin.destroy()
            }
          }
        }, 1000)
      })

      // 加载页面
      await downloadWin.loadURL(url)
      return { success: true }
    } catch (err: any) {
      console.error('Download cloud midi error:', err)
      return { success: false, error: err.message }
    }
  })

  // 打开登录小窗口进行在线曲库账号登录
  ipcMain.on('midi:openLogin', () => {
    const { BrowserWindow } = require('electron')
    const loginWin = new BrowserWindow({
      width: 520,
      height: 640,
      title: '登录到 MidiShow',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:midishow', // 核心：共用同一 session，以将 Cookie 共享并持久化
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    })

    // 监听登录窗口关闭事件，等用户手动关闭后通知大窗口自动重刷以读取最新状态
    loginWin.on('closed', () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('midi:loginSuccess')
      }
    })

    loginWin.loadURL('https://www.midishow.com/user/account/login')
  })

  return mainWindow
}

// 应用准备就绪后创建窗口
app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.tanqin.genshinautolyre')
  }

  // 确保目录存在
  try {
    await mkdir(midiDirPath, { recursive: true })
    await mkdir(join(midiDirPath, 'cache'), { recursive: true })
  } catch (err) {
    console.error('无法创建 midi 目录:', err)
  }

  // 初始化键盘模拟器
  await initKeyboardSimulator()
  
  const mainWindow = createWindow()

  // 监听目录变化，使用防抖以避免频繁触发
  let watchTimeout: NodeJS.Timeout | null = null
  watch(midiDirPath, { recursive: true }, () => {
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

  // 拦截所有 webview 的新窗口请求 (target="_blank")，强制在当前 webview 内跳转
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        contents.loadURL(url)
        return { action: 'deny' }
      })
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
  globalShortcut.unregisterAll()
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
