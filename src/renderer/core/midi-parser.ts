/**
 * midi-parser.ts - MIDI 文件解析模块
 *
 * 使用 @tonejs/midi 库解析标准 MIDI 文件，
 * 提取音符信息并转换为统一的内部数据结构。
 */

import { Midi } from '@tonejs/midi'

// ============================================================
// 类型定义
// ============================================================

/** 解析后的单个音符 */
export interface ParsedNote {
  /** MIDI 音符号 0~127 */
  note: number
  /** 开始时间（毫秒） */
  startMs: number
  /** 持续时间（毫秒） */
  durationMs: number
  /** 力度 0~1 */
  velocity: number
  /** 所属音轨索引 */
  trackIndex: number
  /** 所属通道 0~15 */
  channel: number
}

/** 解析后的 MIDI 文件 */
export interface ParsedMidi {
  /** 文件名 */
  name: string
  /** 速度（BPM） */
  bpm: number
  /** 总时长（毫秒） */
  totalDurationMs: number
  /** 按音轨分组的音符列表 */
  tracks: ParsedNote[][]
  /** 所有音符合并并按时间排序 */
  allNotes: ParsedNote[]
}

// ============================================================
// 解析函数
// ============================================================

/**
 * 解析 MIDI 文件 ArrayBuffer
 * @param buffer MIDI 文件的二进制数据
 * @param fileName 文件名（用于显示）
 * @returns 解析后的 MIDI 数据
 */
export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string = ''): ParsedMidi {
  const midi = new Midi(buffer)

  // 提取 BPM（取第一个 tempo 事件，默认 120）
  const bpm = midi.header.tempos.length > 0
    ? midi.header.tempos[0].bpm
    : 120

  // 总时长（秒 → 毫秒）
  const totalDurationMs = midi.duration * 1000

  // 逐音轨解析
  const tracks: ParsedNote[][] = []
  const allNotes: ParsedNote[] = []

  midi.tracks.forEach((track, trackIndex) => {
    const trackNotes: ParsedNote[] = []

    track.notes.forEach((note) => {
      // 过滤打击乐通道（通道 9，MIDI 规范中 channel 10 对应 0-indexed 的 9）
      if (track.channel === 9) return

      const parsedNote: ParsedNote = {
        note: note.midi,
        startMs: note.time * 1000,
        durationMs: note.duration * 1000,
        velocity: note.velocity,
        trackIndex,
        channel: track.channel
      }

      trackNotes.push(parsedNote)
      allNotes.push(parsedNote)
    })

    if (trackNotes.length > 0) {
      tracks.push(trackNotes)
    }
  })

  // 按开始时间排序
  allNotes.sort((a, b) => a.startMs - b.startMs)

  return {
    name: fileName || midi.name || '未命名',
    bpm,
    totalDurationMs,
    tracks,
    allNotes
  }
}
