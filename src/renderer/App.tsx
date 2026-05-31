import React, { useEffect, useRef, useState } from 'react'
import { TitleBar, PianoKeyboard, TrackCanvas, FileList, PlaybackControls, SettingsPanel } from './components'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from './store/useAppStore'
import { parseMidiBuffer } from './core/midi-parser'
import { mapNotes } from './core/note-mapper'
import { PlaybackEngine } from './core/playback-engine'
import { audioPreview } from './core/audio-preview'

function App(): React.JSX.Element {
  // === 状态 ===
  const {
    midiFiles,
    currentFilePath,
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

    setMidiFiles,
    selectFile,
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
    bgOpacity
  } = useAppStore(useShallow((state) => ({
    midiFiles: state.midiFiles,
    currentFilePath: state.currentFilePath,
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

    setMidiFiles: state.setMidiFiles,
    selectFile: state.selectFile,
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
    setInstrumentMode: state.setInstrumentMode
  })))

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [delayCountdown, setDelayCountdown] = useState<number | null>(null)

  // === 播放引擎单例 ===
  const engineRef = useRef<PlaybackEngine | null>(null)

  useEffect(() => {
    // 初始化播放引擎
    engineRef.current = new PlaybackEngine({
      onTick: (timeMs) => {
        setCurrentTime(timeMs)
      },
      onNoteOn: (note) => {
        addActiveKey(note.key)
        audioPreview.noteOn(note.midiNote, note.velocity)
        
        // 调用键盘模拟 IPC
        if (!useAppStore.getState().audioPreviewEnabled) {
          window.electronAPI.keyDown(note.key)
        }
      },
      onNoteOff: (note) => {
        removeActiveKey(note.key)
        audioPreview.noteOff(note.midiNote)
        
        // 调用键盘模拟 IPC
        if (!useAppStore.getState().audioPreviewEnabled) {
          window.electronAPI.keyUp(note.key)
        }
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

  const handleStop = () => {
    engineRef.current?.stop()
    setDelayCountdown(null)
  }

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
      {/* 动态透明度背景层 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1,
        background: 'radial-gradient(circle at 15% 50%, #2a2a35 0%, #0d0d0d 60%), radial-gradient(circle at 85% 30%, #1a1a24 0%, #0a0a0a 50%)',
        opacity: bgOpacity
      }} />

      <TitleBar />
      
      {isMiniMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%' }}>
              <FileList 
                files={midiFiles}
                currentFilePath={currentFilePath}
                searchQuery={searchQuery}
                onSelect={selectFile}
                onOpenDir={() => window.electronAPI.openMidiDir()}
                onRename={handleRename}
                onDelete={handleDelete}
                onSearch={setSearchQuery}
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
        <>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            <PianoKeyboard />
            
            <TrackCanvas 
              originalNotes={parsedMidi?.allNotes || []}
              mappedNotes={mappedNotes}
              totalDurationMs={parsedMidi?.totalDurationMs || 0}
              isPlaying={playbackState === 'playing'}
              onSeek={handleSeek}
            />
            
            <div style={{ width: '280px', flexShrink: 0, borderLeft: 'var(--glass-border)' }}>
              <FileList 
                files={midiFiles}
                currentFilePath={currentFilePath}
                searchQuery={searchQuery}
                onSelect={selectFile}
                onOpenDir={() => window.electronAPI.openMidiDir()}
                onRename={handleRename}
                onDelete={handleDelete}
                onSearch={setSearchQuery}
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
        </>
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
        bgOpacity={bgOpacity}
        onBgOpacityChange={useAppStore.getState().setBgOpacity}
      />
    </div>
  )
}

export default App
