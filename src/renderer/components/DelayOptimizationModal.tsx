import React, { useState, useEffect } from 'react'
import {
  Sliders,
  X,
  Radio,
  Wifi,
  Volume2,
  CheckCircle2,
  Info,
  Play,
  HelpCircle,
  Users
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/useAppStore'
import type { NetworkPlayer } from '../core/network-manager'
import './SettingsPanel.css'
import './DelayOptimizationModal.css'

interface DelayOptimizationModalProps {
  isOpen: boolean
  onClose: () => void
  players: NetworkPlayer[]
  onStartCalibration: () => void
}

export function DelayOptimizationModal({
  isOpen,
  onClose,
  players,
  onStartCalibration
}: DelayOptimizationModalProps) {
  const { t } = useTranslation()

  const delaySyncMode = useAppStore(state => state.delaySyncMode)
  const setDelaySyncMode = useAppStore(state => state.setDelaySyncMode)
  const manualPlayerDelays = useAppStore(state => state.manualPlayerDelays)

  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)

  // 弹窗进出动画
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setIsClosing(false)
    } else if (shouldRender) {
      setIsClosing(true)
      const timer = setTimeout(() => setShouldRender(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!shouldRender) return null

  const handleSelectMode = (mode: 'auto' | 'manual') => {
    if (delaySyncMode === mode) {
      // 再次点击取消激活
      setDelaySyncMode('off')
    } else {
      setDelaySyncMode(mode)
    }
  }

  return (
    <div className={`settings-overlay ${isClosing ? 'closing' : ''}`}>
      <div className="settings-panel delay-opt-panel">
        {/* 头部 */}
        <div className="settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} />
            <h2>{t('delayOpt.title')}</h2>
          </div>
          <button className="btn-close" onClick={onClose} title={t('settings.close')}>
            <X size={20} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="delay-opt-content">
          {/* 顶部多人合奏模式提示 */}
          <div className="delay-opt-top-notice">
            <Info size={16} className="delay-opt-notice-icon" />
            <div className="delay-opt-notice-text">
              {t('delayOpt.topNotice')}
            </div>
          </div>

          {/* 选项 1：自动 Ping 探测与补偿 */}
          <div
            className={`delay-mode-card ${delaySyncMode === 'auto' ? 'active' : ''}`}
            onClick={() => handleSelectMode('auto')}
          >
            <div className="delay-mode-header">
              <div className="delay-mode-title-wrap">
                <div className="delay-radio-circle">
                  {delaySyncMode === 'auto' && <div className="delay-radio-dot" />}
                </div>
                <div className="delay-mode-title">
                  {t('delayOpt.autoModeTitle')}
                </div>
              </div>
              <Wifi size={16} color="var(--text-secondary)" />
            </div>
            <div className="delay-mode-desc">
              {t('delayOpt.autoModeDesc')}
            </div>
          </div>

          {/* 选项 2：手动校准声音延迟 */}
          <div
            className={`delay-mode-card ${delaySyncMode === 'manual' ? 'active' : ''}`}
            onClick={() => handleSelectMode('manual')}
          >
            <div className="delay-mode-header">
              <div className="delay-mode-title-wrap">
                <div className="delay-radio-circle">
                  {delaySyncMode === 'manual' && <div className="delay-radio-dot" />}
                </div>
                <div className="delay-mode-title">
                  {t('delayOpt.manualModeTitle')}
                </div>
              </div>
              <Volume2 size={16} color="var(--text-secondary)" />
            </div>
            <div className="delay-mode-desc">
              {t('delayOpt.manualModeDesc')}
            </div>

            {/* 选中后展开内容 */}
            {delaySyncMode === 'manual' && (
              <div className="manual-delay-expanded" onClick={e => e.stopPropagation()}>
                {/* 操作步骤提示 */}
                <div className="manual-steps-box">
                  <div className="manual-steps-title">
                    <Info size={14} />
                    <span>{t('delayOpt.stepsTitle')}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">1.</span>
                    <span>{t('delayOpt.step1')}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">2.</span>
                    <span>{t('delayOpt.step2')}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">3.</span>
                    <span>{t('delayOpt.step3')}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">4.</span>
                    <span>{t('delayOpt.step4')}</span>
                  </div>
                </div>

                {/* 在线客机延迟列表展示 */}
                <div className="manual-players-list">
                  <div className="manual-players-list-title">
                    <Users size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                    <span>{t('delayOpt.playersListTitle')}：</span>
                  </div>
                  {players.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                      {t('delayOpt.noClients')}
                    </div>
                  ) : (
                    players.map((p, idx) => {
                      const delayVal = manualPlayerDelays[p.id] ?? 0
                      return (
                        <div key={p.id} className="manual-player-row">
                          <div className="manual-player-info">
                            <span className="manual-player-p">P{idx + 2}</span>
                            <span className="manual-player-name">{p.name}</span>
                          </div>
                          <span className="manual-player-delay-val">
                            {delayVal >= 0 ? `+${delayVal}` : delayVal} ms
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="delay-opt-footer">
          {delaySyncMode === 'manual' ? (
            <button
              className="delay-start-calib-btn"
              onClick={() => {
                onStartCalibration()
              }}
              disabled={players.length === 0}
              title={players.length === 0 ? t('delayOpt.noClientsToCalibrate') : ''}
            >
              <Play size={14} />
              <span>{t('delayOpt.startCalibBtn')}</span>
            </button>
          ) : (
            <button className="mp-btn" onClick={onClose} style={{ padding: '8px 18px', fontSize: '13px' }}>
              {t('settings.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
