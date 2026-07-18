import { app, BrowserWindow, ipcMain, shell, globalShortcut } from 'electron'
import { join, dirname, parse, basename } from 'path'
import { readFile, readdir, stat, mkdir, rename, copyFile, rm } from 'fs/promises'
import chokidar from 'chokidar'
import { execSync } from 'child_process'
import { initKeyboardSimulator, simulateKeyDown, simulateKeyUp, simulateKeyBatch, destroyKeyboardSimulator } from './keyboard-simulator'
import { checkUpdate, downloadUpdate, getUpdatePaths, applyUpdate, cleanUpdateTempFiles } from './updater'

// 判断是否为开发模式
const isDev = !app.isPackaged

// 全局更新状态
let isUpdateReady = false
let updateAsset = ''
let isUpdateApplied = false
let isDownloadingUpdate = false

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
      webviewTag: true,
      devTools: isDev
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

  let isQuitting = false
  mainWindow.on('close', (e) => {
    if (isDownloadingUpdate && !isQuitting) {
      e.preventDefault()
      const { dialog } = require('electron')
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['确定退出', '取消'],
        defaultId: 1,
        title: '下载未完成',
        message: '更新包正在下载中，退出将中断更新。',
        detail: '确定要退出软件吗？',
        cancelId: 1
      })

      if (choice === 0) {
        isQuitting = true
        mainWindow.close()
      }
    }
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

  ipcMain.handle('midi:getBaseDir', () => {
    return midiDirPath
  })

  async function getUniqueFilePath(destPath: string): Promise<string> {
    let uniquePath = destPath
    let counter = 1
    const parsed = parse(destPath)
    while (true) {
      try {
        await stat(uniquePath)
        uniquePath = join(parsed.dir, `${parsed.name} (${counter})${parsed.ext}`)
        counter++
      } catch {
        break
      }
    }
    return uniquePath
  }

  // 复制文件
  ipcMain.handle('midi:copy', async (_event, sourcePaths: string[], targetDir: string) => {
    const results: string[] = []
    for (const src of sourcePaths) {
      const fileName = basename(src)
      const targetPath = join(targetDir, fileName)
      const uniquePath = await getUniqueFilePath(targetPath)
      await copyFile(src, uniquePath)
      results.push(uniquePath)
    }
    return results
  })

  // 移动文件
  ipcMain.handle('midi:move', async (_event, sourcePaths: string[], targetDir: string) => {
    const results: string[] = []
    for (const src of sourcePaths) {
      // 避免将文件移动到它自己所在的文件夹
      if (dirname(src) === targetDir) {
        results.push(src)
        continue
      }
      const fileName = basename(src)
      const targetPath = join(targetDir, fileName)
      const uniquePath = await getUniqueFilePath(targetPath)
      await rename(src, uniquePath)
      results.push(uniquePath)
    }
    return results
  })

  ipcMain.on('midi:openDir', () => {
    shell.openPath(midiDirPath)
  })

  ipcMain.handle('midi:rename', async (_event, oldPath: string, newName: string) => {
    const isDirectory = (await stat(oldPath)).isDirectory()
    let finalName = newName
    if (!isDirectory && !newName.toLowerCase().endsWith('.mid') && !newName.toLowerCase().endsWith('.midi')) {
      finalName = newName + '.mid'
    }
    const newPath = join(dirname(oldPath), finalName)
    await rename(oldPath, newPath)
    return newPath
  })

  ipcMain.handle('midi:delete', async (_event, filePath: string) => {
    await rm(filePath, { recursive: true, force: true })
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
        show: isDev, // 在开发模式下显示出窗口以便调试
        width: 800,
        height: 600,
        webPreferences: {
          partition: 'persist:midishow', // 共享相同的 Session，确保 Cookie 和拦截器有效
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false
        }
      })

      if (isDev) {
        downloadWin.webContents.openDevTools()
      }

      // 后台浏览器始终保持静音，防止试听网页播放出声音打扰用户
      downloadWin.webContents.audioMuted = true

      // 使用 dom-ready 提前注入，不需要等待 did-finish-load (图片等资源加载完毕)
      downloadWin.webContents.on('dom-ready', () => {
        let retries = 0
        const interval = setInterval(() => {
          if (downloadWin.isDestroyed()) {
            clearInterval(interval)
            return
          }

          downloadWin.webContents.executeJavaScript(`
            (async function() {
              if (typeof window.$ === 'undefined' || typeof JZZ === 'undefined' || !JZZ.MIDI || !JZZ.MIDI.SMF) {
                return { success: false, msg: 'Waiting for libraries' };
              }

              if (!window._hijacked_registered) {
                window._hijacked_registered = true;
                var Original_JZZ_MIDI_SMF = JZZ.MIDI.SMF;
                JZZ.MIDI.SMF = function(Midi_File){
                  var e = $('.ms-player-container');
                  var id = e.data('id') || 'unknown';
                  var titleElem = e.find('h1.pl-md-player');
                  var title = titleElem.length ? titleElem.text().trim() : document.title.replace(" MIDI 音乐下载试听 :: MidiShow","");
                  var Midi_File_Name = id + " - " + title + ".mid";
                  
                  var Midi_File_Binary_Array = new Uint8Array(Midi_File.length);
                  for (var Binary_Pointer = 0; Binary_Pointer < Midi_File.length ; Binary_Pointer++) { 
                    Midi_File_Binary_Array[Binary_Pointer] = Midi_File.charCodeAt(Binary_Pointer);
                  }
                  var Midi_File_Blob = new Blob([Midi_File_Binary_Array],{type:'audio/midi'});
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
                console.log('JZZ SMF Hijacked for fast download!');
              }

              var e = $('.ms-player-container');
              if (e.length === 0) return { success: false, msg: 'Waiting container' };
              
              var plugin = e.JzzPlayer();
              if (!plugin) return { success: false, msg: 'Waiting plugin' };
              
              var player = plugin.data('plugin_JzzPlayer');
              if (!player) return { success: false, msg: 'Waiting player' };
              
              if (!window._download_triggered) {
                window._download_triggered = true;
                // 直接调用 loadUrl 而不是等待和点击播放按钮
                await player.loadUrl();
                return { success: true, msg: 'Triggered loadUrl' };
              }
              return { success: false, msg: 'Already triggered' };
            })()
          `).then((res) => {
            if (res && res.success) {
              clearInterval(interval)
              // 给 5 秒缓冲时间，供 will-download 拦截并静默下载文件，然后销毁窗口
              setTimeout(() => {
                if (!downloadWin.isDestroyed()) {
                  downloadWin.destroy()
                }
              }, 5000)
            }
          }).catch((err) => {
            console.error('Execute inject script error:', err)
          })

          if (retries++ > 1000) { // 20秒超时自毁 (20ms * 1000)
            clearInterval(interval)
            if (!downloadWin.isDestroyed()) {
              downloadWin.destroy()
            }
          }
        }, 20)
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
  ipcMain.on('midi:openLogin', (event, lang?: string) => {
    let windowTitle = '登录到 MidiShow，登录成功后直接关闭本窗口即可'
    let targetUrl = 'https://www.midishow.com/user/account/login'

    if (lang?.startsWith('en')) {
      windowTitle = 'Log in to MidiShow - Please close this window after a successful login'
      targetUrl = 'https://www.midishow.com/en/user/account/login'
    } else if (lang === 'zh-TW' || lang === 'yue') {
      windowTitle = '登入到 MidiShow，登入成功後直接關閉本視窗即可'
      targetUrl = 'https://www.midishow.com/zh-tw/user/account/login'
    }

    const { BrowserWindow } = require('electron')
    const loginWin = new BrowserWindow({
      width: 520,
      height: 640,
      title: windowTitle,
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:midishow', // 核心：共用同一 session，以将 Cookie 共享并持久化
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        devTools: isDev
      }
    })

    loginWin.on('page-title-updated', (e: Electron.Event) => {
      e.preventDefault()
    })

    // 监听登录窗口关闭事件，等用户手动关闭后通知大窗口自动重刷以读取最新状态
    loginWin.on('closed', () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('midi:loginSuccess')
      }
    })

    loginWin.loadURL(targetUrl)
  })

  // ===== 自动更新 IPC =====
  ipcMain.handle('app:getVersion', () => isDev ? 'dev' : app.getVersion())

  ipcMain.handle('update:check', async () => {
    return await checkUpdate()
  })

  ipcMain.on('update:start', async (_event, downloadUrl: string) => {
    const { zipPath } = getUpdatePaths()
    isDownloadingUpdate = true
    
    const tryDownload = async (url: string): Promise<void> => {
      return await downloadUpdate(url, zipPath, (percent) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:progress', percent)
        }
      })
    }

    try {
      // 优先尝试通过指定代理站下载更新，提高国内下载成功率
      const acceleratedUrl = `https://v4.gh-proxy.org/${downloadUrl}`
      console.log('正在尝试通过首选代理站下载更新:', acceleratedUrl)
      await tryDownload(acceleratedUrl)
      
      isUpdateReady = true
      isDownloadingUpdate = false
      updateAsset = downloadUrl
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:ready')
      }
    } catch (err: any) {
      console.warn('首选代理站下载失败，尝试降级从 GitHub 官方直连下载:', err)
      try {
        // 自动降级从原生的官方 GitHub 直连重新尝试下载
        await tryDownload(downloadUrl)
        
        isUpdateReady = true
        isDownloadingUpdate = false
        updateAsset = downloadUrl
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:ready')
        }
      } catch (rawErr: any) {
        isDownloadingUpdate = false
        console.error('更新下载彻底失败 (代理源与 GitHub 直连均不可用):', rawErr)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:error', rawErr.message || '下载更新包失败')
        }
      }
    }
  })

  ipcMain.on('update:apply', (_event, restartNow?: boolean) => {
    if (isUpdateReady && updateAsset && !isUpdateApplied) {
      if (isDev) {
        console.log('在开发模式下，更新已被拦截，防止破坏开发环境。')
        return
      }
      isUpdateApplied = true
      const { appDir, extractDir } = getUpdatePaths()
      applyUpdate(appDir, extractDir, !!restartNow)
      if (restartNow) {
        app.quit()
      }
    }
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

  // 启动时静默清理残留的更新临时文件
  cleanUpdateTempFiles()

  // 初始化键盘模拟器
  await initKeyboardSimulator()
  
  const mainWindow = createWindow()

  // 监听目录变化，使用防抖以避免频繁触发
  let watchTimeout: NodeJS.Timeout | null = null
  chokidar.watch(midiDirPath, { ignoreInitial: true, usePolling: true, interval: 1000 }).on('all', () => {
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

  if (isUpdateReady && updateAsset && !isDev && !isUpdateApplied) {
    isUpdateApplied = true
    const { appDir, extractDir } = getUpdatePaths()
    applyUpdate(appDir, extractDir)
  }
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
