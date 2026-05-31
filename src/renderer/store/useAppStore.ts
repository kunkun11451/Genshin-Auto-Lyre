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
  currentFileIndex: number
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

  // ===== 音频预览 =====
  audioPreviewEnabled: boolean

  // ===== 设置 =====
  blackKeyConfig: BlackKeyConfig
  transpose: number
  startDelaySec: number
  minInterval: number
  minDuration: number

  // ===== Actions =====
  addFiles: (files: MidiFileInfo[]) => void
  removeFile: (index: number) => void
  selectFile: (index: number) => void
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

  setBlackKeyConfig: (config: BlackKeyConfig) => void
  setTranspose: (transpose: number) => void
  setStartDelaySec: (sec: number) => void

  bgOpacity: number
  setBgOpacity: (opacity: number) => void
}

// ============================================================
// Store
// ============================================================

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 初始状态
      midiFiles: [],
      currentFileIndex: -1,
      searchQuery: '',

      parsedMidi: null,
      mappedNotes: [],

      playbackState: 'idle',
      currentTimeMs: 0,
      playbackSpeed: 1.0,

      activeKeys: new Set(),

      audioPreviewEnabled: false,

      blackKeyConfig: { ...DEFAULT_BLACK_KEY_CONFIG },
      transpose: 0,
      startDelaySec: 3,
      minInterval: DEFAULT_MAPPER_OPTIONS.minInterval,
      minDuration: DEFAULT_MAPPER_OPTIONS.minDuration,
      bgOpacity: 0.8,

      // ===== Actions =====

      addFiles: (files) => set((state) => {
        const existingPaths = new Set(state.midiFiles.map((f) => f.path))
        const newFiles = files.filter((f) => !existingPaths.has(f.path))
        return { midiFiles: [...state.midiFiles, ...newFiles] }
      }),

      removeFile: (index) => set((state) => {
        const newFiles = [...state.midiFiles]
        newFiles.splice(index, 1)
        let newIndex = state.currentFileIndex
        if (index === newIndex) {
          newIndex = -1
        } else if (index < newIndex) {
          newIndex--
        }
        return { midiFiles: newFiles, currentFileIndex: newIndex }
      }),

      selectFile: (index) => set({ currentFileIndex: index }),

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

      setAudioPreviewEnabled: (enabled) => set({ audioPreviewEnabled: enabled }),

      setBlackKeyConfig: (config) => set({ blackKeyConfig: config }),

      setTranspose: (transpose) => set({ transpose: Math.max(-12, Math.min(12, transpose)) }),

      setStartDelaySec: (sec) => set({ startDelaySec: Math.max(0, Math.min(10, sec)) }),

      setBgOpacity: (opacity) => set({ bgOpacity: Math.max(0, Math.min(1, opacity)) })
    }),
    {
      name: 'autopiano-storage',
      // 只持久化需要保存的配置和文件列表，不保存解析后的数据和播放状态
      partialize: (state) => ({
        midiFiles: state.midiFiles,
        audioPreviewEnabled: state.audioPreviewEnabled,
        blackKeyConfig: state.blackKeyConfig,
        transpose: state.transpose,
        startDelaySec: state.startDelaySec,
        bgOpacity: state.bgOpacity
      })
    }
  )
)

