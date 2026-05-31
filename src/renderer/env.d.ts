/// <reference types="vite/client" />

// electronAPI 类型声明
interface ElectronAPI {
  // 窗口控制
  minimize: () => void
  maximize: () => void
  close: () => void
  toggleAlwaysOnTop: () => Promise<boolean>
  setMiniMode: (isMini: boolean) => void

  // ===== 文件操作 =====
  listMidiFiles: () => Promise<string[]>
  openMidiDir: () => void
  renameMidiFile: (oldPath: string, newName: string) => Promise<string>
  deleteMidiFile: (filePath: string) => Promise<void>
  onDirChanged: (callback: () => void) => () => void
  readMidiFile: (filePath: string) => Promise<ArrayBuffer>

  // 键盘模拟
  keyDown: (key: string) => void
  keyUp: (key: string) => void

  // 在线曲库
  setupMidiSession: (partitionName: string) => void
  onMidiDownloaded: (callback: (path: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
