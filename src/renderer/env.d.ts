/// <reference types="vite/client" />

// electronAPI 类型声明
interface ElectronAPI {
  // 窗口控制
  minimize: () => void
  maximize: () => void
  close: () => void
  toggleAlwaysOnTop: () => Promise<boolean>
  setMiniMode: (isMini: boolean) => void
  onMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => () => void

  // ===== 文件操作 =====
  listMidiFiles: () => Promise<string[]>
  getMidiBaseDir: () => Promise<string>
  copyMidiFiles: (sourcePaths: string[], targetDir: string) => Promise<string[]>
  moveMidiFiles: (sourcePaths: string[], targetDir: string) => Promise<string[]>
  openMidiDir: () => void
  renameMidiFile: (oldPath: string, newName: string) => Promise<string>
  deleteMidiFile: (filePath: string) => Promise<void>
  onDirChanged: (callback: () => void) => () => void
  readMidiFile: (filePath: string) => Promise<ArrayBuffer>

  // 键盘模拟
  keyDown: (key: string) => void
  keyUp: (key: string) => void
  keyBatch: (downs: string[], ups: string[]) => void
  registerPlaybackShortcut: (shortcut: string) => void
  onPlaybackShortcutTriggered: (callback: () => void) => () => void
  registerStopShortcut: (shortcut: string) => void
  onStopShortcutTriggered: (callback: () => void) => () => void
  registerSpeedUpShortcut: (shortcut: string) => void
  onSpeedUpShortcutTriggered: (callback: () => void) => () => void
  registerSpeedDownShortcut: (shortcut: string) => void
  onSpeedDownShortcutTriggered: (callback: () => void) => () => void

  // 在线曲库
  setupMidiSession: (partitionName: string) => void
  onMidiDownloaded: (callback: (path: string) => void) => () => void
  fetchCloudSearch: (url: string) => Promise<{ success: boolean; html?: string; error?: string }>
  downloadCloudMidi: (url: string) => Promise<{ success: boolean; error?: string }>
  openLoginWindow: (lang?: string) => void
  onLoginSuccess: (callback: () => void) => () => void

  // 自动更新
  getAppVersion: () => Promise<string>
  checkUpdate: () => Promise<any>
  startUpdate: (downloadUrl: string, assetName: string) => void
  applyUpdate: (restartNow: boolean) => void
  onUpdateProgress: (callback: (percent: number) => void) => () => void
  onUpdateReady: (callback: () => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
