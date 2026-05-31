import React, { useEffect, useRef, useState } from 'react'
import { TitleBar, PianoKeyboard, TrackCanvas, FileList, PlaybackControls, SettingsPanel } from './components'
import { useAppStore } from './store/useAppStore'
import { parseMidiBuffer } from './core/midi-parser'
import { mapNotes } from './core/note-mapper'
import { PlaybackEngine } from './core/playback-engine'
import { audioPreview } from './core/audio-preview'

function App(): React.JSX.Element {
  // === 状态 ===
  const {
    midiFiles,
    currentFileIndex,
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

    addFiles,
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
    
    bgOpacity
  } = useAppStore()

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
        window.electronAPI.keyDown(note.key)
      },
      onNoteOff: (note) => {
        removeActiveKey(note.key)
        audioPreview.noteOff(note.midiNote)
        
        // 调用键盘模拟 IPC
        window.electronAPI.keyUp(note.key)
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

  // === 文件切换时解析并映射 ===
  useEffect(() => {
    const loadFile = async () => {
      if (currentFileIndex < 0 || currentFileIndex >= midiFiles.length) {
        setParsedMidi(null)
        setMappedNotes([])
        engineRef.current?.stop()
        return
      }

      const file = midiFiles[currentFileIndex]
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
  }, [currentFileIndex, midiFiles])

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
      minDuration
    })
    
    setMappedNotes(newMappedNotes)
    
    // 加载到引擎
    engineRef.current?.load(newMappedNotes, parsedMidi.totalDurationMs)

  }, [parsedMidi, blackKeyConfig, transpose, minInterval, minDuration])

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

  const handleAddFiles = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths && paths.length > 0) {
      addFiles(paths.map(p => {
        // 简单提取文件名
        const name = p.split(/[/\\]/).pop() || '未命名'
        return { path: p, name }
      }))
    }
  }

  const handleAddFolder = async () => {
    const paths = await window.electronAPI.openFolderDialog()
    if (paths && paths.length > 0) {
      addFiles(paths.map(p => {
        const name = p.split(/[/\\]/).pop() || '未命名'
        return { path: p, name }
      }))
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
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <PianoKeyboard />
        
        <TrackCanvas 
          originalNotes={parsedMidi?.allNotes || []}
          mappedNotes={mappedNotes}
          totalDurationMs={parsedMidi?.totalDurationMs || 0}
          isPlaying={playbackState === 'playing'}
          onSeek={handleSeek}
        />
        
        <FileList 
          files={midiFiles}
          currentIndex={currentFileIndex}
          searchQuery={searchQuery}
          onSelect={selectFile}
          onAddFiles={handleAddFiles}
          onAddFolder={handleAddFolder}
          onSearch={setSearchQuery}
        />

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
        onPrev={() => selectFile(Math.max(0, currentFileIndex - 1))}
        onNext={() => selectFile(Math.min(midiFiles.length - 1, currentFileIndex + 1))}
        onSeek={handleSeek}
        onSpeedChange={setPlaybackSpeed}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsPanel 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
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
