import React, { useEffect, useRef, useState } from 'react'
import { TitleBar, PianoKeyboard, TrackCanvas, FileList, PlaybackControls, SettingsPanel, MidiShowBrowser, MultiplayerPanel } from './components'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from './store/useAppStore'
import { parseMidiBuffer } from './core/midi-parser'
import { mapNotes } from './core/note-mapper'
import { PlaybackEngine } from './core/playback-engine'
import { audioPreview } from './core/audio-preview'
import { networkManager } from './core/network-manager'
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
    isMultiplayerEnabled,
    clientTotalDurationMs,
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
    setBgOpacity,
    setAppVersion,
    setUpdateStatus,
    setUpdateInfo,
    setUpdateProgress,
    setUpdateErrorMsg
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
    isMultiplayerEnabled: state.isMultiplayerEnabled,
    clientTotalDurationMs: state.clientTotalDurationMs,
    instrumentMode: state.instrumentMode,
    isMiniMode: state.isMiniMode,

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
    setInstrumentMode: state.setInstrumentMode,
    setMiniMode: state.setMiniMode,
    setAppVersion: state.setAppVersion,
    setUpdateStatus: state.setUpdateStatus,
    setUpdateInfo: state.setUpdateInfo,
    setUpdateProgress: state.setUpdateProgress,
    setUpdateErrorMsg: state.setUpdateErrorMsg
  })))

  const [delayDurationSec, setDelayDurationSec] = useState<number | null>(null)
  const delayTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // 1. 初始化
    const applyTheme = (themeValue: string) => {
      const isLight = 
        themeValue === 'light' || 
        (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
      
      if (isLight) {
        document.documentElement.classList.add('light')
      } else {
        document.documentElement.classList.remove('light')
      }
    }

    const state = useAppStore.getState()
    applyTheme(state.theme)
    document.documentElement.style.setProperty('--bg-opacity', state.bgOpacity.toString())
    audioPreview.setEnabled(state.audioPreviewEnabled)

    // 2. 监听变化
    const unsub = useAppStore.subscribe((newState, prevState) => {
      if (newState.theme !== prevState.theme) {
        applyTheme(newState.theme)
      }
      if (newState.bgOpacity !== prevState.bgOpacity) {
        document.documentElement.style.setProperty('--bg-opacity', newState.bgOpacity.toString())
      }
      if (newState.audioPreviewEnabled !== prevState.audioPreviewEnabled) {
        audioPreview.setEnabled(newState.audioPreviewEnabled)
      }
    })

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const listener = () => {
      if (useAppStore.getState().theme === 'system') {
        applyTheme('system')
      }
    }
    mediaQuery.addEventListener('change', listener)
    
    return () => {
      unsub()
      mediaQuery.removeEventListener('change', listener)
    }
  }, [])

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

    // ===== 多人联机事件监听 =====
    networkManager.events.onTrackDataReceived = (notes, totalDurationMs) => {
      // 客机收到轨道数据，保存并加载到本地引擎
      useAppStore.getState().setClientTrackData(notes)
      if (totalDurationMs !== undefined) {
        useAppStore.getState().setClientTotalDurationMs(totalDurationMs)
      }
      const totalDuration = totalDurationMs || useAppStore.getState().parsedMidi?.totalDurationMs || 300000 
      engineRef.current?.load(notes, totalDuration)
    }

    networkManager.events.onPlayCommand = (targetTime) => {
      // 客机收到播放指令
      const syncedTime = networkManager.getSyncedTime()
      const delayMs = targetTime - syncedTime
      
      if (delayMs > 0) {
        setDelayDurationSec(delayMs / 1000)
        delayTimerRef.current = setTimeout(() => {
          delayTimerRef.current = null
          setDelayDurationSec(null)
          engineRef.current?.play()
        }, delayMs)
      } else {
        engineRef.current?.play()
      }
    }

    networkManager.events.onPauseCommand = () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current)
        delayTimerRef.current = null
        setDelayDurationSec(null)
      }
      engineRef.current?.pause()
    }

    networkManager.events.onStopCommand = () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current)
        delayTimerRef.current = null
        setDelayDurationSec(null)
      }
      engineRef.current?.stop()
    }
    
    networkManager.events.onSeekCommand = (timeMs) => {
      engineRef.current?.seek(timeMs)
    }

    return () => {
      engineRef.current?.dispose()
      networkManager.events.onTrackDataReceived = undefined
      networkManager.events.onPlayCommand = undefined
      networkManager.events.onPauseCommand = undefined
      networkManager.events.onStopCommand = undefined
      networkManager.events.onSeekCommand = undefined
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
  const handlePlayPauseRef = useRef<(isShortcut?: boolean) => void>(() => {})
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
      handlePlayPauseRef.current(true)
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

  // === 自动更新事件监听与版本获取 ===
  useEffect(() => {
    window.electronAPI.getAppVersion().then(v => setAppVersion(v))

    const unsubProgress = window.electronAPI.onUpdateProgress((percent) => {
      setUpdateProgress(percent)
    })

    const unsubReady = window.electronAPI.onUpdateReady(() => {
      setUpdateStatus('ready')
    })

    const unsubError = window.electronAPI.onUpdateError((err) => {
      setUpdateStatus('error')
      setUpdateErrorMsg(err)
    })

    return () => {
      unsubProgress()
      unsubReady()
      unsubError()
    }
  }, [setAppVersion, setUpdateProgress, setUpdateStatus, setUpdateErrorMsg])

  // === 引擎速度同步 ===
  useEffect(() => {
    engineRef.current?.setSpeed(playbackSpeed)
  }, [playbackSpeed])

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
    const handleMapNotes = (state: ReturnType<typeof useAppStore.getState>) => {
      if (!state.parsedMidi) {
        if (state.mappedNotes.length > 0) {
          state.setMappedNotes([])
        }
        return
      }
      const newMappedNotes = mapNotes(state.parsedMidi.allNotes, {
        blackKeyConfig: state.blackKeyConfig,
        transpose: state.transpose,
        minInterval: state.minInterval,
        minDuration: state.minDuration,
        instrumentMode: state.instrumentMode
      })
      state.setMappedNotes(newMappedNotes)
      engineRef.current?.load(newMappedNotes, state.parsedMidi.totalDurationMs)
    }

    // Initial check
    handleMapNotes(useAppStore.getState())

    // Subscribe to mapping-related changes
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (
        state.parsedMidi !== prevState.parsedMidi ||
        state.blackKeyConfig !== prevState.blackKeyConfig ||
        state.transpose !== prevState.transpose ||
        state.minInterval !== prevState.minInterval ||
        state.minDuration !== prevState.minDuration ||
        state.instrumentMode !== prevState.instrumentMode
      ) {
        handleMapNotes(state)
      }
    })

    return unsub
  }, [])

  // === 控制处理函数 ===
  const handlePlayPause = (isShortcut: boolean | any = false) => {
    if (!engineRef.current || mappedNotes.length === 0) return

    // 如果正在倒计时，点击播放按钮可以取消倒计时
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current)
      delayTimerRef.current = null
      setDelayDurationSec(null)
      return
    }

    if (playbackState === 'playing') {
      engineRef.current.pause()
      
      const state = useAppStore.getState()
      if (state.isMultiplayerEnabled && networkManager.currentRole === 'host') {
        networkManager.broadcastPause()
      }
    } else {
      // 启动倒计时
      const state = useAppStore.getState()
      const currentDelaySec = state.startDelaySec
      const previewEnabled = state.audioPreviewEnabled
      const isRealShortcut = isShortcut === true
      const isMultiplayer = state.isMultiplayerEnabled && networkManager.currentRole === 'host'

      if (isMultiplayer) {
        // 主机模式下点击播放
        const assignments = state.multiplayerAssignments
        const playerToTracks = new Map<string, number[]>()
        
        parsedMidi?.tracks.forEach((_, idx) => {
          const pid = assignments[idx] || 'me'
          if (pid !== 'none') {
            if (!playerToTracks.has(pid)) playerToTracks.set(pid, [])
            playerToTracks.get(pid)!.push(idx)
          }
        })

        // 主机自己的音符
        const myNotes: any[] = []

        for (const [pid, trackIndices] of playerToTracks.entries()) {
          const combinedParsedNotes: any[] = []
          for (const idx of trackIndices) {
            if (parsedMidi && parsedMidi.tracks[idx]) {
              combinedParsedNotes.push(...parsedMidi.tracks[idx])
            }
          }
          
          const mapped = mapNotes(combinedParsedNotes, {
            blackKeyConfig: state.blackKeyConfig,
            transpose: state.transpose,
            minInterval: state.minInterval,
            minDuration: state.minDuration,
            instrumentMode: state.instrumentMode
          })
          
          if (pid === 'me') {
            myNotes.push(...mapped)
          } else {
            networkManager.sendTrackDataToPlayer(pid, mapped, parsedMidi?.totalDurationMs)
          }
        }

        // 主机自己加载音符
        engineRef.current.load(myNotes, parsedMidi?.totalDurationMs || 0)

        // 广播播放指令 (强制 3 秒同步延迟)
        const targetTime = networkManager.broadcastPlay(3000)
        
        // 主机本地等待
        const delayMs = targetTime - networkManager.getSyncedTime()
        if (delayMs > 0) {
          setDelayDurationSec(delayMs / 1000)
          delayTimerRef.current = setTimeout(() => {
            delayTimerRef.current = null
            setDelayDurationSec(null)
            engineRef.current?.play()
          }, delayMs)
        } else {
          engineRef.current.play()
        }
        
      } else if (
        currentDelaySec > 0 && 
        !isRealShortcut && 
        !previewEnabled
      ) {
        setDelayDurationSec(currentDelaySec)
        
        delayTimerRef.current = setTimeout(() => {
          delayTimerRef.current = null
          setDelayDurationSec(null)
          engineRef.current?.play()
        }, currentDelaySec * 1000)
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
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current)
      delayTimerRef.current = null
      setDelayDurationSec(null)
    }
    engineRef.current?.stop()
    
    // 如果是主机，广播停止
    const state = useAppStore.getState()
    if (state.isMultiplayerEnabled && networkManager.currentRole === 'host') {
      networkManager.broadcastStop()
    }
  }

  useEffect(() => {
    handleStopRef.current = handleStop
  }, [handleStop])

  const handleSeek = (timeMs: number) => {
    engineRef.current?.seek(timeMs)
    
    const state = useAppStore.getState()
    if (state.isMultiplayerEnabled && networkManager.currentRole === 'host') {
      networkManager.broadcastSeek(timeMs)
    }
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
      
      <div key="mini" className="mode-container" style={{ display: isMiniMode ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
            isPlaying={playbackState === 'playing' || delayDurationSec !== null}
            delayDurationSec={delayDurationSec}
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
            onOpenSettings={() => useAppStore.getState().setIsSettingsOpen(true)}
            isMiniMode={true}
          />
        </div>

      <div key="normal" className="mode-container" style={{ display: isMiniMode ? 'none' : 'flex' }}>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {!midiShowUrl && currentFilePath && !isMultiplayerEnabled && <PianoKeyboard />}
            
            <div style={{ display: midiShowUrl ? 'flex' : 'none', flex: 1, overflow: 'hidden', position: 'relative', width: '100%', height: '100%' }}>
              <MidiShowBrowser 
                url={midiShowUrl || 'https://www.midishow.com/'} 
                onClose={() => {
                  setMidiShowUrl(null)
                  setTimeout(() => window.focus(), 50) // 恢复窗口焦点，防止输入框失效
                }} 
              />
            </div>
            
            {!midiShowUrl && (
              isMultiplayerEnabled ? (
                <MultiplayerPanel />
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
              )
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

          </div>

          <PlaybackControls 
            isPlaying={playbackState === 'playing' || delayDurationSec !== null}
            delayDurationSec={delayDurationSec}
            totalDurationMs={
              isMultiplayerEnabled && networkManager.currentRole === 'client'
                ? clientTotalDurationMs
                : (parsedMidi?.totalDurationMs || 0)
            }
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
            onOpenSettings={() => useAppStore.getState().setIsSettingsOpen(true)}
            isMiniMode={false}
          />
        </div>

      <SettingsPanel />
    </div>
  )
}

export default App
