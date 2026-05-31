import { Play, Pause, Square, SkipBack, SkipForward, Settings2 } from 'lucide-react'
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
  onOpenSettings
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
    <div className="playback-controls">
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
        <button className="btn-icon" onClick={onPrev} title="上一首">
          <SkipBack size={18} />
        </button>
        <button className="btn-icon" onClick={onStop} title="停止">
          <Square size={16} />
        </button>
        <button className="btn-icon play-btn" onClick={onPlayPause} title={isPlaying ? '暂停' : '播放'}>
          {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: '4px' }} />}
        </button>
        <button className="btn-icon" onClick={onNext} title="下一首">
          <SkipForward size={18} />
        </button>

        <div className="speed-control">
          <span>{speed.toFixed(1)}x</span>
          <input 
            type="range" 
            className="speed-slider"
            min="0.5" max="2.0" step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            title="播放速度"
          />
        </div>

        <button className="btn-icon" onClick={onOpenSettings} title="设置" style={{ marginLeft: '16px' }}>
          <Settings2 size={18} />
        </button>
      </div>
    </div>
  )
}
