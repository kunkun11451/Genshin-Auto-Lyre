import { Play, Pause, Square, SkipBack, SkipForward, Settings, ChevronUp, ChevronDown, Piano, Volume2, MoreHorizontal } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import './PlaybackControls.css'

interface PlaybackControlsProps {
  isPlaying: boolean
  totalDurationMs: number
  speed: number
  onPlayPause: () => void
  onStop: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (timeMs: number) => void
  onSpeedChange: (speed: number) => void
  onOpenSettings: () => void
  isMiniMode?: boolean
  delayDurationSec?: number | null
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlaybackControls({
  isPlaying,
  totalDurationMs,
  speed,
  onPlayPause,
  onStop,
  onPrev,
  onNext,
  onSeek,
  onSpeedChange,
  onOpenSettings,
  isMiniMode = false,
  delayDurationSec = null
}: PlaybackControlsProps): React.JSX.Element {
  
  const currentTimeMs = useAppStore(state => state.currentTimeMs)
  const progressPercent = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0
  
  const instrumentMode = useAppStore(state => state.instrumentMode)
  const setInstrumentMode = useAppStore(state => state.setInstrumentMode)
  const audioPreviewEnabled = useAppStore(state => state.audioPreviewEnabled)
  const setAudioPreviewEnabled = useAppStore(state => state.setAudioPreviewEnabled)

  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false)
  const [shouldRenderPopup, setShouldRenderPopup] = useState(false)
  const [isPopupClosing, setIsPopupClosing] = useState(false)

  useEffect(() => {
    if (isQuickSettingsOpen) {
      setShouldRenderPopup(true)
      setIsPopupClosing(false)
    } else if (shouldRenderPopup) {
      setIsPopupClosing(true)
      const timer = setTimeout(() => {
        setShouldRenderPopup(false)
        setIsPopupClosing(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isQuickSettingsOpen, shouldRenderPopup])

  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsQuickSettingsOpen(false)
      }
    }
    if (isQuickSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isQuickSettingsOpen])

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = clickX / rect.width
    onSeek(percent * totalDurationMs)
  }

  return (
    <div className={`playback-controls ${isMiniMode ? 'mini-mode' : ''}`}>
      <div className="progress-container">
        <span className="time-display">{formatTime(currentTimeMs)}</span>
        <div className="progress-bar-wrapper" onClick={handleProgressBarClick}>
          <div className="progress-bar-track">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <span className="time-display">{formatTime(totalDurationMs)}</span>
      </div>

      <div className="controls-main">
        {/* 左侧：停止 */}
        <div className="controls-left">
          <button className="btn-icon" onClick={onStop} title="停止">
            <Square size={16} />
          </button>
        </div>

        {/* 中间：上一首、播放、下一首 */}
        <div className="controls-center">
          <button className="btn-icon" onClick={onPrev} title="上一首">
            <SkipBack size={18} />
          </button>
          <button className="btn-icon play-btn" onClick={onPlayPause} title={isPlaying ? '暂停' : '播放'}>
            {delayDurationSec !== null && (
              <svg className="play-delay-circle" viewBox="0 0 44 44">
                <circle 
                  cx="22" 
                  cy="22" 
                  r="20" 
                  pathLength="100" 
                  style={{ animationDuration: `${Math.max(0.1, delayDurationSec - 0.25)}s` }} 
                />
              </svg>
            )}
            {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: '4px' }} />}
          </button>
          <button className="btn-icon" onClick={onNext} title="下一首">
            <SkipForward size={18} />
          </button>
        </div>

        {/* 右侧：速度控制、设置 */}
        <div className="controls-right">
          {!isMiniMode && (
            <div className="speed-control">
              <span style={{ minWidth: '40px', textAlign: 'center' }}>{speed.toFixed(1)}x</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button 
                  className="btn-speed" 
                  onClick={() => onSpeedChange(Math.min(2.0, speed + 0.1))}
                  title="加速"
                >
                  <ChevronUp size={14} />
                </button>
                <button 
                  className="btn-speed" 
                  onClick={() => onSpeedChange(Math.max(0.5, speed - 0.1))}
                  title="减速"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          )}
          <div style={{ position: 'relative' }} ref={popupRef}>
            <button 
              className={`btn-icon ${isQuickSettingsOpen ? 'active' : ''}`} 
              onClick={(e) => {
                e.stopPropagation();
                setIsQuickSettingsOpen(!isQuickSettingsOpen);
              }} 
              title="快速设置" 
              style={isMiniMode ? {} : { marginLeft: '16px' }}
            >
              <Settings size={18} />
            </button>
            
            {shouldRenderPopup && (
              <div className={`quick-settings-popup ${isPopupClosing ? 'closing' : ''}`}>
                <div className="quick-setting-item">
                  <div className="quick-setting-label">
                    <Piano size={14} />
                    <span>选择乐器</span>
                  </div>
                  <select 
                    value={instrumentMode} 
                    onChange={(e) => setInstrumentMode(e.target.value as any)}
                  >
                    <option value="standard">普通琴</option>
                    <option value="chord">和弦琴</option>
                    <option value="horn">晚风圆号</option>
                  </select>
                </div>
                
                <div className="quick-setting-item">
                  <div className="quick-setting-label">
                    <Volume2 size={14} />
                    <span>midi试听</span>
                  </div>
                  <label className="toggle-switch small">
                    <input 
                      type="checkbox" 
                      checked={audioPreviewEnabled}
                      onChange={(e) => setAudioPreviewEnabled(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                
                <div className="quick-setting-divider"></div>
                
                <button 
                  className="quick-setting-more-btn"
                  onClick={() => {
                    setIsQuickSettingsOpen(false)
                    onOpenSettings()
                  }}
                >
                  <MoreHorizontal size={14} />
                  <span>更多设置...</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
