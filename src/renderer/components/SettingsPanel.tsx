import { useState, useEffect } from 'react'
import { X, Settings, Piano, Sliders } from 'lucide-react'
import type { BlackKeyConfig, BlackKeyStrategy } from '../core/note-mapper'
import './SettingsPanel.css'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  instrumentMode: 'standard' | 'chord'
  onInstrumentModeChange: (mode: 'standard' | 'chord') => void
  blackKeyConfig: BlackKeyConfig
  onBlackKeyConfigChange: (config: BlackKeyConfig) => void
  transpose: number
  onTransposeChange: (val: number) => void
  startDelaySec: number
  onStartDelaySecChange: (val: number) => void
  audioPreviewEnabled: boolean
  onAudioPreviewEnabledChange: (val: boolean) => void
  theme: 'system' | 'light' | 'dark'
  onThemeChange: (val: 'system' | 'light' | 'dark') => void
}

export function SettingsPanel({
  isOpen,
  onClose,
  instrumentMode,
  onInstrumentModeChange,
  blackKeyConfig,
  onBlackKeyConfigChange,
  transpose,
  onTransposeChange,
  startDelaySec,
  onStartDelaySecChange,
  audioPreviewEnabled,
  onAudioPreviewEnabledChange,
  theme,
  onThemeChange
}: SettingsPanelProps): React.JSX.Element | null {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setIsClosing(false)
    } else if (shouldRender) {
      setIsClosing(true)
      setTimeout(() => setShouldRender(false), 200)
    }
  }, [isOpen])

  if (!shouldRender) return null

  const handleStrategyChange = (octave: keyof BlackKeyConfig, val: BlackKeyStrategy) => {
    onBlackKeyConfigChange({ ...blackKeyConfig, [octave]: val })
  }

  return (
    <div className={`settings-overlay ${isClosing ? 'closing' : ''}`}>
      <div className="settings-panel">
        <div className="settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} />
            <h2>设置</h2>
          </div>
          <button className="btn-close" onClick={onClose} title="关闭">
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          {/* 乐器模式 */}
          <div className="settings-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Piano size={16} color="var(--text-dim)" />
              <h3>乐器模式</h3>
            </div>
            <div className="setting-item">
              <label>选择乐器</label>
              <select 
                value={instrumentMode} 
                onChange={(e) => onInstrumentModeChange(e.target.value as 'standard' | 'chord')}
              >
                <option value="standard">普通琴</option>
                <option value="chord">和弦琴(低可用性)</option>
              </select>
            </div>
            
            <div className="setting-item" style={{ marginTop: '12px' }}>
              <label>主题外观</label>
              <select 
                value={theme} 
                onChange={(e) => onThemeChange(e.target.value as 'system' | 'light' | 'dark')}
              >
                <option value="system">跟随系统</option>
                <option value="dark">深色模式</option>
                <option value="light">浅色模式</option>
              </select>
            </div>
          </div>

          {/* 黑键策略 */}
          <div className="settings-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Sliders size={16} color="var(--text-dim)" />
              <h3>黑键映射策略</h3>
            </div>
            <div className="setting-item">
              <label>低音八度 (C3~B3)</label>
              <select 
                value={blackKeyConfig.lowOctave} 
                onChange={(e) => handleStrategyChange('lowOctave', e.target.value as BlackKeyStrategy)}
              >
                <option value="skip">不演奏</option>
                <option value="dual">双键演奏</option>
                <option value="floor">向下映射</option>
                <option value="ceil">向上映射</option>
                <option value="nearest">就近映射</option>
              </select>
            </div>
            <div className="setting-item">
              <label>中音八度 (C4~B4)</label>
              <select 
                value={blackKeyConfig.midOctave} 
                onChange={(e) => handleStrategyChange('midOctave', e.target.value as BlackKeyStrategy)}
              >
                <option value="skip">不演奏</option>
                <option value="dual">双键演奏</option>
                <option value="floor">向下映射</option>
                <option value="ceil">向上映射</option>
                <option value="nearest">就近映射</option>
              </select>
            </div>
            <div className="setting-item">
              <label>高音八度 (C5~B5)</label>
              <select 
                value={blackKeyConfig.highOctave} 
                onChange={(e) => handleStrategyChange('highOctave', e.target.value as BlackKeyStrategy)}
              >
                <option value="skip">不演奏</option>
                <option value="dual">双键演奏</option>
                <option value="floor">向下映射</option>
                <option value="ceil">向上映射</option>
                <option value="nearest">就近映射</option>
              </select>
            </div>
          </div>

          {/* 演奏参数 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Sliders size={16} color="var(--text-dim)" />
              <h3>演奏参数</h3>
            </div>
            <div className="setting-item">
              <label>整体移调 (半音)</label>
              <input 
                type="number" 
                value={transpose} 
                onChange={(e) => onTransposeChange(parseInt(e.target.value) || 0)}
                min="-12" max="12" 
              />
            </div>
            <div className="setting-item">
              <label>启动延迟 (秒)</label>
              <input 
                type="number" 
                value={startDelaySec} 
                onChange={(e) => onStartDelaySecChange(parseInt(e.target.value) || 0)}
                min="0" max="10" 
              />
            </div>
            <div className="setting-item">
              <label>midi试听(打开后将关闭键盘操作)</label>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={audioPreviewEnabled}
                  onChange={(e) => onAudioPreviewEnabledChange(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}
