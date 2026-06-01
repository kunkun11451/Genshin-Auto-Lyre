import React, { useEffect, useRef, useState } from 'react'
import { TitleBar, PianoKeyboard, TrackCanvas, FileList, PlaybackControls, SettingsPanel, MidiShowBrowser } from './components'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from './store/useAppStore'
import { parseMidiBuffer } from './core/midi-parser'
import { mapNotes } from './core/note-mapper'
import { PlaybackEngine } from './core/playback-engine'
import { audioPreview } from './core/audio-preview'
import startImg from '../../resources/start.png'

function App(): React.JSX.Element {
  // === 状态 ===
  const {
    midiFiles,
    currentFilePath,
    latestDownloadedMidi,
    midiShowUrl,
    searchQuery,
    parsedMidi,
    mappedNotes,
    playbackState,
    playbackSpeed,
    audioPreviewEnabled,
    blackKeyConfig,
    transpose,
    startDelaySec,
    minInterval,
    minDuration,
    instrumentMode,
    isMiniMode,
    theme,
    playbackShortcut,
    stopShortcut,
    speedUpShortcut,
    speedDownShortcut,

    setMidiFiles,
    selectFile,
    setLatestDownloadedMidi,
    setMidiShowUrl,
    setSearchQuery,
    setParsedMidi,
    setMappedNotes,
    setPlaybackState,
    setCurrentTime,
    setPlaybackSpeed,
    addActiveKey,
    removeActiveKey,
    clearActiveKeys,
    setAudioPreviewEnabled,
    setBlackKeyConfig,
    setTranspose,
    setStartDelaySec,
    setInstrumentMode,
    setMiniMode,
    bgOpacity,
    setTheme,
    setPlaybackShortcut,
    setStopShortcut,
    setSpeedUpShortcut,
    setSpeedDownShortcut,
    setBgOpacity
  } = useAppStore(useShallow((state) => ({
    midiFiles: state.midiFiles,
    currentFilePath: state.currentFilePath,
    latestDownloadedMidi: state.latestDownloadedMidi,
    midiShowUrl: state.midiShowUrl,
    searchQuery: state.searchQuery,
    parsedMidi: state.parsedMidi,
    mappedNotes: state.mappedNotes,
    playbackState: state.playbackState,
    playbackSpeed: state.playbackSpeed,
    audioPreviewEnabled: state.audioPreviewEnabled,
    blackKeyConfig: state.blackKeyConfig,
    transpose: state.transpose,
    startDelaySec: state.startDelaySec,
    minInterval: state.minInterval,
    minDuration: state.minDuration,
    instrumentMode: state.instrumentMode,
    isMiniMode: state.isMiniMode,
    bgOpacity: state.bgOpacity,
    theme: state.theme,
    playbackShortcut: state.playbackShortcut,
    stopShortcut: state.stopShortcut,
    speedUpShortcut: state.speedUpShortcut,
    speedDownShortcut: state.speedDownShortcut,

    setMidiFiles: state.setMidiFiles,
    selectFile: state.selectFile,
    setLatestDownloadedMidi: state.setLatestDownloadedMidi,
    setMidiShowUrl: state.setMidiShowUrl,
    setSearchQuery: state.setSearchQuery,
    setParsedMidi: state.setParsedMidi,
    setMappedNotes: state.setMappedNotes,
    setPlaybackState: state.setPlaybackState,
    setCurrentTime: state.setCurrentTime,
    setPlaybackSpeed: state.setPlaybackSpeed,
    addActiveKey: state.addActiveKey,
    removeActiveKey: state.removeActiveKey,
    clearActiveKeys: state.clearActiveKeys,
    setAudioPreviewEnabled: state.setAudioPreviewEnabled,
    setBlackKeyConfig: state.setBlackKeyConfig,
    setTranspose: state.setTranspose,
    setStartDelaySec: state.setStartDelaySec,
    setInstrumentMode: state.setInstrumentMode,
    setMiniMode: state.setMiniMode,
    setTheme: state.setTheme,
    setPlaybackShortcut: state.setPlaybackShortcut,
    setStopShortcut: state.setStopShortcut,
    setSpeedUpShortcut: state.setSpeedUpShortcut,
    setSpeedDownShortcut: state.setSpeedDownShortcut,
    setBgOpacity: state.setBgOpacity
  })))

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [delayCountdown, setDelayCountdown] = useState<number | null>(null)

  // ===== 主题管理 =====
  useEffect(() => {
    const applyTheme = () => {
      const isLight = 
        theme === 'light' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
      
      if (isLight) {
        document.documentElement.classList.add('light')
      } else {
        document.documentElement.classList.remove('light')
      }
    }

    applyTheme()
    
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const listener = () => {
      if (theme === 'system') applyTheme()
    }
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [theme])

  // ===== IPC 监听 =====
  const engineRef = useRef<PlaybackEngine | null>(null)
  const batchedDownsRef = useRef<string[]>([])
  const batchedUpsRef = useRef<string[]>([])

  useEffect(() => {
    // 初始化播放引擎
    engineRef.current = new PlaybackEngine({
      onTick: (timeMs) => {
        setCurrentTime(timeMs)
        
        // 批量发送当前帧的所有按键事件给主进程，避免高频 IPC 通信阻塞渲染进程导致卡顿
        const downs = batchedDownsRef.current
        const ups = batchedUpsRef.current
        if (downs.length > 0 || ups.length > 0) {
          if (!useAppStore.getState().audioPreviewEnabled) {
            window.electronAPI.keyBatch(downs, ups)
          }
          batchedDownsRef.current = []
          batchedUpsRef.current = []
        }
      },
      onNoteOn: (note) => {
        addActiveKey(note.key)
        audioPreview.noteOn(note.midiNote, note.velocity)
        
        // 收集按下按键
        batchedDownsRef.current.push(note.key)
      },
      onNoteOff: (note) => {
        removeActiveKey(note.key)
        audioPreview.noteOff(note.midiNote)
        
        // 收集释放按键
        batchedUpsRef.current.push(note.key)
      },
      onStateChange: (state) => {
        setPlaybackState(state)
        if (state !== 'playing') {
          clearActiveKeys()
          audioPreview.stopAll()
        }
      },
      onFinish: () => {
        clearActiveKeys()
        audioPreview.stopAll()
      }
    })

    return () => {
      engineRef.current?.dispose()
    }
  }, [])

  // === 监听在线下载 ===
  useEffect(() => {
    const unsubscribe = window.electronAPI.onMidiDownloaded(async (path) => {
      // 强制刷新文件列表
      const files = await window.electronAPI.listMidiFiles()
      setMidiFiles(
        files.map(f => ({ path: f, name: f.split('\\').pop() || f }))
      )
      
      setLatestDownloadedMidi(path)
      selectFile(path)
      setTimeout(() => window.focus(), 50) // 恢复窗口焦点
    })
    return () => unsubscribe()
  }, [setLatestDownloadedMidi, selectFile, setMidiFiles])

  // === 注册并监听全局快捷键 ===
  const handlePlayPauseRef = useRef<() => void>(() => {})
  const handleStopRef = useRef<() => void>(() => {})
  
  useEffect(() => {
    // 自动迁移旧的不生效的 +- 快捷键到方向上下键 Up/Down
    let speedUp = useAppStore.getState().speedUpShortcut
    let speedDown = useAppStore.getState().speedDownShortcut
    let playback = useAppStore.getState().playbackShortcut
    
    if (['+', 'plus', 'Plus'].includes(speedUp)) {
      useAppStore.getState().setSpeedUpShortcut('PageUp')
      speedUp = 'PageUp'
    } else if (speedUp === 'Up') {
      useAppStore.getState().setSpeedUpShortcut('PageUp')
      speedUp = 'PageUp'
    }
    
    if (['-', 'minus', 'Minus'].includes(speedDown)) {
      useAppStore.getState().setSpeedDownShortcut('PageDown')
      speedDown = 'PageDown'
    } else if (speedDown === 'Down') {
      useAppStore.getState().setSpeedDownShortcut('PageDown')
      speedDown = 'PageDown'
    }

    if (playback === 'F8') {
      useAppStore.getState().setPlaybackShortcut('Home')
      playback = 'Home'
    }

    // 注册保存的快捷键到主进程
    if (playback) {
      window.electronAPI.registerPlaybackShortcut(playback)
    }

    const stopShort = useAppStore.getState().stopShortcut
    if (stopShort) {
      window.electronAPI.registerStopShortcut(stopShort)
    }

    if (speedUp) {
      window.electronAPI.registerSpeedUpShortcut(speedUp)
    }

    if (speedDown) {
      window.electronAPI.registerSpeedDownShortcut(speedDown)
    }

    const unsubscribePlay = window.electronAPI.onPlaybackShortcutTriggered(() => {
      handlePlayPauseRef.current()
    })

    const unsubscribeStop = window.electronAPI.onStopShortcutTriggered(() => {
      handleStopRef.current()
    })

    const unsubscribeSpeedUp = window.electronAPI.onSpeedUpShortcutTriggered(() => {
      const currentSpeed = useAppStore.getState().playbackSpeed
      const setSpeed = useAppStore.getState().setPlaybackSpeed
      // 增加速度，最高限制 2.0，以 0.1 步长变化
      setSpeed(Math.min(2.0, currentSpeed + 0.1))
    })

    const unsubscribeSpeedDown = window.electronAPI.onSpeedDownShortcutTriggered(() => {
      const currentSpeed = useAppStore.getState().playbackSpeed
      const setSpeed = useAppStore.getState().setPlaybackSpeed
      // 减少速度，最低限制 0.25，以 0.1 步长变化
      setSpeed(Math.max(0.25, currentSpeed - 0.1))
    })

    return () => {
      unsubscribePlay()
      unsubscribeStop()
      unsubscribeSpeedUp()
      unsubscribeSpeedDown()
    }
  }, [])

  // === 音频预览设置同步 ===
  useEffect(() => {
    audioPreview.setEnabled(audioPreviewEnabled)
  }, [audioPreviewEnabled])

  // === 引擎速度同步 ===
  useEffect(() => {
    engineRef.current?.setSpeed(playbackSpeed)
  }, [playbackSpeed])

  // === 全局背景透明度同步 ===
  useEffect(() => {
    document.documentElement.style.setProperty('--bg-opacity', bgOpacity.toString())
  }, [bgOpacity])

  // === 初始化加载及目录监听 ===
  const fetchMidiFiles = async () => {
    try {
      const files = await window.electronAPI.listMidiFiles()
      const newMidiFiles = files.map(p => ({
        path: p,
        name: p.split(/[/\\]/).pop() || '未命名'
      }))
      setMidiFiles(newMidiFiles)
    } catch (err) {
      console.error('获取 MIDI 文件列表失败:', err)
    }
  }

  useEffect(() => {
    fetchMidiFiles()
    
    // 监听目录变化
    const unsub = window.electronAPI.onDirChanged(() => {
      fetchMidiFiles()
    })
    return unsub
  }, [])

  // === 文件切换时解析并映射 ===
  useEffect(() => {
    const loadFile = async () => {
      if (!currentFilePath) {
        setParsedMidi(null)
        setMappedNotes([])
        engineRef.current?.stop()
        return
      }

      const file = midiFiles.find(f => f.path === currentFilePath)
      if (!file) {
        setParsedMidi(null)
        setMappedNotes([])
        engineRef.current?.stop()
        return
      }

      try {
        const buffer = await window.electronAPI.readMidiFile(file.path)
        const parsed = parseMidiBuffer(buffer, file.name)
        setParsedMidi(parsed)
      } catch (err) {
        console.error('读取 MIDI 文件失败:', err)
        alert('读取 MIDI 文件失败')
      }
    }
    loadFile()
  }, [currentFilePath, midiFiles])

  // === 映射参数改变或新文件解析后，重新映射 ===
  useEffect(() => {
    if (!parsedMidi) {
      setMappedNotes([])
      return
    }

    const newMappedNotes = mapNotes(parsedMidi.allNotes, {
      blackKeyConfig,
      transpose,
      minInterval,
      minDuration,
      instrumentMode
    })
    
    setMappedNotes(newMappedNotes)
    
    // 加载到引擎
    engineRef.current?.load(newMappedNotes, parsedMidi.totalDurationMs)

  }, [parsedMidi, blackKeyConfig, transpose, minInterval, minDuration, instrumentMode])

  // === 控制处理函数 ===
  const handlePlayPause = () => {
    if (!engineRef.current || mappedNotes.length === 0) return

    if (playbackState === 'playing') {
      engineRef.current.pause()
      setDelayCountdown(null)
    } else {
      // 启动倒计时
      if (startDelaySec > 0 && engineRef.current?.getCurrentTime() === 0) {
        let count = startDelaySec
        setDelayCountdown(count)
        
        const timer = setInterval(() => {
          count--
          if (count <= 0) {
            clearInterval(timer)
            setDelayCountdown(null)
            engineRef.current?.play()
          } else {
            setDelayCountdown(count)
          }
        }, 1000)
      } else {
        engineRef.current.play()
      }
    }
  }

  // 保持 handlePlayPause 的引用最新，防止闭包捕获旧状态
  useEffect(() => {
    handlePlayPauseRef.current = handlePlayPause
  }, [handlePlayPause])

  const handleStop = () => {
    engineRef.current?.stop()
    setDelayCountdown(null)
  }

  useEffect(() => {
    handleStopRef.current = handleStop
  }, [handleStop])

  const handleSeek = (timeMs: number) => {
    engineRef.current?.seek(timeMs)
  }

  const handleRename = async (oldPath: string, newName: string) => {
    try {
      const newPath = await window.electronAPI.renameMidiFile(oldPath, newName)
      if (currentFilePath === oldPath) {
        selectFile(newPath)
      }
      fetchMidiFiles()
    } catch (err) {
      console.error('重命名失败:', err)
      alert('重命名失败，文件名可能存在非法字符或文件被占用。')
    }
  }

  const handleDelete = async (filePath: string) => {
    try {
      await window.electronAPI.deleteMidiFile(filePath)
      if (currentFilePath === filePath) {
        selectFile(null)
      }
      fetchMidiFiles()
    } catch (err) {
      console.error('删除失败:', err)
      alert('删除失败，文件可能被占用。')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', position: 'relative' }}>
      <TitleBar />
      
      {isMiniMode ? (
        <div key="mini" className="mode-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%' }}>
              <FileList 
                files={midiFiles}
                currentFilePath={currentFilePath}
                searchQuery={searchQuery}
                onSelect={(path) => {
                  selectFile(path)
                  setMidiShowUrl(null)
                }}
                onOpenDir={() => window.electronAPI.openMidiDir()}
                onRename={handleRename}
                onDelete={handleDelete}
                onSearch={setSearchQuery}
                isCloudOpen={!!midiShowUrl}
                onToggleCloud={() => {
                  if (midiShowUrl) {
                    setMidiShowUrl(null)
                  } else {
                    setMiniMode(false)
                    setMidiShowUrl('https://www.midishow.com/')
                  }
                }}
                isMiniMode={true}
              />
            </div>
          </div>
          <PlaybackControls 
            isPlaying={playbackState === 'playing'}
            totalDurationMs={parsedMidi?.totalDurationMs || 0}
            speed={playbackSpeed}
            onPlayPause={handlePlayPause}
            onStop={handleStop}
            onPrev={() => {
              const idx = midiFiles.findIndex(f => f.path === currentFilePath)
              if (idx > 0) selectFile(midiFiles[idx - 1].path)
            }}
            onNext={() => {
              const idx = midiFiles.findIndex(f => f.path === currentFilePath)
              if (idx >= 0 && idx < midiFiles.length - 1) selectFile(midiFiles[idx + 1].path)
            }}
            onSeek={handleSeek}
            onSpeedChange={setPlaybackSpeed}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isMiniMode={true}
          />
        </div>
      ) : (
        <div key="normal" className="mode-container">
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {!midiShowUrl && currentFilePath && <PianoKeyboard />}
            
            {midiShowUrl ? (
              <MidiShowBrowser 
                url={midiShowUrl} 
                onClose={() => {
                  setMidiShowUrl(null)
                  setTimeout(() => window.focus(), 50) // 恢复窗口焦点，防止输入框失效
                }} 
              />
            ) : currentFilePath ? (
              <TrackCanvas 
                originalNotes={parsedMidi?.allNotes || []}
                mappedNotes={mappedNotes}
                totalDurationMs={parsedMidi?.totalDurationMs || 0}
                isPlaying={playbackState === 'playing'}
                onSeek={handleSeek}
              />
            ) : (
              <div className="empty-midi-splash">
                <div className="empty-splash-logo-container">
                  <img src={startImg} className="empty-splash-logo" alt="Start Splash" draggable="false" />
                  <div className="empty-splash-text">选择一首 MIDI 音乐开始演奏</div>
                </div>
              </div>
            )}
            
            <div className="layout-sidebar" style={{ width: '280px', flexShrink: 0, borderLeft: 'var(--glass-border)' }}>
              <FileList 
                files={midiFiles}
                currentFilePath={currentFilePath}
                latestDownloadedMidi={latestDownloadedMidi}
                searchQuery={searchQuery}
                onSelect={(path) => {
                  selectFile(path)
                  setMidiShowUrl(null)
                }}
                onOpenDir={() => window.electronAPI.openMidiDir()}
                onRename={handleRename}
                onDelete={handleDelete}
                onSearch={setSearchQuery}
                isCloudOpen={!!midiShowUrl}
                onToggleCloud={() => {
                  if (midiShowUrl) {
                    setMidiShowUrl(null)
                  } else {
                    setMiniMode(false)
                    setMidiShowUrl('https://www.midishow.com/')
                  }
                }}
              />
            </div>

            {/* 倒计时遮罩 */}
            {delayCountdown !== null && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50,
                fontSize: '120px', color: '#e94560', fontWeight: 'bold',
                textShadow: '0 0 20px rgba(233,69,96,0.8)'
              }}>
                {delayCountdown}
              </div>
            )}
          </div>

          <PlaybackControls 
            isPlaying={playbackState === 'playing'}
            totalDurationMs={parsedMidi?.totalDurationMs || 0}
            speed={playbackSpeed}
            onPlayPause={handlePlayPause}
            onStop={handleStop}
            onPrev={() => {
              const idx = midiFiles.findIndex(f => f.path === currentFilePath)
              if (idx > 0) selectFile(midiFiles[idx - 1].path)
            }}
            onNext={() => {
              const idx = midiFiles.findIndex(f => f.path === currentFilePath)
              if (idx >= 0 && idx < midiFiles.length - 1) selectFile(midiFiles[idx + 1].path)
            }}
            onSeek={handleSeek}
            onSpeedChange={setPlaybackSpeed}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isMiniMode={false}
          />
        </div>
      )}

      <SettingsPanel 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        instrumentMode={instrumentMode}
        onInstrumentModeChange={setInstrumentMode}
        blackKeyConfig={blackKeyConfig}
        onBlackKeyConfigChange={setBlackKeyConfig}
        transpose={transpose}
        onTransposeChange={setTranspose}
        startDelaySec={startDelaySec}
        onStartDelaySecChange={setStartDelaySec}
        audioPreviewEnabled={audioPreviewEnabled}
        onAudioPreviewEnabledChange={setAudioPreviewEnabled}
        theme={theme}
        onThemeChange={setTheme}
        playbackShortcut={playbackShortcut}
        onPlaybackShortcutChange={setPlaybackShortcut}
        stopShortcut={stopShortcut}
        onStopShortcutChange={setStopShortcut}
        speedUpShortcut={speedUpShortcut}
        onSpeedUpShortcutChange={setSpeedUpShortcut}
        speedDownShortcut={speedDownShortcut}
        onSpeedDownShortcutChange={setSpeedDownShortcut}
      />
    </div>
  )
}

export default App
