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

  // ===== 文件操作（占位，后续实现） =====
  /** 打开文件选择对话框 */
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  /** 打开文件夹选择对话框 */
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  /** 读取 MIDI 文件内容 */
  readMidiFile: (filePath: string) => ipcRenderer.invoke('midi:readFile', filePath),

  // ===== 键盘模拟（占位，后续实现） =====
  /** 模拟按键按下 */
  keyDown: (key: string) => ipcRenderer.send('keyboard:keyDown', key),
  /** 模拟按键释放 */
  keyUp: (key: string) => ipcRenderer.send('keyboard:keyUp', key)
})
