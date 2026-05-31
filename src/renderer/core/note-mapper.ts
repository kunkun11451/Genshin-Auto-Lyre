/**
 * note-mapper.ts - 音符映射模块
 *
 * 将 MIDI 原始音符映射到原神风物之诗琴的 21 个白键。
 * 支持分八度黑键处理策略、音域折叠、移调、去重和时值量化。
 */

import {
  GAME_NOTES,
  NOTE_TO_KEY,
  BLACK_KEY_SEMITONES,
  FLOOR_MAP,
  CEIL_MAP,
  NEAREST_MAP
} from './constants'
import type { ParsedNote } from './midi-parser'

// ============================================================
// 类型定义
// ============================================================

/** 黑键处理策略 */
export type BlackKeyStrategy = 'skip' | 'dual' | 'floor' | 'ceil' | 'nearest'

/** 分八度黑键策略配置 */
export interface BlackKeyConfig {
  /** 低音八度 (C3~B3) 的黑键策略 */
  lowOctave: BlackKeyStrategy
  /** 中音八度 (C4~B4) 的黑键策略 */
  midOctave: BlackKeyStrategy
  /** 高音八度 (C5~B5) 的黑键策略 */
  highOctave: BlackKeyStrategy
}

/** 映射器选项 */
export interface MapperOptions {
  /** 分八度黑键策略配置 */
  blackKeyConfig: BlackKeyConfig
  /** 整体移调（半音数，正数升调，负数降调） */
  transpose: number
  /** 最小音符间隔（毫秒） */
  minInterval: number
  /** 最小音符持续时间（毫秒） */
  minDuration: number
}

/** 映射后的音符（演奏指令） */
export interface MappedNote {
  /** 绝对开始时间（毫秒） */
  startMs: number
  /** 持续时间（毫秒），用于延音 */
  durationMs: number
  /** 映射后的 MIDI 音符号（48~83 白键） */
  midiNote: number
  /** 对应的键盘按键 */
  key: string
  /** 原始 MIDI 音符号（用于可视化对比） */
  originalNote: number
  /** 力度 0~1 */
  velocity: number
  /** 是否由 dual 策略生成（双键之一） */
  isDualGenerated: boolean
}

// ============================================================
// 默认配置
// ============================================================

/** 默认黑键配置：低音跳过，中高音双键演奏 */
export const DEFAULT_BLACK_KEY_CONFIG: BlackKeyConfig = {
  lowOctave: 'skip',
  midOctave: 'dual',
  highOctave: 'dual'
}

/** 默认映射选项 */
export const DEFAULT_MAPPER_OPTIONS: MapperOptions = {
  blackKeyConfig: DEFAULT_BLACK_KEY_CONFIG,
  transpose: 0,
  minInterval: 30,
  minDuration: 50
}

// ============================================================
// 游戏白键集合（用于快速查找）
// ============================================================
const GAME_NOTES_SET = new Set(GAME_NOTES)

// ============================================================
// 核心映射函数
// ============================================================

/**
 * 将音符折叠到可演奏范围 (C3=48 ~ B5=83)
 * 低于范围则升八度，高于范围则降八度
 */
function foldToRange(midiNote: number): number {
  const MIN = 48 // C3
  const MAX = 83 // B5
  while (midiNote < MIN) midiNote += 12
  while (midiNote > MAX) midiNote -= 12
  // 防止极端情况导致无限循环后仍越界
  if (midiNote < MIN || midiNote > MAX) return -1
  return midiNote
}

/**
 * 获取音符所在八度对应的黑键策略
 */
function getStrategyForNote(midiNote: number, config: BlackKeyConfig): BlackKeyStrategy {
  if (midiNote >= 48 && midiNote <= 59) return config.lowOctave
  if (midiNote >= 60 && midiNote <= 71) return config.midOctave
  if (midiNote >= 72 && midiNote <= 83) return config.highOctave
  // 兜底使用中音策略
  return config.midOctave
}

/**
 * 处理单个黑键音符
 * @returns 映射后的 MIDI 音符号数组（dual 返回 2 个，skip 返回空数组）
 */
function handleBlackKey(midiNote: number, strategy: BlackKeyStrategy): number[] {
  const octave = Math.floor(midiNote / 12)
  const semitone = midiNote % 12

  // 白键直接返回
  if (!BLACK_KEY_SEMITONES.has(semitone)) {
    return [midiNote]
  }

  switch (strategy) {
    case 'skip':
      return [] // 不演奏

    case 'dual':
      // 同时按下两侧白键
      return [
        octave * 12 + FLOOR_MAP[semitone],
        octave * 12 + CEIL_MAP[semitone]
      ]

    case 'floor':
      return [octave * 12 + FLOOR_MAP[semitone]]

    case 'ceil':
      return [octave * 12 + CEIL_MAP[semitone]]

    case 'nearest':
      return [octave * 12 + NEAREST_MAP[semitone]]

    default:
      return [midiNote]
  }
}

/**
 * 将解析后的 MIDI 音符列表映射为可演奏的指令序列
 *
 * 处理流程：
 * 1. 移调
 * 2. 音域折叠
 * 3. 分八度黑键处理
 * 4. 去重（同一时刻同一键只保留一个）
 * 5. 时值量化
 */
export function mapNotes(
  notes: ParsedNote[],
  options: MapperOptions = DEFAULT_MAPPER_OPTIONS
): MappedNote[] {
  const result: MappedNote[] = []

  for (const note of notes) {
    // 第一步：移调
    let transposedNote = note.note + options.transpose

    // 第二步：音域折叠
    const foldedNote = foldToRange(transposedNote)
    if (foldedNote === -1) continue // 折叠失败，跳过

    // 第三步：分八度黑键处理
    const strategy = getStrategyForNote(foldedNote, options.blackKeyConfig)
    const mappedNotes = handleBlackKey(foldedNote, strategy)

    for (let i = 0; i < mappedNotes.length; i++) {
      const mappedMidiNote = mappedNotes[i]

      // 确保映射结果是游戏支持的白键
      if (!GAME_NOTES_SET.has(mappedMidiNote)) continue

      // 获取对应的键盘按键
      const key = NOTE_TO_KEY[mappedMidiNote]
      if (!key) continue

      // 时值量化：确保持续时间不低于最小值
      const durationMs = Math.max(note.durationMs, options.minDuration)

      result.push({
        startMs: note.startMs,
        durationMs,
        midiNote: mappedMidiNote,
        key,
        originalNote: note.note,
        velocity: note.velocity,
        isDualGenerated: mappedNotes.length > 1 // dual 策略生成的标记
      })
    }
  }

  // 按开始时间排序
  result.sort((a, b) => a.startMs - b.startMs || a.midiNote - b.midiNote)

  // 第四步：去重（同一时刻同一键只保留力度最大的）
  const deduped = deduplicateNotes(result, options.minInterval)

  // 第五步：强制分离同键连续音符，防止游戏吞键
  enforceMinimumGap(deduped, 40) // 确保同一个键的前后抬起与按下至少间隔 40ms

  return deduped
}

/**
 * 去重：同一时间窗口内（±minInterval），同一键只保留力度最大的音符
 */
function deduplicateNotes(notes: MappedNote[], minInterval: number): MappedNote[] {
  if (notes.length === 0) return []

  const result: MappedNote[] = []
  // 用 Map 记录每个键最近一次被加入的时间
  const lastNoteTime = new Map<string, number>()

  for (const note of notes) {
    const lastTime = lastNoteTime.get(note.key)

    // 如果同一键在 minInterval 内已有音符，跳过
    if (lastTime !== undefined && Math.abs(note.startMs - lastTime) < minInterval) {
      continue
    }

    result.push(note)
    lastNoteTime.set(note.key, note.startMs)
  }

  return result
}

/**
 * 强制保证同一个按键的连续两次按压之间，至少有 minGapMs 的松开时间。
 * 防止在游戏内由于前一个按键的 keyup 还没生效，后一个 keydown 就到达，导致吞键。
 */
function enforceMinimumGap(notes: MappedNote[], minGapMs: number) {
  // 先按键位分组排序，再按开始时间排序
  const sortedByKey = [...notes].sort((a, b) => {
    if (a.key !== b.key) return a.key.localeCompare(b.key)
    return a.startMs - b.startMs
  })

  for (let i = 0; i < sortedByKey.length - 1; i++) {
    const curr = sortedByKey[i]
    const next = sortedByKey[i + 1]

    if (curr.key === next.key) {
      const gap = next.startMs - (curr.startMs + curr.durationMs)
      if (gap < minGapMs) {
        // 缩短当前音符的时长，保证它在下一个音符开始前 minGapMs 松开
        // 但最低保证有 10ms 的按下时间
        curr.durationMs = Math.max(10, next.startMs - curr.startMs - minGapMs)
      }
    }
  }
}
