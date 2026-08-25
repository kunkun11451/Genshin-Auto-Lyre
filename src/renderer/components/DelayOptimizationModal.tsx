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
            <h2>{t('delayOpt.title') || '多人延迟优化设置'}</h2>
          </div>
          <button className="btn-close" onClick={onClose} title={t('settings.close') || '关闭'}>
            <X size={20} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="delay-opt-content">
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
                  {t('delayOpt.autoModeTitle') || '根据与游戏服务器延迟优化同步 (自动探测)'}
                </div>
              </div>
              <Wifi size={16} color="var(--text-secondary)" />
            </div>
            <div className="delay-mode-desc">
              {t('delayOpt.autoModeDesc') || '各玩家自动测量与米哈游游戏服务器的网络延迟 (Ping)，房主发起合奏时自动计算前馈提前量，使所有声音数据包同一微秒抵达游戏服务器。'}
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
                  {t('delayOpt.manualModeTitle') || '手动调整声音延迟 (耳听对音校准)'}
                </div>
              </div>
              <Volume2 size={16} color="var(--text-secondary)" />
            </div>
            <div className="delay-mode-desc">
              {t('delayOpt.manualModeDesc') || '房主与各位在线客机一对一触发 1 秒循环同音弹奏，房主在游戏里耳听微调延迟直到两音完全重合，实现极致精密的现场同步效果。'}
            </div>

            {/* 选中后展开内容 */}
            {delaySyncMode === 'manual' && (
              <div className="manual-delay-expanded" onClick={e => e.stopPropagation()}>
                {/* 操作步骤提示 */}
                <div className="manual-steps-box">
                  <div className="manual-steps-title">
                    <Info size={14} />
                    <span>{t('delayOpt.stepsTitle') || '校准操作步骤指引'}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">1.</span>
                    <span>{t('delayOpt.step1') || '点击下方【开始调整延迟】，客机屏幕将提示进入等待，房主右上角弹出小悬浮窗。'}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">2.</span>
                    <span>{t('delayOpt.step2') || '按 <code>Home</code> 键开始/暂停 1s 循环同音弹奏（双方风物之诗琴 A 键）。'}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">3.</span>
                    <span>{t('delayOpt.step3') || '按 <code>+</code> / <code>-</code> 键微调该玩家延迟（±1ms 实时反映）。'}</span>
                  </div>
                  <div className="manual-step-item">
                    <span className="manual-step-num">4.</span>
                    <span>{t('delayOpt.step4') || '听准两音重合后按 <code>Enter</code> 保存并切换下一位；全部完成后按 <code>Ctrl+Enter</code> 退出。'}</span>
                  </div>
                </div>

                {/* 在线客机延迟列表展示 */}
                <div className="manual-players-list">
                  <div className="manual-players-list-title">
                    <Users size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                    <span>{t('delayOpt.playersListTitle') || '当前在线客机延迟配置'}：</span>
                  </div>
                  {players.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                      {t('delayOpt.noClients') || '当前房间暂无客机玩家加入'}
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
              title={players.length === 0 ? (t('delayOpt.noClientsToCalibrate') || '需要至少一位客机玩家才能开始调试') : ''}
            >
              <Play size={14} />
              <span>{t('delayOpt.startCalibBtn') || '开始调整延迟'}</span>
            </button>
          ) : (
            <button className="mp-btn" onClick={onClose} style={{ padding: '8px 18px', fontSize: '13px' }}>
              {t('settings.close') || '确定'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
