# Genshin Auto Lyre

- Genshin Auto Lyre 是一款基于 Electron + React 开发的，专为猿神等21琴键游戏设计桌面端自动弹琴工具。
- 内置 游戏内乐器的采样供试听效果、使用 MidiShow 驱动的云端曲库在线搜索一键导入功能 与 便捷的多人同步合奏等特色功能。

---

##  快速开始

您可以直接前往项目 [Releases 页面](https://github.com/kunkun11451/Genshin-Auto-Lyre/releases)下载编译好的现成发行版，解压后直接双击exe文件运行使用。首次启动时会在根目录创建midi文件夹，请将您需要的 MIDI 曲谱文件放入该文件夹中，程序会自动加载并显示在曲库列表中。

---

##  项目结构

```text
├── src
│   ├── main                        # Electron 主进程
│   │   ├── index.ts                # 主入口 (IPC 绑定、窗口大小切换、无头下载 Session)
│   │   ├── keyboard-simulator.ts   # 底层键盘模拟驱动 (负责向系统发送物理按键信号)
│   │   └── updater.ts              # 软件检测更新与热更新文件释放模块
│   ├── preload                     # Preload 桥接安全上下文
│   │   └── index.ts                # 安全向 React 暴露 Electron 底层 IPC 通信接口
│   └── renderer                    # 前端 React 渲染进程
│       ├── App.tsx                 # 渲染进程主容器 (分发普通模式、小窗模式与云端曲库)
│       ├── components              # UI 组件目录
│       │   ├── FileList.tsx        # 本地曲谱列表加载、重命名与云端切换
│       │   ├── MidiShowBrowser.tsx # 嵌入式 MidiShow 曲库抓取下载与快捷登录窗口
│       │   ├── MultiplayerPanel.tsx# P2P 联机同步合奏控制台 (声部分配、准备就绪)
│       │   ├── PianoKeyboard.tsx   # 虚拟高亮钢琴键盘反馈
│       │   ├── PlaybackControls.tsx# 歌曲播放控制条与快速设置 (乐器、试听、联机)
│       │   └── SettingsPanel.tsx   # 热键修改、黑键映射参数与背景透明度设置面版
│       ├── core                    # 核心算法与引擎
│       │   ├── audio-preview.ts    # Tone.js 本地多声部试听采样器
│       │   ├── midi-parser.ts      # MIDI 文件二进制数据结构解析
│       │   ├── note-mapper.ts      # 21键物理音轨映射算法 (包含黑键及八度转换优化)
│       │   ├── playback-engine.ts  # 毫秒级高精度物理按键时间线播放引擎
│       │   └── network-manager.ts  # 基于 PeerJS 实现的 P2P 网络同步管理器
│       └── store                   # 状态管理
│           └── useAppStore.ts      # Zustand 全局状态机 (管理播放状态、配置并本地持久化)
```
