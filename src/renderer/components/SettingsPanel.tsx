import { useState } from 'react'
import { X, Settings, Piano, Sliders } from 'lucide-react'
import type { BlackKeyConfig, BlackKeyStrategy } from '../core/note-mapper'
import './SettingsPanel.css'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  blackKeyConfig: BlackKeyConfig
  onBlackKeyConfigChange: (config: BlackKeyConfig) => void
  transpose: number
  onTransposeChange: (val: number) => void
  startDelaySec: number
  onStartDelaySecChange: (val: number) => void
  audioPreviewEnabled: boolean
  onAudioPreviewEnabledChange: (val: boolean) => void
  bgOpacity: number
  onBgOpacityChange: (val: number) => void
}

export function SettingsPanel({
  isOpen,
  onClose,
  blackKeyConfig,
  onBlackKeyConfigChange,
  transpose,
  onTransposeChange,
  startDelaySec,
  onStartDelaySecChange,
  audioPreviewEnabled,
  onAudioPreviewEnabledChange,
  bgOpacity,
  onBgOpacityChange
}: SettingsPanelProps): React.JSX.Element | null {
  
  if (!isOpen) return null

  const handleStrategyChange = (octave: keyof BlackKeyConfig, val: BlackKeyStrategy) => {
    onBlackKeyConfigChange({ ...blackKeyConfig, [octave]: val })
  }

  return (
    <div className="settings-overlay">
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
          {/* 黑键策略 */}
          <div className="settings-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Piano size={16} color="var(--text-dim)" />
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
                <option value="floor">向下映射 (左侧白键)</option>
                <option value="ceil">向上映射 (右侧白键)</option>
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
              <label>软件音频预览</label>
              <input 
                type="checkbox" 
                checked={audioPreviewEnabled}
                onChange={(e) => onAudioPreviewEnabledChange(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--text-primary)' }}
              />
            </div>
            <div className="setting-item">
              <label>界面背景透明度</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{Math.round(bgOpacity * 100)}%</span>
                <input 
                  type="range" 
                  min="0.0" max="1.0" step="0.05"
                  value={bgOpacity} 
                  onChange={(e) => onBgOpacityChange(parseFloat(e.target.value))}
                  style={{ width: '100px', accentColor: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}
