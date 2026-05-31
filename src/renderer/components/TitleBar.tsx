import { useState } from 'react'
import { Minus, Square, X, Music, Pin, PinOff, PictureInPicture } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import './TitleBar.css'

export function TitleBar(): React.JSX.Element {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const isMiniMode = useAppStore(state => state.isMiniMode)
  const setMiniMode = useAppStore(state => state.setMiniMode)

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = () => window.electronAPI.maximize()
  const handleClose = () => window.electronAPI.close()
  const handleToggleAlwaysOnTop = async () => {
    const result = await window.electronAPI.toggleAlwaysOnTop()
    setIsAlwaysOnTop(result)
  }
  const handleToggleMiniMode = () => {
    const newMode = !isMiniMode
    setMiniMode(newMode)
    window.electronAPI.setMiniMode(newMode)
  }

  return (
    <div className="title-bar">
      <div className="title-bar-title">
        <Music size={14} />
        <span>Auto Lyre</span>
      </div>
      <div className="title-bar-controls">
        <button 
          className="title-bar-btn" 
          onClick={handleToggleMiniMode} 
          title={isMiniMode ? "退出小窗模式" : "开启小窗模式"}
          style={{ color: isMiniMode ? '#4ade80' : 'var(--text-secondary)' }}
        >
          <PictureInPicture size={14} />
        </button>
        <button 
          className="title-bar-btn" 
          onClick={handleToggleAlwaysOnTop} 
          title={isAlwaysOnTop ? "取消置顶" : "置顶窗口"}
          style={{ color: isAlwaysOnTop ? '#4ade80' : 'var(--text-secondary)' }}
        >
          {isAlwaysOnTop ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button className="title-bar-btn" onClick={handleMinimize}><Minus size={16} /></button>
        <button className="title-bar-btn" onClick={handleMaximize}><Square size={12} /></button>
        <button className="title-bar-btn close" onClick={handleClose}><X size={16} /></button>
      </div>
    </div>
  )
}
