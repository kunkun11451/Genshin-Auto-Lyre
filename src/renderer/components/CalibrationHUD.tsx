import React, { useState, useEffect, useRef } from 'react'
import { Sliders, X, Square, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/useAppStore'
import { networkManager, NetworkPlayer } from '../core/network-manager'
import './CalibrationHUD.css'

interface CalibrationHUDProps {
  players?: NetworkPlayer[]
  showToast?: (msg: string) => void
  isStandalone?: boolean
}

export function CalibrationHUD({ players = [], showToast, isStandalone = false }: CalibrationHUDProps) {
  const { t } = useTranslation()

  const isCalibrating = useAppStore(state => state.isCalibrating)
  const setIsCalibrating = useAppStore(state => state.setIsCalibrating)
  const currentCalibrateIndex = useAppStore(state => state.currentCalibrateIndex)
  const setCurrentCalibrateIndex = useAppStore(state => state.setCurrentCalibrateIndex)
  const isLoopPulsePlaying = useAppStore(state => state.isLoopPulsePlaying)
  const setIsLoopPulsePlaying = useAppStore(state => state.setIsLoopPulsePlaying)
  const manualPlayerDelays = useAppStore(state => state.manualPlayerDelays)
  const setManualPlayerDelay = useAppStore(state => state.setManualPlayerDelay)

  // 独立窗口状态
  const [standaloneData, setStandaloneData] = useState<{
    targetName: string
    pSlot: string
    currentDelay: number
    isPlaying: boolean
    theme?: 'system' | 'light' | 'dark'
  } | null>(null)

  const activePlayers = players.filter(p => !!p)
  const targetPlayer = activePlayers[currentCalibrateIndex] || activePlayers[0]

  const currentDelay = targetPlayer ? (manualPlayerDelays[targetPlayer.id] ?? 0) : 0
  const currentDelayRef = useRef(currentDelay)
  currentDelayRef.current = currentDelay

  const storeTheme = useAppStore(state => state.theme)

  // 独立小窗口：动态适配浅色 / 深色主题
  useEffect(() => {
    const currentTheme = standaloneData?.theme || storeTheme || 'system'
    const isLight = 
      currentTheme === 'light' || 
      (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)

    if (isLight) {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }, [storeTheme, standaloneData?.theme])

  // 独立小窗口：监听主窗口同步过来的数据，并在挂载时主动请求一次最新数据
  useEffect(() => {
    if (!isStandalone) return
    const unbind = window.electronAPI.onCalibrationData((data) => {
      if (data) setStandaloneData(data)
    })
    window.electronAPI.requestCalibrationData()
    return () => unbind()
  }, [isStandalone])

  // 主窗口：数据变化时同步给独立置顶悬浮窗
  useEffect(() => {
    if (isStandalone || !isCalibrating || !targetPlayer) return

    window.electronAPI.updateCalibrationWindow({
      targetName: targetPlayer.name,
      pSlot: `P${currentCalibrateIndex + 2}`,
      currentDelay,
      isPlaying: isLoopPulsePlaying,
      theme: storeTheme
    })
  }, [isStandalone, isCalibrating, targetPlayer?.id, targetPlayer?.name, currentCalibrateIndex, currentDelay, isLoopPulsePlaying, storeTheme])

  // 1s 循环同音脉冲触发 (仅在主窗口执行按键与网络广播，参考正式演奏的时间戳精准同步机制)
  useEffect(() => {
    if (isStandalone || !isCalibrating || !isLoopPulsePlaying || !targetPlayer) return

    const triggerPulse = () => {
      // 1. 发送网络脉冲并获取双方未来的统一目标时刻 (预留 500ms 宽裕缓冲)
      const { hostTargetTime } = networkManager.sendCalibrationPulse(targetPlayer.id, currentDelayRef.current, 500)
      
      // 2. 房主与客机基于同一 NTP 同步时钟，精准等待到达该未来时刻再物理按下 A 键
      const delayMs = hostTargetTime - networkManager.getSyncedTime()
      const pressKey = () => {
        window.electronAPI.keyDown('a')
        setTimeout(() => {
          window.electronAPI.keyUp('a')
        }, 60)
      }

      if (delayMs > 0) {
        setTimeout(pressKey, delayMs)
      } else {
        pressKey()
      }
    }

    triggerPulse()
    const timer = setInterval(triggerPulse, 1000)
    return () => clearInterval(timer)
  }, [isStandalone, isCalibrating, isLoopPulsePlaying, targetPlayer?.id])

  // 处理控制动作 (统一处理快捷键与按键)
  const handleAction = (action: string) => {
    if (!targetPlayer) return

    if (action === 'Home') {
      setIsLoopPulsePlaying(!isLoopPulsePlaying)
    } else if (action === 'Plus') {
      setManualPlayerDelay(targetPlayer.id, currentDelayRef.current + 1)
    } else if (action === 'Minus') {
      setManualPlayerDelay(targetPlayer.id, currentDelayRef.current - 1)
    } else if (action === 'Enter') {
      if (currentCalibrateIndex < activePlayers.length - 1) {
        const nextIdx = currentCalibrateIndex + 1
        setCurrentCalibrateIndex(nextIdx)
        setIsLoopPulsePlaying(false)
        if (showToast) {
          showToast(t('delayOpt.savedAndNext', {
            curr: `P${currentCalibrateIndex + 2}`,
            next: `P${nextIdx + 2}`
          }))
        }
      } else {
        networkManager.stopCalibration()
        setIsCalibrating(false)
        setIsLoopPulsePlaying(false)
        window.electronAPI.closeCalibrationWindow()
        if (showToast) {
          showToast(t('delayOpt.calibrationComplete'))
        }
      }
    } else if (action === 'CtrlEnter') {
      networkManager.stopCalibration()
      setIsCalibrating(false)
      setIsLoopPulsePlaying(false)
      window.electronAPI.closeCalibrationWindow()
      if (showToast) {
        showToast(t('delayOpt.calibrationComplete'))
      }
    }
  }

  // 监听操作系统全局快捷键 (在游戏前台也能触发)
  useEffect(() => {
    if (isStandalone) return
    const unbind = window.electronAPI.onCalibrationShortcut((key) => {
      if (isCalibrating) {
        handleAction(key)
      }
    })
    return () => unbind()
  }, [isStandalone, isCalibrating, targetPlayer?.id, currentCalibrateIndex, activePlayers.length, isLoopPulsePlaying])

  // 监听独立窗口被手动点击 X 关闭
  useEffect(() => {
    if (isStandalone) return
    const unbind = window.electronAPI.onCalibrationClosed(() => {
      networkManager.stopCalibration()
      setIsCalibrating(false)
      setIsLoopPulsePlaying(false)
    })
    return () => unbind()
  }, [isStandalone])

  // 窗口内的本地键盘监听 (备选兜底)
  useEffect(() => {
    if (isStandalone || !isCalibrating || !targetPlayer) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
        e.preventDefault()
        e.stopPropagation()
        handleAction('CtrlEnter')
        return
      }
      if (!e.ctrlKey && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
        e.preventDefault()
        e.stopPropagation()
        handleAction('Enter')
        return
      }
      if (e.key === 'Home' || e.code === 'Home') {
        e.preventDefault()
        e.stopPropagation()
        handleAction('Home')
        return
      }
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.code === 'Equal') {
        e.preventDefault()
        e.stopPropagation()
        handleAction('Plus')
        return
      }
      if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
        e.preventDefault()
        e.stopPropagation()
        handleAction('Minus')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isStandalone, isCalibrating, isLoopPulsePlaying, targetPlayer?.id, currentCalibrateIndex, activePlayers.length])

  // 独立悬浮窗视图渲染
  if (isStandalone) {
    const data = standaloneData || {
      targetName: '',
      pSlot: 'P2',
      currentDelay: 0,
      isPlaying: false
    }

    const displayName = data.targetName ? `${data.pSlot} (${data.targetName})` : data.pSlot

    return (
      <div className="calibration-hud-container standalone">
        <div className="calibration-hud-header">
          <div className="calibration-hud-title">
            <Sliders size={14} color="currentColor" />
            <span>{t('delayOpt.hudTitle')}</span>
          </div>
          <button
            className="calibration-hud-close-btn"
            onClick={() => window.electronAPI.closeCalibrationWindow()}
            title={t('settings.close')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="calibration-hud-target">
          <span>{t('delayOpt.adjustingTarget')}：</span>
          <span className="calibration-hud-target-name">{displayName}</span>
        </div>

        <div className="calibration-hud-delay-display">
          <span className="calibration-hud-delay-num">
            {data.currentDelay >= 0 ? `+${data.currentDelay}` : data.currentDelay}
          </span>
          <span className="calibration-hud-delay-unit">ms</span>
        </div>

        <div className={`calibration-hud-pulse-status ${data.isPlaying ? 'playing' : 'paused'}`}>
          {data.isPlaying ? <Volume2 size={12} /> : <Square size={10} />}
          <span>{data.isPlaying ? t('delayOpt.loopPlaying') : t('delayOpt.loopPaused')}</span>
        </div>

        <div className="calibration-hud-shortcuts">
          <div className="calibration-hud-shortcut-row">
            <span>{t('delayOpt.shortcutHome')}</span>
            <kbd className="calibration-hud-kbd">Home</kbd>
          </div>
          <div className="calibration-hud-shortcut-row">
            <span>{t('delayOpt.shortcutTune')}</span>
            <span><kbd className="calibration-hud-kbd">+</kbd> <kbd className="calibration-hud-kbd">-</kbd></span>
          </div>
          <div className="calibration-hud-shortcut-row">
            <span>{t('delayOpt.shortcutNext')}</span>
            <kbd className="calibration-hud-kbd">Enter</kbd>
          </div>
          <div className="calibration-hud-shortcut-row">
            <span>{t('delayOpt.shortcutFinish') || '完成所有设置退出'}</span>
            <kbd className="calibration-hud-kbd">Ctrl+Enter</kbd>
          </div>
        </div>
      </div>
    )
  }

  // 主窗口内无需渲染，由 Electron 独立置顶小窗全权负责在屏幕右上角显示
  return null
}
