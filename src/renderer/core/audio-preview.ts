/**
 * audio-preview.ts - 音频预览模块
 *
 * 使用 Tone.js 提供简单的钢琴音色预览功能。
 */

import * as Tone from 'tone'

class AudioPreview {
  private synth: Tone.Sampler | null = null
  private enabled: boolean = false
  private initialized: boolean = false
  private isLoading: boolean = false

  /**
   * 初始化合成器（需要在用户交互后调用）
   */
  async init() {
    if (this.initialized || this.isLoading) return
    this.isLoading = true

    try {
      await Tone.start()
      
      // 使用真实大钢琴采样 (Salamander Grand Piano)
      // 为了加快加载速度，我们只提供少量的采样基准音，Tone.js 会自动对其他音高进行插值移调
      this.synth = new Tone.Sampler({
        urls: {
          C3: "C3.mp3",
          "D#3": "Ds3.mp3",
          "F#3": "Fs3.mp3",
          A3: "A3.mp3",
          C4: "C4.mp3",
          "D#4": "Ds4.mp3",
          "F#4": "Fs4.mp3",
          A4: "A4.mp3",
          C5: "C5.mp3",
          "D#5": "Ds5.mp3",
          "F#5": "Fs5.mp3",
          A5: "A5.mp3"
        },
        // 使用 GitHub Pages 作为免费 CDN，实际如果网络差可以换国内 CDN
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        release: 1,
        onload: () => {
          this.initialized = true
          this.isLoading = false
          console.log('真实钢琴采样加载完成！')
        }
      }).toDestination()
      
      this.synth.volume.value = -5 // 调整整体音量
    } catch (e) {
      console.error('音频初始化失败', e)
      this.isLoading = false
    }
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
