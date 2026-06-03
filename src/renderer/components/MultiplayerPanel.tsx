import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Users, Wifi, LogOut, Play, Square, User } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { networkManager, NetworkRole, NetworkPlayer } from '../core/network-manager'
import { mapNotes, MappedNote } from '../core/note-mapper'
import { audioPreview } from '../core/audio-preview'
import './MultiplayerPanel.css'

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
  const parsedMidi = useAppStore(state => state.parsedMidi)
  const clientTrackData = useAppStore(state => state.clientTrackData)
  const clientTotalDurationMs = useAppStore(state => state.clientTotalDurationMs)
  
  const [role, setRole] = useState<NetworkRole>(networkManager.currentRole)
  const [myId, setMyId] = useState(networkManager.myId)
  const [players, setPlayers] = useState<NetworkPlayer[]>(networkManager.connectedPlayers)
  
  const [joinId, setJoinId] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  
  const playerName = useAppStore(state => state.playerName)
  const setPlayerName = useAppStore(state => state.setPlayerName)
  
  const assignments = useAppStore(state => state.multiplayerAssignments)
  const setAssignments = useAppStore(state => state.setMultiplayerAssignments)
  
  const blackKeyConfig = useAppStore(state => state.blackKeyConfig)
  const transpose = useAppStore(state => state.transpose)
  const minInterval = useAppStore(state => state.minInterval)
  const minDuration = useAppStore(state => state.minDuration)
  const instrumentMode = useAppStore(state => state.instrumentMode)
  const playbackState = useAppStore(state => state.playbackState)

  // 预览播放状态
  const [previewTrackIdx, setPreviewTrackIdx] = useState<string | number | null>(null)
  const [previewElapsed, setPreviewElapsed] = useState<number>(0)
  const currentElapsedRef = useRef<number>(0)
  const previewRafRef = useRef<number>(0)
  const activeNotesRef = useRef<Set<number>>(new Set())

  // 当属性变化时，如果作为 Host，预计算并下发音轨数据
  useEffect(() => {
    if (role === 'host' && parsedMidi) {
      const playerToNotes = new Map<string, MappedNote[]>()
      
      parsedMidi.tracks.forEach((trackNotes, idx) => {
        const pid = assignments[idx] || 'me'
        if (pid !== 'none') {
          const mapped = mapNotes(trackNotes, {
            blackKeyConfig,
            transpose,
            minInterval,
            minDuration,
            instrumentMode
          })
          if (!playerToNotes.has(pid)) playerToNotes.set(pid, [])
          playerToNotes.get(pid)!.push(...mapped)
        }
      })
      
      // 给对应的玩家发送预处理数据（去重并在必要时合并）
      for (const player of players) {
        if (playerToNotes.has(player.id)) {
          const combined = playerToNotes.get(player.id)!
          // 为了客户端试听和视觉，按时间排个序
          combined.sort((a, b) => a.startMs - b.startMs)
          networkManager.sendTrackDataToPlayer(player.id, combined, parsedMidi.totalDurationMs)
        } else {
          networkManager.sendTrackDataToPlayer(player.id, [], parsedMidi.totalDurationMs)
        }
      }
    }
  }, [role, parsedMidi, assignments, players, blackKeyConfig, transpose, minInterval, minDuration, instrumentMode])

  useEffect(() => {
    networkManager.events.onRoleChange = (newRole) => {
      setRole(newRole)
      setMyId(networkManager.myId)
    }
    networkManager.events.onPlayersChange = (newPlayers) => {
      setPlayers([...newPlayers])
    }
    networkManager.events.onError = (err) => {
      setStatusMsg(`错误: ${err.message}`)
      setIsConnecting(false)
    }
    networkManager.events.onConnected = () => {
      setStatusMsg('已连接到主机')
      setIsConnecting(false)
    }
    networkManager.events.onDisconnected = () => {
      setStatusMsg('连接已断开')
      setRole('none')
    }

    return () => {
      networkManager.events.onRoleChange = undefined
      networkManager.events.onPlayersChange = undefined
      networkManager.events.onError = undefined
      networkManager.events.onConnected = undefined
      networkManager.events.onDisconnected = undefined
      stopPreview()
    }
  }, [])

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      setStatusMsg('请先设置您的昵称')
      return
    }
    setIsConnecting(true)
    setStatusMsg('正在创建房间...')
    try {
      await networkManager.createRoom(playerName.trim())
      setStatusMsg('房间创建成功')
    } catch (err) { }
    finally {
      setIsConnecting(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setStatusMsg('请先设置您的昵称')
      return
    }
    if (!joinId.trim()) return
    setIsConnecting(true)
    setStatusMsg('正在连接...')
    try {
      await networkManager.joinRoom(joinId.trim().toUpperCase(), playerName.trim())
    } catch (err) { }
  }

  const handleDisconnect = () => {
    networkManager.disconnect()
    setAssignments({})
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
    for (const note of activeNotesRef.current) {
      audioPreview.noteOff(note)
    }
    activeNotesRef.current.clear()
    
    // 恢复之前的音频预览启用状态
    const globalAudioPreviewEnabled = useAppStore.getState().audioPreviewEnabled
    audioPreview.setEnabled(globalAudioPreviewEnabled)
  }



  const startPreview = (id: string | number, notes: MappedNote[], startOffsetMs: number = 0) => {
    stopPreview()
    if (!notes || notes.length === 0) return

    setPreviewTrackIdx(id)
    setPreviewElapsed(startOffsetMs)
    currentElapsedRef.current = startOffsetMs
    const startTime = performance.now() - startOffsetMs
    
    // 跳转到指定时间的索引
    let noteIndex = 0
    while (noteIndex < notes.length && notes[noteIndex].startMs < startOffsetMs) {
      noteIndex++
    }

    const activeTimeouts = new Map<number, NodeJS.Timeout>()

    const tick = () => {
      const elapsed = performance.now() - startTime
      setPreviewElapsed(elapsed)
      currentElapsedRef.current = elapsed

      while (noteIndex < notes.length && notes[noteIndex].startMs <= elapsed) {
        const note = notes[noteIndex]
        audioPreview.noteOn(note.midiNote, note.velocity)
        activeNotesRef.current.add(note.midiNote)
        
        const timer = setTimeout(() => {
          audioPreview.noteOff(note.midiNote)
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

  const handlePreviewTrack = (id: string | number, notes: MappedNote[]) => {
    if (previewTrackIdx === id) {
      stopPreview()
    } else {
      startPreview(id, notes, 0)
    }
  }

  // 预先映射好的所有轨道，供主机使用
  const hostMappedTracks = useMemo(() => {
    if (!parsedMidi) return []
    return parsedMidi.tracks.map(track => mapNotes(track, {
      blackKeyConfig, transpose, minInterval, minDuration, instrumentMode
    }))
  }, [parsedMidi, blackKeyConfig, transpose, minInterval, minDuration, instrumentMode])
  
  // 各玩家合并后的音轨总览
  const playerCombinedTracks = useMemo(() => {
    if (!parsedMidi) return {}
    const map: Record<string, MappedNote[]> = { 'me': [] }
    players.forEach(p => map[p.id] = [])
    
    hostMappedTracks.forEach((mappedNotes, idx) => {
      const pid = assignments[idx] || 'me'
      if (pid !== 'none' && map[pid]) {
        map[pid].push(...mappedNotes)
      }
    })
    
    // 排序
    Object.values(map).forEach(notes => notes.sort((a, b) => a.startMs - b.startMs))
    return map
  }, [hostMappedTracks, assignments, players])

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
      return
    }

    // 如果歌曲没变，说明是 assignments 变化导致的 playerCombinedTracks 变化
    // 如果当前正在试听合并总览，则无缝重启更新声音
    if (typeof previewTrackIdx === 'string' && previewTrackIdx.startsWith('overview-')) {
      const pid = previewTrackIdx.replace('overview-', '')
      const latestNotes = playerCombinedTracks[pid] || []
      // 保持当前进度重启
      startPreview(previewTrackIdx, latestNotes, currentElapsedRef.current)
    }
  }, [playerCombinedTracks, parsedMidi])

  // ==== 视图渲染 ====

  if (role === 'none') {
    return (
      <div className="multiplayer-panel">
        <div className="mp-header">
          <h2><Users size={24} /> 多人联机合奏</h2>
        </div>
        
        <div className="mp-lobby">
          <div className="mp-card" style={{ paddingBottom: 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={16} /> 玩家昵称</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
              请设置一个名字，方便小伙伴在分配音轨时找到您。
            </p>
            <input 
              className="mp-input" 
              placeholder="输入名称" 
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
            />
          </div>

          <div className="mp-card">
            <h3>我是主机 (Host)</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
              创建一个房间，您可以选择 MIDI 并将不同的音轨拆分并分配给其他玩家。
            </p>
            <button className="mp-btn primary" onClick={handleCreateRoom} disabled={isConnecting}>
              {isConnecting && statusMsg.includes('创建') ? '创建中...' : '创建房间'}
            </button>
          </div>

          <div className="mp-card">
            <h3>我是客机 (Client)</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
              输入主机提供的房间号，加入合奏。
            </p>
            <input 
              className="mp-input" 
              placeholder="输入 6 位房间号" 
              value={joinId}
              onChange={e => setJoinId(e.target.value)}
              maxLength={6}
            />
            <button className="mp-btn" onClick={handleJoinRoom} disabled={!joinId || isConnecting}>
              {isConnecting && statusMsg.includes('连接') ? '连接中...' : '加入房间'}
            </button>
          </div>

          {statusMsg && (
            <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-dim)' }}>
              {statusMsg}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="multiplayer-panel">
      <div className="mp-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2><Users size={24} /> {role === 'host' ? '主机房间' : '客机房间'}</h2>
        <button className="mp-btn" onClick={handleDisconnect}>
          <LogOut size={16} /> 断开连接
        </button>
      </div>

      <div className="mp-room">
        {role === 'host' && (
          <div className="mp-room-info">
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>您的房间号 (点击复制)</div>
              <div className="mp-room-id" style={{ cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText(myId)}>
                {myId}
              </div>
            </div>
            <div className="mp-status-indicator">
              <div className="mp-status-dot connected"></div>
              {players.length} 名玩家已连接
            </div>
          </div>
        )}

        {role === 'client' && (
          <div className="mp-waiting" style={{ padding: '24px 0', borderBottom: '1px solid var(--glass-border)' }}>
            <div className="mp-status-indicator">
              <div className="mp-status-dot connected"></div>
              {statusMsg}
            </div>
          </div>
        )}
        
        {role === 'client' && clientTrackData && (
          <div className="mp-track-list">
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>我的音轨分配</h3>
            <div className="mp-track-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="mp-track-info">
                  <div className="mp-track-name">{playerName || '客机玩家'} (我)</div>
                  <div className="mp-track-meta">共 {clientTrackData.length} 个音符</div>
                </div>
                <button 
                  className={`mp-btn ${previewTrackIdx === 'client' ? 'primary' : ''}`}
                  style={{ padding: '6px 10px' }}
                  onClick={() => handlePreviewTrack('client', clientTrackData)}
                  disabled={playbackState !== 'idle'}
                  title={previewTrackIdx === 'client' ? '停止试听' : '试听'}
                >
                  {previewTrackIdx === 'client' ? <Square size={16} /> : <Play size={16} />}
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <MiniTrackPreview 
                  notes={clientTrackData} 
                  elapsedMs={previewTrackIdx === 'client' ? previewElapsed : 0}
                  onSeek={(timeMs) => startPreview('client', clientTrackData, timeMs)}
                  totalDurationMs={clientTotalDurationMs}
                  disabled={playbackState !== 'idle'}
                />
                {playbackState !== 'idle' && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
                    <GlobalProgressLine totalDurationMs={clientTotalDurationMs} />
                  </div>
                )}
              </div>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center', marginTop: 24 }}>
              请等待主机点击开始播放...
            </p>
          </div>
        )}

        {role === 'host' && parsedMidi && (
          <>
            {/* 合并总览 */}
            <div className="mp-track-list" style={{ paddingBottom: 16, borderBottom: '1px solid var(--glass-border)' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>各玩家声部合并预览</h3>
              
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(playerCombinedTracks).map(([pid, notes]) => {
                    const isMe = pid === 'me'
                    const player = isMe ? null : players.find(p => p.id === pid)
                    const dispName = isMe ? `我自己 (主机: ${playerName || '未命名'})` : (player ? `${player.name}` : `玩家 ${pid.substring(0, 4)}`)
                    
                    return (
                      <div key={`overview-${pid}`} className="mp-track-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="mp-track-info">
                            <div className="mp-track-name" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{dispName}</div>
                            <div className="mp-track-meta">共 {notes.length} 个音符</div>
                          </div>
                          
                          <button 
                            className={`mp-btn ${previewTrackIdx === `overview-${pid}` ? 'primary' : ''}`}
                            style={{ padding: '6px 10px' }}
                            onClick={() => handlePreviewTrack(`overview-${pid}`, notes)}
                            disabled={notes.length === 0 || playbackState !== 'idle'}
                            title={previewTrackIdx === `overview-${pid}` ? '停止试听' : '试听'}
                          >
                            {previewTrackIdx === `overview-${pid}` ? <Square size={16} /> : <Play size={16} />}
                          </button>
                        </div>
                        
                        <MiniTrackPreview 
                          notes={notes}
                          elapsedMs={previewTrackIdx === `overview-${pid}` ? previewElapsed : 0}
                          onSeek={(timeMs) => startPreview(`overview-${pid}`, notes, timeMs)}
                          totalDurationMs={parsedMidi.totalDurationMs}
                          disabled={playbackState !== 'idle'}
                        />
                      </div>
                    )
                  })}
                </div>
                {playbackState !== 'idle' && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, right: 12, pointerEvents: 'none' }}>
                    <GlobalProgressLine totalDurationMs={parsedMidi.totalDurationMs} />
                  </div>
                )}
              </div>
            </div>
            
            <div className="mp-track-list" style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>MIDI 轨道分配列表</h3>
              {parsedMidi.tracks.map((trackNotes, idx) => {
                const noteCount = trackNotes.length
                const currentAssign = assignments[idx] || 'me'
                const mappedTrack = hostMappedTracks[idx] || []
                
                // 乐器与轨道名称提取
                const meta = parsedMidi.trackMeta?.[idx]
                let trackDisplay = `轨道 ${idx + 1}`
                if (meta) {
                  const parts = []
                  if (meta.name && meta.name.trim() !== `Track ${idx}`) parts.push(meta.name)
                  if (meta.instrument && meta.instrument !== 'acoustic grand piano') parts.push(meta.instrument) // 默认是钢琴的话可以省略，也可以显示
                  
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
                        <div className="mp-track-meta">原始音符: {noteCount} | 映射后: {mappedTrack.length}</div>
                      </div>
                      
                      <div className="mp-track-assign" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          分配给:
                          <select 
                            className="mp-select" 
                            value={currentAssign}
                            onChange={(e) => handleAssign(idx, e.target.value)}
                            disabled={playbackState !== 'idle'}
                          >
                            <option value="me">我自己 (主机)</option>
                            <option value="none">不演奏</option>
                            {players.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <button 
                          className={`mp-btn ${previewTrackIdx === idx ? 'primary' : ''}`}
                          style={{ padding: '6px 10px' }}
                          onClick={() => handlePreviewTrack(idx, mappedTrack)}
                          disabled={playbackState !== 'idle'}
                          title={previewTrackIdx === idx ? '停止试听' : '试听'}
                        >
                          {previewTrackIdx === idx ? <Square size={16} /> : <Play size={16} />}
                        </button>
                      </div>
                    </div>
                    
                    <MiniTrackPreview 
                      notes={mappedTrack}
                      elapsedMs={previewTrackIdx === idx ? previewElapsed : 0}
                      onSeek={(timeMs) => startPreview(idx, mappedTrack, timeMs)}
                      totalDurationMs={parsedMidi.totalDurationMs}
                      disabled={playbackState !== 'idle'}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
