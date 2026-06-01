# Genshin Auto Lyre

Genshin Auto Lyre 是一款基于 Electron + React 开发的桌面端自动弹琴工具。专为猿神等21琴键键盘游戏设计。拥有极简风格的设计主题，内置使用MidiShow驱动的云端曲库与音符映射引擎，方便玩家进行 MIDI 自动演奏、试听与本地曲库管理。

---

##  快速开始

您可以直接前往项目 [Releases 页面](https://github.com/kunkun11451/Genshin-Auto-Lyre/releases)下载编译好的现成发行版，解压后即右键以管理员身份运行使用。首次启动时会在根目录创建midi文件夹，请将您需要的 MIDI 曲谱文件放入该文件夹中，程序会自动加载并显示在曲库列表中。

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
