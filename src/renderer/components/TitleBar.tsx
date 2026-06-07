import { useState, useEffect } from 'react'
import { Minus, Square, X, Music, Pin, PinOff, PictureInPicture, Copy } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from 'react-i18next'
import './TitleBar.css'

export function TitleBar(): React.JSX.Element {
  const { t } = useTranslation()
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const isMaximized = useAppStore(state => state.isMaximized)
  const isMiniMode = useAppStore(state => state.isMiniMode)
  const setMiniMode = useAppStore(state => state.setMiniMode)
  const isMultiplayerEnabled = useAppStore(state => state.isMultiplayerEnabled)

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
  }

  return (
    <div className="title-bar">
      <div className="title-bar-title">
        <Music size={14} />
        <span>Auto Lyre</span>
      </div>
      <div className="title-bar-controls">
        {!isMultiplayerEnabled && (
          <button 
            className="title-bar-btn" 
            onClick={handleToggleMiniMode} 
            title={isMiniMode ? t('titlebar.exitMiniMode') : t('titlebar.enterMiniMode')}
            style={{ color: isMiniMode ? '#4ade80' : 'var(--text-secondary)' }}
          >
            <PictureInPicture size={14} />
          </button>
        )}
        <button 
          className="title-bar-btn" 
          onClick={handleToggleAlwaysOnTop} 
          title={isAlwaysOnTop ? t('titlebar.unpinWindow') : t('titlebar.pinWindow')}
          style={{ color: isAlwaysOnTop ? '#4ade80' : 'var(--text-secondary)' }}
        >
          {isAlwaysOnTop ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button className="title-bar-btn" onClick={handleMinimize} title={t('titlebar.minimize')}><Minus size={16} /></button>
        <button className="title-bar-btn" onClick={handleMaximize} title={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}>
          {isMaximized ? <Copy size={14} /> : <Square size={14} />}
        </button>
        <button className="title-bar-btn close" onClick={handleClose} title={t('titlebar.close')}><X size={16} /></button>
      </div>
    </div>
  )
}
