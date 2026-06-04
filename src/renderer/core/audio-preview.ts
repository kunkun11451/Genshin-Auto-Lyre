/**
 * audio-preview.ts - 音频预览模块
 *
 * 使用 Tone.js 提供游戏内各种乐器的音色预览功能。
 */

import * as Tone from 'tone'

const KEY_TO_NOTE_NAME: Record<number, string> = {
  0: "C5", 1: "D5", 2: "E5", 3: "F5", 4: "G5", 5: "A5", 6: "B5",
  7: "C4", 8: "D4", 9: "E4", 10: "F4", 11: "G4", 12: "A4", 13: "B4",
  14: "C3", 15: "D3", 16: "E3", 17: "F3", 18: "G3", 19: "A3", 20: "B3"
}

const INSTRUMENT_FILES: Record<string, number[]> = {
  "Lyre": Array.from({ length: 21 }, (_, i) => i),
  "HarmonicKey": Array.from({ length: 21 }, (_, i) => i),
  "LeapingSpiritPiano": Array.from({ length: 21 }, (_, i) => i),
  "LingeringEuphonia": Array.from({ length: 21 }, (_, i) => i),
  "Ukulele": Array.from({ length: 21 }, (_, i) => i),
  "Vintage-Lyre": Array.from({ length: 21 }, (_, i) => i),
  "Zither": Array.from({ length: 21 }, (_, i) => i),
  "Horn": Array.from({ length: 14 }, (_, i) => i),
}

export const INSTRUMENT_DIR_MAP: Record<string, string> = {
  "Lyre": "风物之诗琴",
  "Vintage-Lyre": "老旧的诗琴",
  "Zither": "镜花之琴",
  "Horn": "晚风圆号",
  "Ukulele": "悠可琴",
  "LingeringEuphonia": "余音",
  "LeapingSpiritPiano": "跃律琴",
  "HarmonicKey": "谐律键琴",
  "DjemDjemDrum": "聚聚鼓"
}

class AudioPreview {
  private synth: Tone.Sampler | null = null
  private samplers: Map<string, Tone.Sampler> = new Map() // 多乐器音频池缓存
  private enabled: boolean = false
  private initialized: boolean = false
  private isLoading: boolean = false
  private currentInstrumentId: string = 'Vintage-Lyre'

  /**
   * 初始化合成器（需要在用户交互后调用）
   */
  async init() {
    if (this.initialized || this.isLoading) return
    this.isLoading = true

    try {
      await Tone.start()
      await this.loadSampler()
    } catch (e) {
      console.error('音频初始化失败', e)
      this.isLoading = false
    }
  }

  /**
   * 载入/重新载入 Sampler
   */
  private async loadSampler() {
    return new Promise<void>((resolve) => {
      // 动态构建当前乐器存在的文件映射表
      const fileIndices = INSTRUMENT_FILES[this.currentInstrumentId] || [0]
      const urls: Record<string, string> = {}
      
      fileIndices.forEach((idx) => {
        const noteName = KEY_TO_NOTE_NAME[idx]
        if (noteName) {
          urls[noteName] = `${idx}.mp3`
        }
      })

      const loadingInstrumentId = this.currentInstrumentId

      const nextSynth = new Tone.Sampler({
        urls,
        baseUrl: `./audio/${this.currentInstrumentId}/`,
        release: this.currentInstrumentId === 'Horn' ? 1.2 : 5.0,
        volume: this.currentInstrumentId === 'Horn' ? -0 : -5, // 直接在构造配置中声明音量，防止动态赋值失效
        onload: () => {
          if (this.currentInstrumentId === loadingInstrumentId) {
            const oldSynth = this.synth
            this.synth = nextSynth
            this.initialized = true
            this.isLoading = false
            console.log(`试听乐器 [${this.currentInstrumentId}] 采样加载完成！`)
            
            if (oldSynth) {
              try {
                oldSynth.releaseAll()
                setTimeout(() => {
                  oldSynth.dispose()
                }, 1500)
              } catch (e) {
                console.error('清理旧采样器失败:', e)
              }
            }
          } else {
            nextSynth.dispose()
          }
          resolve()
        },
        onerror: (err) => {
          if (this.currentInstrumentId === loadingInstrumentId) {
            this.initialized = false
            this.isLoading = false
          }
          nextSynth.dispose()
          console.error(`试听乐器 [${loadingInstrumentId}] 采样加载失败:`, err)
          resolve()
        }
      }).toDestination()
    })
  }

  /**
   * 获取或实例化某个乐器的 Sampler (用于多声部合并预览)
   */
  async getOrCreateSampler(instrumentId: string): Promise<Tone.Sampler> {
    if (this.samplers.has(instrumentId)) {
      return this.samplers.get(instrumentId)!
    }

    // 确保已经启用音频
    await Tone.start()

    return new Promise<Tone.Sampler>((resolve) => {
      const fileIndices = INSTRUMENT_FILES[instrumentId] || [0]
      const urls: Record<string, string> = {}
      
      fileIndices.forEach((idx) => {
        const noteName = KEY_TO_NOTE_NAME[idx]
        if (noteName) {
          urls[noteName] = `${idx}.mp3`
        }
      })

      const sampler = new Tone.Sampler({
        urls,
        baseUrl: `./audio/${instrumentId}/`,
        release: instrumentId === 'Horn' ? 1.2 : 5.0,
        volume: instrumentId === 'Horn' ? -0 : -5, // 直接在构造配置中声明音量，防止动态赋值失效
        onload: () => {
          console.log(`试听音频池：乐器 [${instrumentId}] 采样加载完成！`)
          this.samplers.set(instrumentId, sampler)
          resolve(sampler)
        },
        onerror: (err) => {
          console.error(`试听音频池：乐器 [${instrumentId}] 采样加载失败:`, err)
          resolve(sampler)
        }
      }).toDestination()
    })
  }

  /**
   * 切换试听乐器
   */
  async setInstrument(id: string) {
    if (this.currentInstrumentId === id) return
    this.currentInstrumentId = id
    
    // 如果已经启用预览，立刻重载 Sampler，无视先前是否初始化成功（防锁死）
    if (this.enabled) {
      this.isLoading = true
      this.initialized = false
      await this.loadSampler()
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
    if (!this.enabled || !this.synth || !this.initialized) return
    try {
      const freq = Tone.Frequency(midiNote, "midi").toFrequency()
      this.synth.triggerAttack(freq, Tone.now(), velocity)
    } catch (e) {
      console.error('AudioPreview noteOn error:', e)
    }
  }

  /**
   * 指定音色播放音符 (用于合并整体试听)
   */
  noteOnWithInstrument(instrumentId: string, midiNote: number, velocity: number = 0.8) {
    if (!this.enabled) return
    const sampler = this.samplers.get(instrumentId)
    if (!sampler) return
    try {
      const freq = Tone.Frequency(midiNote, "midi").toFrequency()
      sampler.triggerAttack(freq, Tone.now(), velocity)
    } catch (e) {
      console.error('AudioPreview noteOnWithInstrument error:', e)
    }
  }

  /**
   * 音符释放
   */
  noteOff(midiNote: number) {
    if (!this.enabled || !this.synth || !this.initialized) return
    if (this.currentInstrumentId === 'Horn') {
      try {
        const freq = Tone.Frequency(midiNote, "midi").toFrequency()
        this.synth.triggerRelease(freq, Tone.now())
      } catch (e) {
        console.error('AudioPreview noteOff error:', e)
      }
    }
  }

  /**
   * 指定音色释放音符
   */
  noteOffWithInstrument(instrumentId: string, midiNote: number) {
    if (!this.enabled) return
    if (instrumentId === 'Horn') {
      const sampler = this.samplers.get(instrumentId)
      if (sampler) {
        try {
          const freq = Tone.Frequency(midiNote, "midi").toFrequency()
          sampler.triggerRelease(freq, Tone.now())
        } catch (e) {
          console.error('AudioPreview noteOffWithInstrument error:', e)
        }
      }
    }
  }

  /**
   * 停止所有声音
   */
  stopAll() {
    if (this.synth && this.initialized) {
      this.synth.releaseAll()
    }
    for (const sampler of this.samplers.values()) {
      sampler.releaseAll()
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
    for (const sampler of this.samplers.values()) {
      sampler.dispose()
    }
    this.samplers.clear()
    this.initialized = false
  }
}

// 导出单例
export const audioPreview = new AudioPreview()
