import { Play, Pause, Square, SkipBack, SkipForward, Settings, ChevronUp, ChevronDown } from 'lucide-react'
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
  isMiniMode = false
}: PlaybackControlsProps): React.JSX.Element {
  
  const currentTimeMs = useAppStore(state => state.currentTimeMs)
  const progressPercent = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0

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
          <button className="btn-icon" onClick={onOpenSettings} title="设置" style={isMiniMode ? {} : { marginLeft: '16px' }}>
            <Settings size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
