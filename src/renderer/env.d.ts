/// <reference types="vite/client" />

// electronAPI 类型声明
interface ElectronAPI {
  // 窗口控制
  minimize: () => void
  maximize: () => void
  close: () => void
  toggleAlwaysOnTop: () => Promise<boolean>

  // 文件操作
  openFileDialog: () => Promise<string[] | null>
  openFolderDialog: () => Promise<string[] | null>
  readMidiFile: (filePath: string) => Promise<ArrayBuffer>

  // 键盘模拟
  keyDown: (key: string) => void
  keyUp: (key: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
