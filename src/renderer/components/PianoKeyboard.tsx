/**
 * PianoKeyboard 组件 - 左侧钢琴键盘面板
 *
 * 功能：
 * - 纵向排列 21 个白键（高音在上，低音在下）
 * - 每个键显示音名（C3-B5）和对应的键盘按键（Z-U）
 * - 每个八度的起始键用分隔线标识
 * - activeKeys 集合中的键高亮显示（红色发光效果）
 */

import { useMemo } from 'react'
import { GAME_NOTES, NOTE_NAMES, NOTE_TO_KEY } from '../core/constants'
import { useAppStore } from '../store/useAppStore'
import './PianoKeyboard.css'

/**
 * 琴键数据结构（用于渲染）
 */
interface KeyData {
  /** MIDI 音符号 */
  midiNote: number
  /** 音名（如 C3, D4） */
  noteName: string
  /** 键盘按键（如 Z, A, Q） */
  keyChar: string
  /** 是否为八度起始音（C 音） */
  isOctaveStart: boolean
}

export function PianoKeyboard(): React.JSX.Element {
  const activeKeys = useAppStore(state => state.activeKeys)
  /**
   * 预计算键列表：GAME_NOTES 倒序排列（高音在上）
   * 每个八度的 C 音标记为 octave start
   */
  const keys: KeyData[] = useMemo(() => {
    // 倒序：从高音到低音
    const reversed = [...GAME_NOTES].reverse()
    return reversed.map((midiNote) => ({
      midiNote,
      noteName: NOTE_NAMES[midiNote] || `${midiNote}`,
      keyChar: NOTE_TO_KEY[midiNote] || '?',
      // C 音的半音偏移为 0（midiNote % 12 === 0）
      isOctaveStart: midiNote % 12 === 0,
    }))
  }, [])

  return (
    <div className="piano-keyboard">
      {keys.map((key) => {
        const isActive = activeKeys.has(key.keyChar)
        const classList = [
          'piano-key',
          isActive ? 'piano-key--active' : '',
          key.isOctaveStart ? 'piano-key--octave-start' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={key.midiNote} className={classList}>
            <span className="piano-key__note">{key.noteName}</span>
            <span className="piano-key__keymap">{key.keyChar}</span>
          </div>
        )
      })}
    </div>
  )
}
