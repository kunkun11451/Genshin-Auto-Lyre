import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // ===== 窗口控制 =====
  /** 最小化窗口 */
  minimize: () => ipcRenderer.send('window:minimize'),
  /** 最大化/还原窗口 */
  maximize: () => ipcRenderer.send('window:maximize'),
  /** 关闭窗口 */
  close: () => ipcRenderer.send('window:close'),
  /** 切换置顶状态 */
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  /** 设置小窗模式 */
  setMiniMode: (isMini: boolean) => ipcRenderer.send('window:setMiniMode', isMini),
  /** 监听最大化状态变化 */
  onMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: any, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window:maximizedState', handler)
    return () => ipcRenderer.off('window:maximizedState', handler)
  },

  // ===== 文件操作 =====
  /** 获取专属文件夹下所有 MIDI 文件 */
  listMidiFiles: () => ipcRenderer.invoke('midi:list'),
  /** 打开系统资源管理器访问 MIDI 专属文件夹 */
  openMidiDir: () => ipcRenderer.send('midi:openDir'),
  /** 重命名 MIDI 文件 */
  renameMidiFile: (oldPath: string, newName: string) => ipcRenderer.invoke('midi:rename', oldPath, newName),
  /** 删除 MIDI 文件 */
  deleteMidiFile: (filePath: string) => ipcRenderer.invoke('midi:delete', filePath),
  /** 监听专属文件夹文件变化 */
  onDirChanged: (callback: () => void) => {
    ipcRenderer.on('midi:dirChanged', callback)
    return () => ipcRenderer.off('midi:dirChanged', callback)
  },
  /** 读取 MIDI 文件内容 */
  readMidiFile: (filePath: string) => ipcRenderer.invoke('midi:readFile', filePath),

  // ===== 键盘模拟（占位，后续实现） =====
  /** 模拟按键按下 */
  keyDown: (key: string) => ipcRenderer.send('keyboard:keyDown', key),
  /** 模拟按键释放 */
  keyUp: (key: string) => ipcRenderer.send('keyboard:keyUp', key),
  /** 批量模拟按键 */
  keyBatch: (downs: string[], ups: string[]) => ipcRenderer.send('keyboard:keyBatch', downs, ups),
  /** 注册全局播放控制快捷键 */
  registerPlaybackShortcut: (shortcut: string) => ipcRenderer.send('shortcut:register', shortcut),
  /** 监听全局播放控制快捷键触发 */
  onPlaybackShortcutTriggered: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:triggered', handler)
    return () => ipcRenderer.off('shortcut:triggered', handler)
  },
  /** 注册全局停止控制快捷键 */
  registerStopShortcut: (shortcut: string) => ipcRenderer.send('shortcut:registerStop', shortcut),
  /** 监听全局停止快捷键触发 */
  onStopShortcutTriggered: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:stopTriggered', handler)
    return () => ipcRenderer.off('shortcut:stopTriggered', handler)
  },
  /** 注册全局加速快捷键 */
  registerSpeedUpShortcut: (shortcut: string) => ipcRenderer.send('shortcut:registerSpeedUp', shortcut),
  /** 监听全局加速快捷键触发 */
  onSpeedUpShortcutTriggered: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:speedUpTriggered', handler)
    return () => ipcRenderer.off('shortcut:speedUpTriggered', handler)
  },
  /** 注册全局减速快捷键 */
  registerSpeedDownShortcut: (shortcut: string) => ipcRenderer.send('shortcut:registerSpeedDown', shortcut),
  /** 监听全局减速快捷键触发 */
  onSpeedDownShortcutTriggered: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:speedDownTriggered', handler)
    return () => ipcRenderer.off('shortcut:speedDownTriggered', handler)
  },

  // ===== 在线曲库 =====
  /** 初始化 webview 的 session（CSP 剥离 + 下载拦截） */
  setupMidiSession: (partitionName: string) => ipcRenderer.send('midi:setupSession', partitionName),
  /** 监听后台下载完成事件 */
  onMidiDownloaded: (callback: (path: string) => void) => {
    const handler = (_e: any, path: string) => callback(path)
    ipcRenderer.on('midi:downloaded', handler)
    return () => ipcRenderer.off('midi:downloaded', handler)
  },
  /** 发送云端搜索请求 */
  fetchCloudSearch: (url: string) => ipcRenderer.invoke('midi:fetchCloudSearch', url),
  /** 发送后台静默下载请求 */
  downloadCloudMidi: (url: string) => ipcRenderer.invoke('midi:downloadCloudMidi', url),
  /** 打开登录小窗口进行登录 */
  openLoginWindow: (lang?: string) => ipcRenderer.send('midi:openLogin', lang),
  /** 监听登录成功事件 */
  onLoginSuccess: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('midi:loginSuccess', handler)
    return () => ipcRenderer.off('midi:loginSuccess', handler)
  },

  // ===== 自动更新 =====
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  startUpdate: (downloadUrl: string, assetName: string) => ipcRenderer.send('update:start', downloadUrl, assetName),
  applyUpdate: (restartNow: boolean) => ipcRenderer.send('update:apply', restartNow),
  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_e: any, p: number) => callback(p)
    ipcRenderer.on('update:progress', handler)
    return () => ipcRenderer.off('update:progress', handler)
  },
  onUpdateReady: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('update:ready', handler)
    return () => ipcRenderer.off('update:ready', handler)
  },
  onUpdateError: (callback: (err: string) => void) => {
    const handler = (_e: any, err: string) => callback(err)
    ipcRenderer.on('update:error', handler)
    return () => ipcRenderer.off('update:error', handler)
  }
})
