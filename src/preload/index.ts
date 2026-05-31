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
  keyUp: (key: string) => ipcRenderer.send('keyboard:keyUp', key)
})
