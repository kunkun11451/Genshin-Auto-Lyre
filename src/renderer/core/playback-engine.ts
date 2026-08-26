/**
 * playback-engine.ts - 播放引擎
 *
 * 使用 requestAnimationFrame + performance.now() 实现高精度定时调度，
 * 驱动音符的 noteOn/noteOff 事件触发和 UI 更新。
 */

import type { MappedNote } from './note-mapper'

// ============================================================
// 类型定义
// ============================================================

/** 播放状态 */
export type PlaybackState = 'idle' | 'playing' | 'paused'

/** 调度心跳周期（毫秒）：决定 noteOn/noteOff 的触发精度 */
const HEARTBEAT_INTERVAL_MS = 8

/** UI 通知最小间隔（毫秒）：onTick 节流至约 30fps，演奏事件不受影响 */
const UI_NOTIFY_INTERVAL_MS = 32

/** 播放引擎回调接口 */
export interface PlaybackCallbacks {
  /** 每帧回调，驱动 UI 更新 */
  onTick: (timeMs: number) => void
  /** 音符按下事件 */
  onNoteOn: (note: MappedNote) => void
  /** 音符释放事件 */
  onNoteOff: (note: MappedNote) => void
  /** 播放状态变化 */
  onStateChange: (state: PlaybackState) => void
  /** 播放结束 */
  onFinish: () => void
}

// ============================================================
// 播放引擎类
// ============================================================

export class PlaybackEngine {
  /** 已加载的音符列表（按时间排序） */
  private notes: MappedNote[] = []
  /** 当前播放状态 */
  private state: PlaybackState = 'idle'
  /** 当前播放时间（毫秒） */
  private currentTimeMs: number = 0
  /** 播放速度倍率 */
  private speed: number = 1.0
  /** 播放开始的时间戳（performance.now） */
  private startTimestamp: number = 0
  /** 暂停时已播放的偏移量 */
  private pauseOffset: number = 0
  /** 心跳 Worker：独立线程驱动调度，不受 GPU 饥饿与页面节流影响 */
  private heartbeatWorker: Worker | null = null
  /** 上次 UI 通知的时间戳（用于 onTick 节流） */
  private lastUiNotifyMs: number = -1000
  /** 当前已触发到的音符索引 */
  private noteIndex: number = 0
  /** 当前正在演奏的活跃音符（key → MappedNote） */
  private activeNotes: Map<string, { note: MappedNote; endMs: number }[]> = new Map()
  /** 总时长（毫秒） */
  private totalDurationMs: number = 0
  /** 回调 */
  private callbacks: PlaybackCallbacks

  constructor(callbacks: PlaybackCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * 加载音符序列
   */
  load(notes: MappedNote[], totalDurationMs: number): void {
    this.stop()
    this.notes = [...notes].sort((a, b) => a.startMs - b.startMs)
    this.totalDurationMs = totalDurationMs
    this.currentTimeMs = 0
    this.noteIndex = 0
  }

  /**
   * 热加载音符序列（在播放中无缝切换，保持播放状态和进度）
   */
  hotLoad(notes: MappedNote[], totalDurationMs: number): void {
    const wasPlaying = this.state === 'playing'
    
    // 1. 释放当前的活跃音符，防挂音
    this.releaseAllActiveNotes()
    
    // 2. 更新音符和总时长
    this.notes = [...notes].sort((a, b) => a.startMs - b.startMs)
    this.totalDurationMs = totalDurationMs
    
    // 3. 重新定位音符索引
    this.noteIndex = this.findNoteIndex(this.currentTimeMs)
    
    // 4. 如果是播放状态，重调时间基准
    if (wasPlaying) {
      this.startTimestamp = performance.now()
      this.pauseOffset = this.currentTimeMs
    }
  }

  /**
   * 开始/继续播放
   */
  play(): void {
    if (this.state === 'playing') return
    if (this.notes.length === 0) return

    this.startTimestamp = performance.now()
    this.pauseOffset = this.currentTimeMs
    this.state = 'playing'
    this.callbacks.onStateChange('playing')

    // 如果是从头开始，重置索引
    if (this.currentTimeMs === 0) {
      this.noteIndex = 0
      this.activeNotes.clear()
    }

    // 启动调度心跳（独立线程，游戏抢占 GPU 时依然准时）
    this.lastUiNotifyMs = -1000
    this.startHeartbeat()
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (this.state !== 'playing') return

    this.stopHeartbeat()
    this.state = 'paused'
    this.callbacks.onStateChange('paused')

    // 释放所有活跃音符
    this.releaseAllActiveNotes()
  }

  /**
   * 停止播放，回到开头
   */
  stop(): void {
    this.stopHeartbeat()
    this.releaseAllActiveNotes()

    this.state = 'idle'
    this.currentTimeMs = 0
    this.noteIndex = 0
    this.pauseOffset = 0
    this.callbacks.onStateChange('idle')
    this.callbacks.onTick(0)
  }

  /**
   * 跳转到指定时间
   */
  seek(timeMs: number): void {
    const wasPlaying = this.state === 'playing'
    if (wasPlaying) {
      this.stopHeartbeat()
    }

    // 释放当前活跃音符
    this.releaseAllActiveNotes()

    // 更新时间
    this.currentTimeMs = Math.max(0, Math.min(timeMs, this.totalDurationMs))
    this.pauseOffset = this.currentTimeMs

    // 重新定位音符索引（二分查找）
    this.noteIndex = this.findNoteIndex(this.currentTimeMs)

    this.callbacks.onTick(this.currentTimeMs)

    // 如果之前在播放，继续播放
    if (wasPlaying) {
      this.startTimestamp = performance.now()
      this.lastUiNotifyMs = -1000
      this.startHeartbeat()
    }
  }

  /**
   * 设置播放速度
   */
  setSpeed(speed: number): void {
    const clampedSpeed = Math.max(0.25, Math.min(2.0, speed))
    if (this.state === 'playing') {
      // 播放中调整速度，需要重新计算基准
      this.pauseOffset = this.currentTimeMs
      this.startTimestamp = performance.now()
    }
    this.speed = clampedSpeed
  }

  /**
   * 获取当前播放状态
   */
  getState(): PlaybackState {
    return this.state
  }

  /**
   * 获取当前播放时间
   */
  getCurrentTime(): number {
    return this.currentTimeMs
  }

  /**
   * 获取播放速度
   */
  getSpeed(): number {
    return this.speed
  }

  /**
   * 获取总时长
   */
  getTotalDuration(): number {
    return this.totalDurationMs
  }

  /**
   * 销毁引擎
   */
  dispose(): void {
    this.stop()
    this.heartbeatWorker?.terminate()
    this.heartbeatWorker = null
    this.notes = []
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 启动心跳 Worker（复用实例，仅切换启停）
   */
  private startHeartbeat(): void {
    if (this.heartbeatWorker) {
      this.heartbeatWorker.postMessage('start')
      return
    }

    const code =
      'onmessage=e=>{if(e.data==="start"){if(!t)t=setInterval(()=>postMessage(0),' +
      HEARTBEAT_INTERVAL_MS +
      ')}else if(t){clearInterval(t);t=null}};let t=null'
    const blob = new Blob([code], { type: 'text/javascript' })
    this.heartbeatWorker = new Worker(URL.createObjectURL(blob))
    this.heartbeatWorker.onmessage = () => this.tick()
    this.heartbeatWorker.postMessage('start')
  }

  /**
   * 停止心跳（保留 Worker 实例供下次播放复用）
   */
  private stopHeartbeat(): void {
    this.heartbeatWorker?.postMessage('stop')
  }

  /**
   * 主循环 tick（每帧调用）
   */
  private tick(): void {
    if (this.state !== 'playing') return

    // 计算当前播放时间
    const elapsed = (performance.now() - this.startTimestamp) * this.speed
    this.currentTimeMs = this.pauseOffset + elapsed

    // 检查是否播放结束
    if (this.currentTimeMs >= this.totalDurationMs) {
      this.currentTimeMs = this.totalDurationMs
      this.callbacks.onTick(this.currentTimeMs)
      this.releaseAllActiveNotes()
      this.state = 'idle'
      this.currentTimeMs = 0
      this.noteIndex = 0
      this.pauseOffset = 0
      this.callbacks.onStateChange('idle')
      this.callbacks.onFinish()
      return
    }

    // 触发新的 noteOn 事件
    while (
      this.noteIndex < this.notes.length &&
      this.notes[this.noteIndex].startMs <= this.currentTimeMs
    ) {
      const note = this.notes[this.noteIndex]
      this.callbacks.onNoteOn(note)

      // 记录活跃音符
      const endMs = note.startMs + note.durationMs
      if (!this.activeNotes.has(note.key)) {
        this.activeNotes.set(note.key, [])
      }
      this.activeNotes.get(note.key)!.push({ note, endMs })

      this.noteIndex++
    }

    // 检查 noteOff 事件
    for (const [key, entries] of this.activeNotes) {
      const remaining = entries.filter((entry) => {
        if (this.currentTimeMs >= entry.endMs) {
          this.callbacks.onNoteOff(entry.note)
          return false
        }
        return true
      })
      if (remaining.length === 0) {
        this.activeNotes.delete(key)
      } else {
        this.activeNotes.set(key, remaining)
      }
    }

    // 通知 UI 更新（节流至 ~30fps；noteOn/noteOff 演奏事件不受此影响）
    const nowMs = performance.now()
    if (nowMs - this.lastUiNotifyMs >= UI_NOTIFY_INTERVAL_MS) {
      this.lastUiNotifyMs = nowMs
      this.callbacks.onTick(this.currentTimeMs)
    }
  }

  /**
   * 释放所有活跃音符
   */
  private releaseAllActiveNotes(): void {
    for (const [_, entries] of this.activeNotes) {
      for (const entry of entries) {
        this.callbacks.onNoteOff(entry.note)
      }
    }
    this.activeNotes.clear()
  }

  /**
   * 二分查找：找到第一个 startMs >= targetMs 的音符索引
   */
  private findNoteIndex(targetMs: number): number {
    let lo = 0
    let hi = this.notes.length

    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.notes[mid].startMs < targetMs) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }

    return lo
  }
}
