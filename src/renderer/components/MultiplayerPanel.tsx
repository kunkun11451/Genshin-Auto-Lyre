import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Users, Wifi, LogOut, Play, Square, User, Volume2, CheckCircle2, CircleDashed, ChevronDown, Check, Ban, Plus, LogIn } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from 'react-i18next'
import { networkManager, NetworkRole, NetworkPlayer } from '../core/network-manager'
import { mapNotes, MappedNote } from '../core/note-mapper'
import { audioPreview, INSTRUMENT_DIR_MAP } from '../core/audio-preview'
import './MultiplayerPanel.css'
import startImg from '../../../resources/start.png'
import multiplayerImg from '../../../resources/multiplayer.png'

function MiniTrackPreview({ notes, elapsedMs = 0, onSeek, totalDurationMs, disabled = false }: { notes: MappedNote[], elapsedMs?: number, onSeek?: (timeMs: number) => void, totalDurationMs?: number, disabled?: boolean }) {
  if (!notes || notes.length === 0) {
    return <div style={{ height: 40, background: 'var(--bg-primary)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-dim)' }}>空轨道</div>
  }

  const maxTime = totalDurationMs || Math.max(...notes.map(n => n.startMs + n.durationMs)) || 1
  const minMidi = 48
  const maxMidi = 83
  const range = maxMidi - minMidi + 1

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSeek || disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    onSeek(percent * maxTime)
  }

  return (
    <svg
      width="100%"
      height="40"
      style={{ background: 'var(--bg-primary)', borderRadius: 4, display: 'block', cursor: (!disabled && onSeek) ? 'pointer' : 'default', opacity: disabled ? 0.7 : 1 }}
      onClick={handleSvgClick}
    >
      {notes.map((n, i) => {
        const x = (n.startMs / maxTime) * 100
        const w = (n.durationMs / maxTime) * 100
        const y = 40 - ((n.midiNote - minMidi) / range) * 40
        return (
          <rect
            key={i}
            x={`${x}%`}
            y={y - 2}
            width={`${Math.max(w, 0.5)}%`}
            height="4"
            fill="var(--text-primary)"
            opacity={0.8}
            rx="2"
          />
        )
      })}

      {elapsedMs > 0 && elapsedMs <= maxTime && (
        <line
          x1={`${(elapsedMs / maxTime) * 100}%`}
          y1="0"
          x2={`${(elapsedMs / maxTime) * 100}%`}
          y2="40"
          stroke="#ff4a4a"
          strokeWidth="1.5"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  )
}

function GlobalProgressLine({ totalDurationMs }: { totalDurationMs: number }) {
  const lineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return useAppStore.subscribe((state) => {
      if (lineRef.current && totalDurationMs > 0) {
        const percent = (state.currentTimeMs / totalDurationMs) * 100
        lineRef.current.style.left = `${percent}%`
      }
    })
  }, [totalDurationMs])

  return (
    <div
      ref={lineRef}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1.5,
        backgroundColor: '#ff4a4a',
        pointerEvents: 'none',
        zIndex: 10
      }}
    />
  )
}

export function MultiplayerPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const parsedMidi = useAppStore(state => state.parsedMidi)
  const clientTrackData = useAppStore(state => state.clientTrackData)
  const clientTotalDurationMs = useAppStore(state => state.clientTotalDurationMs)

  const [role, setRole] = useState<NetworkRole>(networkManager.currentRole)
  const [myId, setMyId] = useState(networkManager.myId)
  const [players, setPlayers] = useState<NetworkPlayer[]>(networkManager.connectedPlayers)

  const [joinId, setJoinId] = useState('')
  const [statusMsg, setStatusMsgState] = useState('')
  const [toastText, setToastText] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [shouldRenderDropdown, setShouldRenderDropdown] = useState(false)
  const [isDropdownClosing, setIsDropdownClosing] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (dropdownOpen) {
      setShouldRenderDropdown(true)
      setIsDropdownClosing(false)
    } else if (shouldRenderDropdown) {
      setIsDropdownClosing(true)
      const timer = setTimeout(() => {
        setShouldRenderDropdown(false)
        setIsDropdownClosing(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [dropdownOpen, shouldRenderDropdown])

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  const [isClientReady, setIsClientReady] = useState(false)

  const playerName = useAppStore(state => state.playerName)
  const setPlayerName = useAppStore(state => state.setPlayerName)

  const assignments = useAppStore(state => state.multiplayerAssignments)
  const setAssignments = useAppStore(state => state.setMultiplayerAssignments)
  const isMaximized = useAppStore(state => state.isMaximized)

  const blackKeyConfig = useAppStore(state => state.blackKeyConfig)
  const transpose = useAppStore(state => state.transpose)
  const minInterval = useAppStore(state => state.minInterval)
  const minDuration = useAppStore(state => state.minDuration)
  const instrumentMode = useAppStore(state => state.instrumentMode)
  const setInstrumentMode = useAppStore(state => state.setInstrumentMode)
  const audioPreviewInstrument = useAppStore(state => state.audioPreviewInstrument)
  const setAudioPreviewInstrument = useAppStore(state => state.setAudioPreviewInstrument)

  const multiplayerInstrumentModes = useAppStore(state => state.multiplayerInstrumentModes)
  const setMultiplayerInstrumentMode = useAppStore(state => state.setMultiplayerInstrumentMode)
  const multiplayerPreviewInstruments = useAppStore(state => state.multiplayerPreviewInstruments)
  const setMultiplayerPreviewInstrument = useAppStore(state => state.setMultiplayerPreviewInstrument)
  const playbackState = useAppStore(state => state.playbackState)
  const multiplayerCombinedTracks = useAppStore(state => state.multiplayerCombinedTracks)
  const setMultiplayerCombinedTracks = useAppStore(state => state.setMultiplayerCombinedTracks)
  const multiplayerHostName = useAppStore(state => state.multiplayerHostName)

  // 统一获取玩家对应选用的试听乐器
  const getInstrumentForPlayer = (pid: string) => {
    if (role === 'host') {
      return pid === 'me' ? audioPreviewInstrument : (multiplayerPreviewInstruments[pid] || 'Lyre')
    } else {
      return multiplayerPreviewInstruments[pid] || 'Lyre'
    }
  }

  // 预览播放状态
  const [previewTrackIdx, setPreviewTrackIdx] = useState<string | number | null>(null)
  const [previewElapsed, setPreviewElapsed] = useState<number>(0)
  const currentElapsedRef = useRef<number>(0)
  const previewRafRef = useRef<number>(0)
  const activeNotesRef = useRef<Set<number>>(new Set())
  const previewTrackIdxRef = useRef<string | number | null>(null)

  // 提示消息定时清除引用与动画驱动
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)

  const setStatusMsg = (msg: string) => {
    setStatusMsgState(msg)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }

    if (msg) {
      setToastText(msg)
      setToastVisible(true)
    } else {
      setToastVisible(false)
      setTimeout(() => {
        setToastText(curr => (curr ? '' : curr))
      }, 250)
    }
  }

  const showTempMsg = (msg: string, durationMs = 2500) => {
    setStatusMsgState(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastText(msg)
    setToastVisible(true)
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false)
      toastTimerRef.current = null
      setTimeout(() => {
        setToastText('')
      }, 250)
    }, durationMs)
  }

  useEffect(() => {
    previewTrackIdxRef.current = previewTrackIdx
  }, [previewTrackIdx])

  // 当属性变化时，如果作为 Host，预计算并下发音轨数据
  useEffect(() => {
    if (role === 'host' && parsedMidi) {
      const playerToNotes = new Map<string, MappedNote[]>()

      parsedMidi.tracks.forEach((trackNotes, idx) => {
        const pid = assignments[idx] || 'none'
        if (pid !== 'none') {
          const playerInstrumentMode = pid === 'me'
            ? instrumentMode
            : (multiplayerInstrumentModes[pid] || 'standard')

          const mapped = mapNotes(trackNotes, {
            blackKeyConfig,
            transpose,
            minInterval,
            minDuration,
            instrumentMode: playerInstrumentMode
          })
          if (!playerToNotes.has(pid)) playerToNotes.set(pid, [])
          playerToNotes.get(pid)!.push(...mapped)
        }
      })

      // 组装 combinedTracks 结构以发给客机
      const combinedTracksObj: Record<string, MappedNote[]> = {}

      const meNotes = playerToNotes.get('me') || []
      if (meNotes.length > 0) {
        combinedTracksObj['me'] = meNotes
        combinedTracksObj['me'].sort((a, b) => a.startMs - b.startMs)
      }

      // 给对应的玩家发送预处理数据并填充 combinedTracksObj
      for (const player of players) {
        const combined = playerToNotes.get(player.id) || []
        combined.sort((a, b) => a.startMs - b.startMs)

        if (combined.length > 0) {
          combinedTracksObj[player.id] = combined
        }

        const pMode = multiplayerInstrumentModes[player.id] || 'standard'
        const pPreviewInst = multiplayerPreviewInstruments[player.id] || 'Lyre'

        networkManager.sendTrackDataToPlayer(
          player.id,
          combined,
          parsedMidi.totalDurationMs,
          pMode,
          pPreviewInst
        )
      }

      // 更新主机的本地状态
      setMultiplayerCombinedTracks(combinedTracksObj)

      // 广播给房间内的所有人，让客机端有整体试听和总览能力
      networkManager.broadcast({
        type: 'OVERVIEW_DATA',
        playerCombinedTracks: combinedTracksObj,
        multiplayerPreviewInstruments: {
          ...multiplayerPreviewInstruments,
          'me': audioPreviewInstrument
        },
        totalDurationMs: parsedMidi.totalDurationMs,
        hostName: playerName
      })
    }
  }, [role, parsedMidi, assignments, players, blackKeyConfig, transpose, minInterval, minDuration, instrumentMode, multiplayerInstrumentModes, multiplayerPreviewInstruments, audioPreviewInstrument])

  useEffect(() => {
    // 挂载时同步初始状态
    useAppStore.getState().setMultiplayerRole(networkManager.currentRole)

    networkManager.events.onRoleChange = (newRole) => {
      setRole(newRole)
      setMyId(networkManager.myId)
      useAppStore.getState().setMultiplayerRole(newRole)
    }
    networkManager.events.onPlayersChange = (newPlayers) => {
      setPlayers([...newPlayers])
    }
    networkManager.events.onError = (err) => {
      showTempMsg(t('multiplayer.errorMsg', { msg: err.message }), 4000)
      setIsConnecting(false)
    }
    networkManager.events.onConnected = () => {
      showTempMsg(t('multiplayer.connectedToHost'), 2500)
      setIsConnecting(false)
    }
    networkManager.events.onDisconnected = () => {
      showTempMsg(t('multiplayer.connectionLost'), 3000)
      setRole('none')
      setMultiplayerCombinedTracks({})
      useAppStore.getState().setMultiplayerRole('none')
    }

    return () => {
      networkManager.events.onRoleChange = undefined
      networkManager.events.onPlayersChange = undefined
      networkManager.events.onError = undefined
      networkManager.events.onConnected = undefined
      networkManager.events.onDisconnected = undefined
      stopPreview()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      showTempMsg(t('multiplayer.setNicknameFirst'))
      return
    }
    setIsConnecting(true)
    setStatusMsg(t('multiplayer.creatingRoom'))
    try {
      await networkManager.createRoom(playerName.trim())
      showTempMsg(t('multiplayer.roomCreated'))
    } catch (err) { }
    finally {
      setIsConnecting(false)
    }
  }

  const handleCreateDevRoom = () => {
    if (!playerName.trim()) {
      showTempMsg(t('multiplayer.setNicknameFirst'))
      return
    }
    try {
      networkManager.createDevRoom()
      showTempMsg(t('multiplayer.devRoomCreated'))
    } catch (err: any) {
      showTempMsg(t('multiplayer.createFailed', { msg: err.message }), 4000)
    }
  }

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      showTempMsg(t('multiplayer.setNicknameFirst'))
      return
    }
    if (!joinId.trim()) return
    setIsConnecting(true)
    setStatusMsg(t('multiplayer.connecting'))
    try {
      await networkManager.joinRoom(joinId.trim().toUpperCase(), playerName.trim())
    } catch (err) { }
  }

  const handleDisconnect = () => {
    networkManager.disconnect()
    setAssignments({})
    useAppStore.getState().setMultiplayerRole('none')
  }

  const handleAssign = (trackIndex: number, playerId: string) => {
    setAssignments({
      ...assignments,
      [trackIndex]: playerId
    })
  }

  // 试听功能
  const stopPreview = () => {
    cancelAnimationFrame(previewRafRef.current)
    setPreviewTrackIdx(null)
    setPreviewElapsed(0)
    currentElapsedRef.current = 0

    // 停止并释放主合成器和多声部音频池缓存中所有正在发音的乐器
    audioPreview.stopAll()
    activeNotesRef.current.clear()

    // 恢复之前的音频预览启用状态
    const globalAudioPreviewEnabled = useAppStore.getState().audioPreviewEnabled
    audioPreview.setEnabled(globalAudioPreviewEnabled)
  }

  const handleReadyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ready = e.target.checked
    setIsClientReady(ready)
    networkManager.sendReadyState(ready)
    if (ready) {
      stopPreview()
    }
  }

  const startPreview = (id: string | number, notes: MappedNote[], startMs: number = 0, instrumentId?: string) => {
    stopPreview()
    if (!notes || notes.length === 0) return

    setPreviewTrackIdx(id)
    setPreviewElapsed(startMs)
    currentElapsedRef.current = startMs
    const startTime = performance.now() - startMs

    // 跳转到指定时间的索引
    let noteIndex = 0
    while (noteIndex < notes.length && notes[noteIndex].startMs < startMs) {
      noteIndex++
    }

    const activeTimeouts = new Map<number, NodeJS.Timeout>()

    const tick = () => {
      const elapsed = performance.now() - startTime
      setPreviewElapsed(elapsed)
      currentElapsedRef.current = elapsed

      while (noteIndex < notes.length && notes[noteIndex].startMs <= elapsed) {
        const note = notes[noteIndex]
        if (instrumentId) {
          audioPreview.noteOnWithInstrument(instrumentId, note.midiNote, note.velocity)
        } else {
          audioPreview.noteOn(note.midiNote, note.velocity)
        }
        activeNotesRef.current.add(note.midiNote)

        const timer = setTimeout(() => {
          if (instrumentId) {
            audioPreview.noteOffWithInstrument(instrumentId, note.midiNote)
          } else {
            audioPreview.noteOff(note.midiNote)
          }
          activeNotesRef.current.delete(note.midiNote)
          activeTimeouts.delete(note.midiNote)
        }, note.durationMs)
        activeTimeouts.set(note.midiNote, timer)

        noteIndex++
      }

      const maxTime = Math.max(...notes.map(n => n.startMs + n.durationMs)) || 0

      if (elapsed < maxTime || activeTimeouts.size > 0) {
        previewRafRef.current = requestAnimationFrame(tick)
      } else {
        setPreviewTrackIdx(null)
        setPreviewElapsed(0)
        currentElapsedRef.current = 0
      }
    }

    // 确保已开启音频功能
    audioPreview.setEnabled(true)
    previewRafRef.current = requestAnimationFrame(tick)
  }

  const startOverviewPreview = (notes: Array<MappedNote & { instrumentId: string }>, startMs: number = 0) => {
    stopPreview()
    if (!notes || notes.length === 0) return

    setPreviewTrackIdx('all-overview')
    setPreviewElapsed(startMs)
    currentElapsedRef.current = startMs
    const startTime = performance.now() - startMs

    let noteIndex = 0
    while (noteIndex < notes.length && notes[noteIndex].startMs < startMs) {
      noteIndex++
    }

    const activeTimeouts = new Map<number, NodeJS.Timeout>()

    const tick = () => {
      const elapsed = performance.now() - startTime
      setPreviewElapsed(elapsed)
      currentElapsedRef.current = elapsed

      while (noteIndex < notes.length && notes[noteIndex].startMs <= elapsed) {
        const note = notes[noteIndex]
        audioPreview.noteOnWithInstrument(note.instrumentId, note.midiNote, note.velocity)
        activeNotesRef.current.add(note.midiNote)

        const timer = setTimeout(() => {
          audioPreview.noteOffWithInstrument(note.instrumentId, note.midiNote)
          activeNotesRef.current.delete(note.midiNote)
          activeTimeouts.delete(note.midiNote)
        }, note.durationMs)
        activeTimeouts.set(note.midiNote, timer)

        noteIndex++
      }

      const maxTime = Math.max(...notes.map(n => n.startMs + n.durationMs)) || 0

      if (elapsed < maxTime || activeTimeouts.size > 0) {
        previewRafRef.current = requestAnimationFrame(tick)
      } else {
        setPreviewTrackIdx(null)
        setPreviewElapsed(0)
        currentElapsedRef.current = 0
      }
    }

    audioPreview.setEnabled(true)
    previewRafRef.current = requestAnimationFrame(tick)
  }

  const handleOverviewPreview = async () => {
    if (previewTrackIdx === 'all-overview') {
      stopPreview()
      return
    }

    const overviewNotes: Array<MappedNote & { instrumentId: string }> = []
    const requiredInsts = new Set<string>()

    Object.entries(playerCombinedTracks).forEach(([pid, notes]) => {
      const instId = getInstrumentForPlayer(pid)

      requiredInsts.add(instId)
      notes.forEach(note => {
        overviewNotes.push({ ...note, instrumentId: instId })
      })
    })

    if (overviewNotes.length === 0) return
    overviewNotes.sort((a, b) => a.startMs - b.startMs)

    setStatusMsg(t('multiplayer.loadingPreview'))
    try {
      await Promise.all(
        Array.from(requiredInsts).map(instId => audioPreview.getOrCreateSampler(instId))
      )
      setStatusMsg('')
      startOverviewPreview(overviewNotes, 0)
    } catch (e) {
      console.error(e)
      showTempMsg(t('multiplayer.previewLoadFailed'), 3000)
    }
  }

  const handlePreviewTrack = async (id: string | number, notes: MappedNote[], instrumentId?: string) => {
    if (previewTrackIdx === id) {
      stopPreview()
    } else {
      if (instrumentId) {
        setStatusMsg(t('multiplayer.loadingSingle'))
        try {
          await audioPreview.getOrCreateSampler(instrumentId)
          setStatusMsg('')
        } catch (e) {
          showTempMsg(t('multiplayer.previewLoadFailed'), 3000)
          return
        }
      }
      startPreview(id, notes, 0, instrumentId)
    }
  }

  // 各玩家合并后的音轨总览，直接读取统一的 Zustand 合并状态
  const playerCombinedTracks = multiplayerCombinedTracks

  const hostMappedTracks = useMemo(() => {
    if (!parsedMidi) return []
    return parsedMidi.tracks.map((trackNotes, idx) => {
      const pid = assignments[idx] || 'none'
      const playerInstrumentMode = pid === 'me'
        ? instrumentMode
        : (multiplayerInstrumentModes[pid] || 'standard')
      return mapNotes(trackNotes, {
        blackKeyConfig,
        transpose,
        minInterval,
        minDuration,
        instrumentMode: playerInstrumentMode
      })
    })
  }, [parsedMidi, assignments, instrumentMode, multiplayerInstrumentModes, blackKeyConfig, transpose, minInterval, minDuration])

  const lastMidiRef = useRef(parsedMidi)

  // 监听正式播放状态，如果正式开始播放，必须停止试听
  useEffect(() => {
    if (playbackState !== 'idle') {
      stopPreview()
    }
  }, [playbackState])

  // 统一处理歌曲切换与合并音轨变化的逻辑
  useEffect(() => {
    if (lastMidiRef.current !== parsedMidi) {
      // 如果是切换了歌曲，停止试听并记录新歌曲
      lastMidiRef.current = parsedMidi
      stopPreview()
      setMultiplayerCombinedTracks({})
      setAssignments({})
      return
    }

    const runReboot = async () => {
      const currentTrackIdx = previewTrackIdx

      // 如果歌曲没变，说明是 assignments 变化导致的 playerCombinedTracks 变化
      // 如果当前正在试听合并总览，则无缝重启更新声音
      if (typeof currentTrackIdx === 'string' && currentTrackIdx.startsWith('overview-')) {
        const pid = currentTrackIdx.replace('overview-', '')
        const latestNotes = playerCombinedTracks[pid] || []
        const instId = getInstrumentForPlayer(pid)

        setStatusMsg(t('multiplayer.loadingNew'))
        try {
          await audioPreview.getOrCreateSampler(instId)
          setStatusMsg('')
        } catch (e) {
          showTempMsg(t('multiplayer.loadFailed'), 3000)
          return
        }

        // 重新检查，确保在异步加载新音色期间用户没有停止试听或切换到其他音轨
        if (previewTrackIdxRef.current === currentTrackIdx && currentElapsedRef.current > 0) {
          startPreview(currentTrackIdx, latestNotes, currentElapsedRef.current, instId)
        }
      } else if (currentTrackIdx === 'all-overview') {
        // 整体试听同样支持无缝重启
        const overviewNotes: Array<MappedNote & { instrumentId: string }> = []
        const requiredInsts = new Set<string>()

        Object.entries(playerCombinedTracks).forEach(([pid, ns]) => {
          const instId = getInstrumentForPlayer(pid)
          requiredInsts.add(instId)
          ns.forEach(n => {
            overviewNotes.push({ ...n, instrumentId: instId })
          })
        })
        overviewNotes.sort((a, b) => a.startMs - b.startMs)

        setStatusMsg(t('multiplayer.loadingNew'))
        try {
          await Promise.all(
            Array.from(requiredInsts).map(instId => audioPreview.getOrCreateSampler(instId))
          )
          setStatusMsg('')
        } catch (e) {
          showTempMsg(t('multiplayer.loadFailed'), 3000)
          return
        }

        if (previewTrackIdxRef.current === 'all-overview' && currentElapsedRef.current > 0) {
          startOverviewPreview(overviewNotes, currentElapsedRef.current)
        }
      }
    }

    runReboot()
  }, [playerCombinedTracks, parsedMidi, audioPreviewInstrument, multiplayerPreviewInstruments])

  // ==== 视图渲染 ====

  return (
    <div className="multiplayer-panel">
      <div className={`mp-status-toast ${toastVisible ? 'visible' : ''}`}>
        {toastText}
      </div>

      <div className={`mp-scroll-content ${role === 'host' && (!parsedMidi || isMaximized) ? 'maximized-host' : ''}`}>
        {role === 'none' ? (
          <>
            <div className="mp-header">
              <h2><Users size={24} /> {t('multiplayer.title')}</h2>
            </div>

            <div className="mp-lobby">
              <div style={{ display: 'flex', justifyContent: 'center'}}>
                <img 
                  src={multiplayerImg} 
                  alt="Multiplayer Banner" 
                  style={{ width: '280px', height: 'auto', borderRadius: '8px', objectFit: 'contain' }} 
                  draggable="false" 
                />
              </div>
              <div className="mp-lobby-intro" style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6', marginBottom: '4px', padding: '0 10px' }}>
                {t('multiplayer.lobbyIntro').split('\n').map((line, i) => (
                  <span key={i}>{line}<br /></span>
                ))}
              </div>

              <div className="mp-card" style={{ paddingBottom: 16 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={16} /> {t('multiplayer.nickname')}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                  {t('multiplayer.nicknameHint')}
                </p>
                <input
                  className="mp-input"
                  placeholder={t('multiplayer.nicknamePlaceholder')}
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  maxLength={10}
                />
              </div>

              <div className="mp-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> {t('multiplayer.createRoom')}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                  {t('multiplayer.createRoomHint')}
                </p>
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <button className="mp-btn host-btn" style={{ flex: 1 }} onClick={handleCreateRoom} disabled={isConnecting}>
                    {isConnecting && statusMsg.includes(t('multiplayer.creating').replace('...', '')) ? t('multiplayer.creating') : t('multiplayer.createRoom')}
                  </button>
                  <button className="mp-btn host-btn" style={{ flex: 1 }} onClick={handleCreateDevRoom} disabled={isConnecting}>
                    {t('multiplayer.soloSimulate')}
                  </button>
                </div>
              </div>

              <div className="mp-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LogIn size={16} /> {t('multiplayer.joinRoom')}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                  {t('multiplayer.joinRoomHint')}
                </p>
                <input
                  className="mp-input"
                  placeholder={t('multiplayer.joinPlaceholder')}
                  value={joinId}
                  onChange={e => setJoinId(e.target.value)}
                  maxLength={6}
                />
                <button className="mp-btn" onClick={handleJoinRoom} disabled={!joinId || isConnecting}>
                  {isConnecting && statusMsg.includes(t('multiplayer.joining').replace('...', '')) ? t('multiplayer.joining') : t('multiplayer.joinRoom')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {role === 'host' ? (
              <div className="mp-header-fusion">
                <div className="mp-header-left">
                  <h2><Users size={20} /> {t('multiplayer.hostRoom')}</h2>
                  <div className="mp-room-dropdown-container" ref={dropdownRef}>
                    <div
                      className={`mp-room-badge ${dropdownOpen ? 'dropdown-active' : ''}`}
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      title={t('multiplayer.clickToViewPlayers')}
                    >
                      <span className="badge-label">{t('multiplayer.roomCodeLabel')}</span>
                      <span className="badge-value">{myId}</span>
                      <ChevronDown size={14} className="badge-arrow" style={{ marginRight: 8, opacity: 0.6 }} />
                    </div>
                    {shouldRenderDropdown && (
                      <div className={`mp-room-dropdown-menu ${isDropdownClosing ? 'closing' : ''}`}>
                        <div className="mp-dropdown-header" onClick={() => {
                          navigator.clipboard.writeText(myId)
                          showTempMsg(t('multiplayer.copiedToClipboard'))
                        }}>
                          <span>{t('multiplayer.roomCodeLabel')}: <strong>{myId}</strong></span>
                          <span className="copy-tip">({t('multiplayer.clickToCopy')})</span>
                        </div>
                        <div className="mp-dropdown-divider"></div>
                        <div className="mp-dropdown-players">
                          <div className="mp-dropdown-player-item host">
                            <span className="player-p-index">P1</span>
                            <span className="player-p-name">{playerName || t('multiplayer.host')} <span className="player-role-tag">({t('multiplayer.hostTag')})</span></span>
                            <span className="player-p-check ready"><Check size={14} /></span>
                          </div>
                          {Array.from({ length: 3 }).map((_, i) => {
                            const pIndex = i + 2
                            const p = players[i]
                            if (p) {
                              return (
                                <div key={p.id} className="mp-dropdown-player-item">
                                  <span className="player-p-index">P{pIndex}</span>
                                  <span className="player-p-name">{p.name}</span>
                                  <span className={`player-p-check ${p.ready ? 'ready' : 'not-ready'}`}><Check size={14} /></span>
                                </div>
                              )
                            } else {
                              return (
                                <div key={`empty-${pIndex}`} className="mp-dropdown-player-item empty">
                                  <span className="player-p-index">P{pIndex}</span>
                                  <span className="player-p-name empty">{t('multiplayer.waiting')}</span>
                                  <span className="player-p-check hidden"><Check size={14} /></span>
                                </div>
                              )
                            }
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mp-header-right">
                  <button className="mp-btn disconnect-btn" onClick={handleDisconnect}>
                    <LogOut size={14} /> {t('multiplayer.disconnect')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mp-header-fusion">
                <div className="mp-header-left">
                  <h2><Users size={20} /> {t('multiplayer.clientRoom')}</h2>
                  {joinId && (
                    <div
                      className="mp-room-badge readonly"
                      title={t('multiplayer.clickToCopy')}
                      onClick={() => {
                        navigator.clipboard.writeText(joinId)
                        showTempMsg(t('multiplayer.copiedToClipboard'))
                      }}
                    >
                      <span className="badge-label">{t('multiplayer.roomCodeLabel')}</span>
                      <span className="badge-value">{joinId}</span>
                    </div>
                  )}
                </div>

                <div className="mp-header-right">
                  <button className="mp-btn disconnect-btn" onClick={handleDisconnect}>
                    <LogOut size={14} /> {t('multiplayer.disconnect')}
                  </button>
                </div>
              </div>
            )}

            <div className="mp-room">
              {/* 客机房间的基本提示信息 */}
              {role === 'client' && (
                <div className="mp-room-info" style={{ padding: '12px 20px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="mp-status-dot connected"></div>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {Object.keys(multiplayerCombinedTracks).length > 0 ? t('multiplayer.joinedReady') : t('multiplayer.joinedWaiting')}
                    </span>
                  </div>
                </div>
              )}

              {/* 客机端的音轨展示列表（同步自房主的完整多轨总览） */}
              {role === 'client' && (
                <div className="mp-track-list">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>{t('multiplayer.allTracksPreview')}</h3>
                    <button
                      className={`mp-btn ${previewTrackIdx === 'all-overview' ? 'primary' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={handleOverviewPreview}
                      disabled={Object.keys(playerCombinedTracks).length === 0 || playbackState !== 'idle' || isClientReady}
                      title={previewTrackIdx === 'all-overview' ? t('multiplayer.stop') : t('multiplayer.allPreview')}
                    >
                      {previewTrackIdx === 'all-overview' ? <Square size={14} /> : <Volume2 size={14} />}
                      <span>{previewTrackIdx === 'all-overview' ? t('multiplayer.stop') : t('multiplayer.allPreview')}</span>
                    </button>
                  </div>

                  <div style={{ position: 'relative' }}>
                    {Object.keys(playerCombinedTracks).length === 0 ? (
                      <div className="mp-empty-tracks-placeholder">
                        {t('multiplayer.noTracks')}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {Object.entries(playerCombinedTracks).map(([pid, notes]) => {
                          const isMe = pid === networkManager.myId
                          const isHost = pid === 'me'
                          const player = isMe ? null : (isHost ? null : players.find(p => p.id === pid))

                          const nameText = isMe
                            ? (playerName || t('multiplayer.me'))
                            : (isHost ? (multiplayerHostName || t('multiplayer.host')) : (player ? player.name : `Player ${pid.substring(0, 4)}`))

                          const instId = getInstrumentForPlayer(pid)

                          return (
                            <div key={`overview-${pid}`} className="mp-track-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="mp-track-info">
                                  <div className="mp-track-name" style={{ fontSize: 13, color: isMe ? 'var(--primary)' : 'var(--text-secondary)' }}>
                                    {nameText}
                                    {isMe && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>({t('multiplayer.meTag')})</span>}
                                    {isHost && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>({t('multiplayer.hostTag')})</span>}
                                  </div>
                                  <div className="mp-track-meta" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                    <span>{t('multiplayer.noteCount', { count: notes.length })}</span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                      {t('multiplayer.instrument')}: {INSTRUMENT_DIR_MAP[instId] || t('multiplayer.unknown')}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  className={`mp-btn ${previewTrackIdx === `overview-${pid}` ? 'primary' : ''}`}
                                  style={{ padding: '6px 10px' }}
                                  onClick={() => handlePreviewTrack(`overview-${pid}`, notes, instId)}
                                  disabled={notes.length === 0 || playbackState !== 'idle' || isClientReady}
                                  title={previewTrackIdx === `overview-${pid}` ? t('multiplayer.stop') : t('multiplayer.preview')}
                                >
                                  {previewTrackIdx === `overview-${pid}` ? <Square size={16} /> : <Play size={16} />}
                                </button>
                              </div>

                              <div style={{ position: 'relative' }}>
                                <MiniTrackPreview
                                  notes={notes}
                                  elapsedMs={previewTrackIdx === `overview-${pid}` ? previewElapsed : (previewTrackIdx === 'all-overview' ? previewElapsed : 0)}
                                  onSeek={async (timeMs) => {
                                    const playerInstId = getInstrumentForPlayer(pid)
                                    if (previewTrackIdx === 'all-overview') {
                                      const overviewNotes: Array<MappedNote & { instrumentId: string }> = []
                                      Object.entries(playerCombinedTracks).forEach(([pKey, ns]) => {
                                        const pInstId = getInstrumentForPlayer(pKey)
                                        ns.forEach(n => {
                                          overviewNotes.push({ ...n, instrumentId: pInstId })
                                        })
                                      })
                                      overviewNotes.sort((a, b) => a.startMs - b.startMs)
                                      startOverviewPreview(overviewNotes, timeMs)
                                    } else {
                                      try { await audioPreview.getOrCreateSampler(playerInstId) } catch (e) { }
                                      startPreview(`overview-${pid}`, notes, timeMs, playerInstId)
                                    }
                                  }}
                                  totalDurationMs={clientTotalDurationMs}
                                  disabled={playbackState !== 'idle' || isClientReady}
                                />
                                {playbackState !== 'idle' && (
                                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
                                    <GlobalProgressLine totalDurationMs={clientTotalDurationMs} />
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* 客机准备就绪大按钮操作区 */}
                  {playbackState === 'idle' && (() => {
                    const myNotes = playerCombinedTracks[networkManager.myId] || []
                    const myInstrument = multiplayerPreviewInstruments[networkManager.myId]
                    const showReadyPrompt = myInstrument && myNotes.length > 0

                    return (
                      <div className="client-ready-section">
                        <button
                          className={`ready-toggle-btn ${isClientReady ? 'is-ready' : 'not-ready'}`}
                          onClick={() => {
                            const newReady = !isClientReady
                            setIsClientReady(newReady)
                            networkManager.sendReadyState(newReady)
                            if (newReady) {
                              stopPreview()
                            }
                          }}
                        >
                          {isClientReady ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
                          <span>{isClientReady ? t('multiplayer.readyStatus') : t('multiplayer.ready')}</span>
                        </button>

                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: 12, lineHeight: '1.6', margin: '12px 0 0 0' }}>
                          {isClientReady ? (
                            <>
                              {showReadyPrompt ? (
                                <>{t('multiplayer.readyPromptInstrument', { inst: t(`instruments.${myInstrument}`) || t('instruments.Lyre') })}</>
                              ) : (
                                <>{t('multiplayer.readyPrompt')}</>
                              )}
                              {t('multiplayer.waitForHost')}
                            </>
                          ) : (
                            <>
                              {showReadyPrompt && (
                                <>{t('multiplayer.selectInstrumentPrompt', { inst: t(`instruments.${myInstrument}`) || t('instruments.Lyre') })}</>
                              )}
                              {t('multiplayer.clickReadyPrompt')}
                            </>
                          )}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              )}

              {role === 'host' && parsedMidi && (
                <>
                  <div className={`mp-host-layout ${isMaximized ? 'maximized' : ''}`}>
                  {/* 合并总览 */}
                  <div className="mp-layout-column mp-preview-column">
                    <div className="mp-track-list" style={{ paddingBottom: 16, borderBottom: isMaximized ? 'none' : '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px' }}>{t('multiplayer.allTracksPreview')}</h3>
                        <button
                          className={`mp-btn ${previewTrackIdx === 'all-overview' ? 'primary' : ''}`}
                          style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={handleOverviewPreview}
                          disabled={playbackState !== 'idle'}
                          title={previewTrackIdx === 'all-overview' ? t('multiplayer.stop') : t('multiplayer.allPreview')}
                        >
                          {previewTrackIdx === 'all-overview' ? <Square size={14} /> : <Volume2 size={14} />}
                          <span>{previewTrackIdx === 'all-overview' ? t('multiplayer.stop') : t('multiplayer.allPreview')}</span>
                        </button>
                      </div>

                      <div style={{ position: 'relative' }}>
                        {Object.keys(playerCombinedTracks).length === 0 ? (
                          <div className="mp-empty-tracks-placeholder">
                            {t('multiplayer.noAssignedTracks')}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {Object.entries(playerCombinedTracks).map(([pid, notes]) => {
                              const isMe = pid === 'me'
                              const player = isMe ? null : players.find(p => p.id === pid)
                              const nameText = isMe ? (playerName || t('multiplayer.host')) : (player ? player.name : `${t('multiplayer.player')} ${pid.substring(0, 4)}`)

                              return (
                                <div key={`overview-${pid}`} className="mp-track-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: '12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="mp-track-info">
                                      <div className="mp-track-name" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                        {nameText}
                                        {isMe && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>({t('multiplayer.meTag')})</span>}
                                      </div>
                                      <div className="mp-track-meta" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                        <span>{t('multiplayer.noteCount', { count: notes.length })}</span>

                                        {/* 只有主机能够为所有人配置乐器/试听，客机端无需展示配置 */}
                                        {role === 'host' && (
                                          <div className="mp-inst-btn-group" onClick={e => e.stopPropagation()}>
                                            {[
                                              { id: 'Lyre' },
                                              { id: 'Zither' },
                                              { id: 'Vintage-Lyre' },
                                              { id: 'Horn' },
                                              { id: 'Ukulele' },
                                              { id: 'LingeringEuphonia' },
                                              { id: 'LeapingSpiritPiano' },
                                              { id: 'HarmonicKey' }
                                            ].map(inst => {
                                              const currentInst = isMe ? audioPreviewInstrument : (multiplayerPreviewInstruments[pid] || 'Lyre')
                                              const isActive = currentInst === inst.id
                                              return (
                                                <button
                                                  key={inst.id}
                                                  className={`mp-inst-btn ${isActive ? 'active' : ''}`}
                                                  onClick={() => {
                                                    if (isMe) {
                                                      setAudioPreviewInstrument(inst.id)
                                                    } else {
                                                      setMultiplayerPreviewInstrument(pid, inst.id)
                                                    }
                                                  }}
                                                  title={t(`instruments.${inst.id}`)}
                                                  disabled={playbackState !== 'idle'}
                                                >
                                                  <img src={`img/${inst.id}.png`} alt={t(`instruments.${inst.id}`)} />
                                                </button>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      className={`mp-btn ${previewTrackIdx === `overview-${pid}` ? 'primary' : ''}`}
                                      style={{ padding: '6px 10px' }}
                                      onClick={() => {
                                        const instId = pid === 'me' ? audioPreviewInstrument : (multiplayerPreviewInstruments[pid] || 'Lyre')
                                        handlePreviewTrack(`overview-${pid}`, notes, instId)
                                      }}
                                      disabled={notes.length === 0 || playbackState !== 'idle'}
                                      title={previewTrackIdx === `overview-${pid}` ? t('multiplayer.stop') : t('multiplayer.preview')}
                                    >
                                      {previewTrackIdx === `overview-${pid}` ? <Square size={16} /> : <Play size={16} />}
                                    </button>
                                  </div>

                                  <MiniTrackPreview
                                    notes={notes}
                                    elapsedMs={(previewTrackIdx === `overview-${pid}` || previewTrackIdx === 'all-overview') ? previewElapsed : 0}
                                    onSeek={async (timeMs) => {
                                      const instId = pid === 'me' ? audioPreviewInstrument : (multiplayerPreviewInstruments[pid] || 'Lyre')
                                      if (previewTrackIdx === 'all-overview') {
                                        const overviewNotes: Array<MappedNote & { instrumentId: string }> = []
                                        Object.entries(playerCombinedTracks).forEach(([pKey, ns]) => {
                                          const pInstId = pKey === 'me' ? audioPreviewInstrument : (multiplayerPreviewInstruments[pKey] || 'Lyre')
                                          ns.forEach(n => {
                                            overviewNotes.push({ ...n, instrumentId: pInstId })
                                          })
                                        })
                                        overviewNotes.sort((a, b) => a.startMs - b.startMs)
                                        startOverviewPreview(overviewNotes, timeMs)
                                      } else {
                                        if (instId) {
                                          try { await audioPreview.getOrCreateSampler(instId) } catch (e) { }
                                        }
                                        startPreview(`overview-${pid}`, notes, timeMs, instId)
                                      }
                                    }}
                                    totalDurationMs={parsedMidi.totalDurationMs}
                                    disabled={playbackState !== 'idle'}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {playbackState !== 'idle' && (
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, right: 12, pointerEvents: 'none' }}>
                            <GlobalProgressLine totalDurationMs={parsedMidi.totalDurationMs} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 分配列表 */}
                  <div className="mp-layout-column mp-assign-column">
                    <div className="mp-track-list">
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{t('multiplayer.midiTrackAssignment')}</h3>
                      {parsedMidi.tracks.map((trackNotes, idx) => {
                        const noteCount = trackNotes.length
                        const currentAssign = assignments[idx] || 'none'
                        const mappedTrack = hostMappedTracks[idx] || []

                        // 乐器与轨道名称提取
                        const meta = parsedMidi.trackMeta?.[idx]
                        let trackDisplay = t('multiplayer.trackLabel', { num: idx + 1 }) as string
                        if (meta) {
                          const parts = []
                          if (meta.name && meta.name.trim() !== `Track ${idx}`) parts.push(meta.name)
                          if (meta.instrument && meta.instrument !== 'acoustic grand piano') parts.push(meta.instrument)

                          if (parts.length > 0) {
                            trackDisplay += ` - ${parts.join(' / ')}`
                          } else if (meta.instrument) {
                            trackDisplay += ` - ${meta.instrument}`
                          }
                        }

                        return (
                          <div key={idx} className="mp-track-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div className="mp-track-info">
                                <div className="mp-track-name" style={{ fontSize: 13 }} title={trackDisplay}>
                                  {trackDisplay.length > 30 ? trackDisplay.substring(0, 30) + '...' : trackDisplay}
                                </div>
                                <div className="mp-track-meta">{t('multiplayer.rawNotes', { raw: noteCount, mapped: mappedTrack.length })}</div>
                              </div>

                              <div className="mp-track-assign" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <div className="mp-assign-btn-group">
                                  <button
                                    className={`mp-assign-btn ${currentAssign === 'me' ? 'active' : ''}`}
                                    onClick={() => handleAssign(idx, 'me')}
                                    disabled={playbackState !== 'idle'}
                                    title={`${playerName || t('multiplayer.host')} (${t('multiplayer.meTag')})`}
                                  >
                                    P1
                                  </button>
                                  <button
                                    className={`mp-assign-btn ${players[0] && currentAssign === players[0].id ? 'active' : ''}`}
                                    onClick={() => players[0] && handleAssign(idx, players[0].id)}
                                    disabled={playbackState !== 'idle' || !players[0]}
                                    title={players[0] ? players[0].name : t('multiplayer.noPlayer')}
                                  >
                                    P2
                                  </button>
                                  <button
                                    className={`mp-assign-btn ${players[1] && currentAssign === players[1].id ? 'active' : ''}`}
                                    onClick={() => players[1] && handleAssign(idx, players[1].id)}
                                    disabled={playbackState !== 'idle' || !players[1]}
                                    title={players[1] ? players[1].name : t('multiplayer.noPlayer')}
                                  >
                                    P3
                                  </button>
                                  <button
                                    className={`mp-assign-btn ${players[2] && currentAssign === players[2].id ? 'active' : ''}`}
                                    onClick={() => players[2] && handleAssign(idx, players[2].id)}
                                    disabled={playbackState !== 'idle' || !players[2]}
                                    title={players[2] ? players[2].name : t('multiplayer.noPlayer')}
                                  >
                                    P4
                                  </button>
                                  <button
                                    className={`mp-assign-btn ban-btn ${currentAssign === 'none' ? 'active' : ''}`}
                                    onClick={() => handleAssign(idx, 'none')}
                                    disabled={playbackState !== 'idle'}
                                    title={t('multiplayer.noAssign')}
                                  >
                                    <Ban size={12} />
                                  </button>
                                </div>
                                <button
                                  className={`mp-btn ${previewTrackIdx === idx ? 'primary' : ''}`}
                                  style={{ padding: '6px 10px' }}
                                  onClick={() => {
                                    const pid = assignments[idx] || 'none'
                                    const instId = pid === 'none' ? undefined : (pid === 'me' ? audioPreviewInstrument : (multiplayerPreviewInstruments[pid] || 'Lyre'))
                                    handlePreviewTrack(idx, mappedTrack, instId)
                                  }}
                                  disabled={playbackState !== 'idle'}
                                  title={previewTrackIdx === idx ? t('multiplayer.stop') : t('multiplayer.preview')}
                                >
                                  {previewTrackIdx === idx ? <Square size={16} /> : <Play size={16} />}
                                </button>
                              </div>
                            </div>

                            <MiniTrackPreview
                              notes={mappedTrack}
                              elapsedMs={previewTrackIdx === idx ? previewElapsed : 0}
                              onSeek={async (timeMs) => {
                                const pid = assignments[idx] || 'none'
                                const instId = pid === 'none' ? undefined : (pid === 'me' ? audioPreviewInstrument : (multiplayerPreviewInstruments[pid] || 'Lyre'))
                                if (instId) {
                                  try { await audioPreview.getOrCreateSampler(instId) } catch (e) { }
                                }
                                startPreview(idx, mappedTrack, timeMs, instId)
                              }}
                              totalDurationMs={parsedMidi.totalDurationMs}
                              disabled={playbackState !== 'idle'}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-dim)', marginTop: '12px' }}>
                  {t('multiplayer.assignComplete')}
                </div>
              </>
            )}

              {role === 'host' && !parsedMidi && (
                <div className="empty-midi-splash" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="empty-splash-logo-container">
                    <img src={startImg} className="empty-splash-logo" alt="Start Splash" draggable="false" />
                    <div className="empty-splash-text">{t('multiplayer.selectMidiToPlay')}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
