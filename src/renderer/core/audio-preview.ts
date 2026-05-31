/**
 * audio-preview.ts - 音频预览模块
 *
 * 使用 Tone.js 提供简单的钢琴音色预览功能。
 */

import * as Tone from 'tone'

class AudioPreview {
  private synth: Tone.PolySynth | null = null
  private enabled: boolean = false
  private initialized: boolean = false

  /**
   * 初始化合成器（需要在用户交互后调用）
   */
  async init() {
    if (this.initialized) return
    await Tone.start()
    
    // 使用三角波和一些包络调整来模拟类似电钢琴的声音
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.02,
        decay: 1,
        sustine: 0.4,
        release: 1
      }
    }).toDestination()
    
    // 稍微降低音量
    this.synth.volume.value = -10
    this.initialized = true
  }

  /**
   * 设置是否启用音频预览
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled && !this.initialized) {
      this.init()
    }
  }

  /**
   * 音符按下
   */
  noteOn(midiNote: number, velocity: number = 0.8) {
    if (!this.enabled || !this.synth) return
    try {
      const freq = Tone.Frequency(midiNote, "midi").toFrequency()
      // 注意：Tone.js 的力度范围是 0-1
      this.synth.triggerAttack(freq, Tone.now(), velocity)
    } catch (e) {
      console.error('AudioPreview noteOn error:', e)
    }
  }

  /**
   * 音符释放
   */
  noteOff(midiNote: number) {
    if (!this.enabled || !this.synth) return
    try {
      const freq = Tone.Frequency(midiNote, "midi").toFrequency()
      this.synth.triggerRelease(freq, Tone.now())
    } catch (e) {
      console.error('AudioPreview noteOff error:', e)
    }
  }

  /**
   * 停止所有声音
   */
  stopAll() {
    if (this.synth) {
      this.synth.releaseAll()
    }
  }

  /**
   * 销毁
   */
  dispose() {
    this.stopAll()
    if (this.synth) {
      this.synth.dispose()
      this.synth = null
    }
    this.initialized = false
  }
}

// 导出单例
export const audioPreview = new AudioPreview()
