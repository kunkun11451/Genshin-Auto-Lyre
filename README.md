# Genshin Auto Lyre

- Genshin Auto Lyre 是一款基于 Electron + React 开发的，专为猿神等21琴键游戏设计桌面端自动弹琴工具。
- 内置 游戏内乐器的采样供试听效果、使用 MidiShow 驱动的云端曲库在线搜索一键导入功能 与 便捷的多人同步合奏等特色功能。

---

##  快速开始

您可以直接前往项目 [Releases 页面](https://github.com/kunkun11451/Genshin-Auto-Lyre/releases/latest)下载编译好的现成发行版，解压后直接双击exe文件运行使用。首次启动时会在根目录创建midi文件夹，请将您需要的 MIDI 曲谱文件放入该文件夹中，程序会自动加载并显示在曲库列表中。

---

##  项目结构

```text
├── src
│   ├── main                  # Electron 主进程 (窗口控制、无头登录与无缝拦截下载服务)
│   ├── preload               # 桥接 Preload 安全上下文 (安全暴露 IPC 请求)
│   └── renderer              # 前端 React 渲染进程
│       ├── components        # UI 界面组件 (FileList 曲库、PlaybackControls 播放条、TrackCanvas 琴谱流)
│       ├── core              # 音频处理、黑键映射算法核心
│       └── store             # Zustand 共享全局状态机
```
