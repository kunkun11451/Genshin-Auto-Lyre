/**
 * useAppStore.ts - 应用主状态管理
 *
 * 使用 Zustand 管理全局状态，包括 MIDI 文件列表、
 * 解析结果、播放状态、视图状态和活跃按键。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ParsedMidi, ParsedNote } from '../core/midi-parser'
import type { MappedNote, MapperOptions, BlackKeyConfig } from '../core/note-mapper'
import { DEFAULT_BLACK_KEY_CONFIG, DEFAULT_MAPPER_OPTIONS } from '../core/note-mapper'
import type { PlaybackState } from '../core/playback-engine'

// ============================================================
// 类型定义
// ============================================================

/** MIDI 文件信息 */
export interface MidiFileInfo {
  /** 文件完整路径 */
  path: string
  /** 文件名 */
  name: string
}

/** 应用状态接口 */
interface AppState {
  // ===== MIDI 文件列表 =====
  midiFiles: MidiFileInfo[]
  currentFilePath: string | null
  latestDownloadedMidi: string | null
  midiShowUrl: string | null
  searchQuery: string

  // ===== 解析结果 =====
  parsedMidi: ParsedMidi | null
  mappedNotes: MappedNote[]

  // ===== 播放状态 =====
  playbackState: PlaybackState
  currentTimeMs: number
  playbackSpeed: number

  // ===== 活跃按键（用于钢琴键盘高亮） =====
  activeKeys: Set<string>

  // ===== 界面模式 =====
  isMiniMode: boolean
  setMiniMode: (isMini: boolean) => void
  isSettingsOpen: boolean
  setIsSettingsOpen: (isOpen: boolean) => void
  bgOpacity: number
  setBgOpacity: (opacity: number) => void

  // ===== 音频预览 =====
  audioPreviewEnabled: boolean

  // ===== 设置 =====
  instrumentMode: 'standard' | 'chord' | 'horn'
  blackKeyConfig: BlackKeyConfig
  transpose: number
  startDelaySec: number
  minInterval: number
  minDuration: number
  theme: 'system' | 'light' | 'dark'
  playbackShortcut: string
  stopShortcut: string
  speedUpShortcut: string
  speedDownShortcut: string

  // ===== 自动更新 =====
  appVersion: string
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  updateInfo: any | null
  updateProgress: number
  updateErrorMsg: string

  // ===== Actions =====
  setMidiFiles: (files: MidiFileInfo[]) => void
  selectFile: (path: string | null) => void
  setLatestDownloadedMidi: (path: string | null) => void
  setMidiShowUrl: (url: string | null) => void
  setSearchQuery: (query: string) => void

  setParsedMidi: (midi: ParsedMidi | null) => void
  setMappedNotes: (notes: MappedNote[]) => void

  setPlaybackState: (state: PlaybackState) => void
  setCurrentTime: (timeMs: number) => void
  setPlaybackSpeed: (speed: number) => void

  addActiveKey: (key: string) => void
  removeActiveKey: (key: string) => void
  clearActiveKeys: () => void

  setAudioPreviewEnabled: (enabled: boolean) => void

  setInstrumentMode: (mode: 'standard' | 'chord' | 'horn') => void
  setBlackKeyConfig: (config: BlackKeyConfig) => void
  setTranspose: (transpose: number) => void
  setStartDelaySec: (sec: number) => void
  setTheme: (theme: 'system' | 'light' | 'dark') => void
  setPlaybackShortcut: (shortcut: string) => void
  setStopShortcut: (shortcut: string) => void
  setSpeedUpShortcut: (shortcut: string) => void
  setSpeedDownShortcut: (shortcut: string) => void
  setAppVersion: (v: string) => void
  setUpdateStatus: (s: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error') => void
  setUpdateInfo: (info: any) => void
  setUpdateProgress: (p: number) => void
  setUpdateErrorMsg: (msg: string) => void
}

// ============================================================
// Store
// ============================================================

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 初始状态
      midiFiles: [],
      currentFilePath: null,
      latestDownloadedMidi: null,
      midiShowUrl: null,
      searchQuery: '',

      parsedMidi: null,
      mappedNotes: [],

      playbackState: 'idle',
      currentTimeMs: 0,
      playbackSpeed: 1.0,

      activeKeys: new Set(),

      isMiniMode: false,
      isSettingsOpen: false,
      bgOpacity: 1.0,

      audioPreviewEnabled: false,

      instrumentMode: 'standard',
      blackKeyConfig: { ...DEFAULT_BLACK_KEY_CONFIG },
      transpose: 0,
      startDelaySec: 3,
      minInterval: DEFAULT_MAPPER_OPTIONS.minInterval,
      minDuration: DEFAULT_MAPPER_OPTIONS.minDuration,
      theme: 'system',
      playbackShortcut: 'Home',
      stopShortcut: 'End',
      speedUpShortcut: 'PageUp',
      speedDownShortcut: 'PageDown',

      appVersion: '',
      updateStatus: 'idle',
      updateInfo: null,
      updateProgress: 0,
      updateErrorMsg: '',

      // ===== Actions =====

      setMidiFiles: (files) => set({ midiFiles: files }),

      selectFile: (path) => set({ currentFilePath: path }),

      setLatestDownloadedMidi: (path) => set({ latestDownloadedMidi: path }),

      setMidiShowUrl: (url) => set({ midiShowUrl: url }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setParsedMidi: (midi) => set({ parsedMidi: midi }),

      setMappedNotes: (notes) => set({ mappedNotes: notes }),

      setPlaybackState: (state) => set({ playbackState: state }),

      setCurrentTime: (timeMs) => set({ currentTimeMs: timeMs }),

      setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.25, Math.min(2.0, speed)) }),

      addActiveKey: (key) => set((state) => {
        const newKeys = new Set(state.activeKeys)
        newKeys.add(key)
        return { activeKeys: newKeys }
      }),

      removeActiveKey: (key) => set((state) => {
        const newKeys = new Set(state.activeKeys)
        newKeys.delete(key)
        return { activeKeys: newKeys }
      }),

      clearActiveKeys: () => set({ activeKeys: new Set() }),

      setMiniMode: (isMini) => {
        if (isMini === get().isMiniMode) return // 状态一致时不处理，防止重复隐藏窗口造成闪烁
        // 先发送 IPC 让主进程隐藏并调整窗口
        window.electronAPI.setMiniMode(isMini)
        // 延迟一点点更新 React 状态，确保主进程已经把窗口隐藏了，从而避免看到页面内部排版的闪烁
        setTimeout(() => {
          set({ isMiniMode: isMini })
        }, 50)
      },

      setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),

      setBgOpacity: (opacity) => set({ bgOpacity: Math.max(0.1, Math.min(1.0, opacity)) }),

      setAudioPreviewEnabled: (enabled) => set({ audioPreviewEnabled: enabled }),

      setInstrumentMode: (mode) => set({ instrumentMode: mode }),

      setBlackKeyConfig: (config) => set({ blackKeyConfig: config }),

      setTranspose: (transpose) => set({ transpose: Math.max(-12, Math.min(12, transpose)) }),

      setStartDelaySec: (sec) => set({ startDelaySec: Math.max(0, Math.min(10, sec)) }),

      setTheme: (theme) => set({ theme }),
      
      setPlaybackShortcut: (shortcut) => {
        set({ playbackShortcut: shortcut })
        // 通知主进程更新快捷键
        window.electronAPI.registerPlaybackShortcut(shortcut)
      },

      setStopShortcut: (shortcut) => {
        set({ stopShortcut: shortcut })
        window.electronAPI.registerStopShortcut(shortcut)
      },

      setSpeedUpShortcut: (shortcut) => {
        set({ speedUpShortcut: shortcut })
        window.electronAPI.registerSpeedUpShortcut(shortcut)
      },

      setSpeedDownShortcut: (shortcut) => {
        set({ speedDownShortcut: shortcut })
        window.electronAPI.registerSpeedDownShortcut(shortcut)
      },

      setAppVersion: (v) => set({ appVersion: v }),
      setUpdateStatus: (s) => set({ updateStatus: s }),
      setUpdateInfo: (info) => set({ updateInfo: info }),
      setUpdateProgress: (p) => set({ updateProgress: p }),
      setUpdateErrorMsg: (msg) => set({ updateErrorMsg: msg })
    }),
    {
      name: 'genshin-auto-lyre-storage',
      // 只持久化需要保存的配置，不保存文件列表（改由专属文件夹实时同步读取）
      partialize: (state) => ({
        audioPreviewEnabled: state.audioPreviewEnabled,
        instrumentMode: state.instrumentMode,
        blackKeyConfig: state.blackKeyConfig,
        transpose: state.transpose,
        startDelaySec: state.startDelaySec,
        bgOpacity: state.bgOpacity,
        theme: state.theme,
        playbackShortcut: state.playbackShortcut,
        stopShortcut: state.stopShortcut,
        speedUpShortcut: state.speedUpShortcut,
        speedDownShortcut: state.speedDownShortcut
      })
    }
  )
)

