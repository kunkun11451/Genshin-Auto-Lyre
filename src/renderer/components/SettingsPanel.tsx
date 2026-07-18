import { useState, useEffect } from 'react'
import { X, Settings, Piano, Sliders, Info, Volume2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from 'react-i18next'

import type { BlackKeyConfig, BlackKeyStrategy } from '../core/note-mapper'
import './SettingsPanel.css'

// 辅助解析行内粗体 **text**
const parseInlineBold = (text: string): React.ReactNode[] => {
  const parts = text.split(/\*\*([^*]+)\*\*/g)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} style={{ fontWeight: 'bold' }}>{part}</strong>
    }
    return part
  })
}

// 轻量 Markdown 解析器
const parseMarkdown = (text: string) => {
  if (!text) return null
  const lines = text.split('\n')
  return lines.map((line, index) => {
    // 1. 处理标题 (### 或 ## 或 #)
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const titleText = headerMatch[2]
      return (
        <div key={index} style={{
          fontWeight: 'bold',
          fontSize: level === 3 ? '13px' : '14px',
          color: 'var(--text-primary)',
          marginTop: '6px',
          marginBottom: '2px'
        }}>
          {parseInlineBold(titleText)}
        </div>
      )
    }

    // 2. 处理无序列表 (- 或者是 * 开头)
    const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/)
    if (listMatch) {
      const listText = listMatch[2]
      return (
        <div key={index} style={{
          display: 'flex',
          paddingLeft: '8px',
          lineHeight: '1.6',
          alignItems: 'flex-start'
        }}>
          <span style={{ marginRight: '6px', color: 'var(--text-secondary)' }}>•</span>
          <span style={{ flex: 1 }}>{parseInlineBold(listText)}</span>
        </div>
      )
    }

    // 3. 处理普通换行文本
    return (
      <div key={index} style={{ minHeight: '1.4em', lineHeight: '1.5' }}>
        {parseInlineBold(line)}
      </div>
    )
  })
}

export function SettingsPanel(): React.JSX.Element | null {
  const { t } = useTranslation()
  const isOpen = useAppStore(state => state.isSettingsOpen)
  const setIsSettingsOpen = useAppStore(state => state.setIsSettingsOpen)
  const onClose = () => setIsSettingsOpen(false)

  const blackKeyConfig = useAppStore(state => state.blackKeyConfig)
  const onBlackKeyConfigChange = useAppStore(state => state.setBlackKeyConfig)
  const transpose = useAppStore(state => state.transpose)
  const onTransposeChange = useAppStore(state => state.setTranspose)
  const startDelaySec = useAppStore(state => state.startDelaySec)
  const onStartDelaySecChange = useAppStore(state => state.setStartDelaySec)
  const audioPreviewEnabled = useAppStore(state => state.audioPreviewEnabled)
  const onAudioPreviewEnabledChange = useAppStore(state => state.setAudioPreviewEnabled)
  const audioPreviewInstrument = useAppStore(state => state.audioPreviewInstrument)
  const onAudioPreviewInstrumentChange = useAppStore(state => state.setAudioPreviewInstrument)
  const isMultiplayerEnabled = useAppStore(state => state.isMultiplayerEnabled)
  const onMultiplayerEnabledChange = useAppStore(state => state.setIsMultiplayerEnabled)
  const theme = useAppStore(state => state.theme)
  const onThemeChange = useAppStore(state => state.setTheme)
  const playbackShortcut = useAppStore(state => state.playbackShortcut)
  const onPlaybackShortcutChange = useAppStore(state => state.setPlaybackShortcut)
  const stopShortcut = useAppStore(state => state.stopShortcut)
  const onStopShortcutChange = useAppStore(state => state.setStopShortcut)
  const speedUpShortcut = useAppStore(state => state.speedUpShortcut)
  const onSpeedUpShortcutChange = useAppStore(state => state.setSpeedUpShortcut)
  const speedDownShortcut = useAppStore(state => state.speedDownShortcut)
  const onSpeedDownShortcutChange = useAppStore(state => state.setSpeedDownShortcut)

  const language = useAppStore(state => state.language)
  const onLanguageChange = useAppStore(state => state.setLanguage)

  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const [recordingType, setRecordingType] = useState<'playback' | 'stop' | 'speedUp' | 'speedDown' | null>(null)

  const appVersion = useAppStore(state => state.appVersion)
  const updateStatus = useAppStore(state => state.updateStatus)
  const updateInfo = useAppStore(state => state.updateInfo)
  const updateProgress = useAppStore(state => state.updateProgress)
  const updateErrorMsg = useAppStore(state => state.updateErrorMsg)

  const setUpdateStatus = useAppStore(state => state.setUpdateStatus)
  const setUpdateInfo = useAppStore(state => state.setUpdateInfo)
  const setUpdateErrorMsg = useAppStore(state => state.setUpdateErrorMsg)

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking')
    setUpdateErrorMsg('')
    try {
      const info = await window.electronAPI.checkUpdate()
      if (info) {
        setUpdateInfo(info)
        setUpdateStatus('available')
      } else {
        setUpdateStatus('error')
        setUpdateErrorMsg(t('settings.upToDate'))
      }
    } catch (err: any) {
      setUpdateStatus('error')
      setUpdateErrorMsg(err.message || t('settings.checkFailed'))
    }
  }

  const handleStartUpdate = () => {
    if (!updateInfo) return
    setUpdateStatus('downloading')
    window.electronAPI.startUpdate(updateInfo.downloadUrl, updateInfo.assetName)
  }

  const handleApplyUpdateNow = () => {
    window.electronAPI.applyUpdate(true)
  }

  const handleApplyUpdateLater = () => {
    // 标记为稍后更新，实际上主进程已经在 will-quit 钩子中准备好了
    window.electronAPI.applyUpdate(false)
    setUpdateStatus('idle')
    setUpdateInfo(null)
  }

  // 快捷键录制事件监听
  useEffect(() => {
    if (!recordingType) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const key = e.key
      // 如果按下 Esc，清空该快捷键，表示不使用任何快捷键
      if (key === 'Escape') {
        if (recordingType === 'playback') onPlaybackShortcutChange('')
        if (recordingType === 'stop') onStopShortcutChange('')
        if (recordingType === 'speedUp') onSpeedUpShortcutChange('')
        if (recordingType === 'speedDown') onSpeedDownShortcutChange('')
        setRecordingType(null)
        return
      }

      // 忽略演奏时涉及到的 21 个字母键，直接不响应，不给提示；以及忽略单独按下的修饰键
      const gameKeys = new Set(['q', 'w', 'e', 'r', 't', 'y', 'u', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'z', 'x', 'c', 'v', 'b', 'n', 'm'])
      const isModifierActive = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey
      const singleBlockedKeys = new Set(['+', '-', '=', '/'])

      if (
        gameKeys.has(key.toLowerCase()) ||
        ['Control', 'Shift', 'Alt', 'Meta'].includes(key) ||
        (!isModifierActive && singleBlockedKeys.has(key))
      ) {
        return
      }

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Cmd')

      let mainKey = key
      if (key === ' ') {
        mainKey = 'Space'
      } else if (key === '+' || key === '=') {
        mainKey = '+'
      } else if (key === '-') {
        mainKey = '-'
      } else if (key.length === 1) {
        mainKey = key.toUpperCase()
      } else {
        const keyMap: Record<string, string> = {
          'ArrowUp': 'Up',
          'ArrowDown': 'Down',
          'ArrowLeft': 'Left',
          'ArrowRight': 'Right',
          'Escape': 'Escape',
          'Enter': 'Enter',
          'Tab': 'Tab',
          'Backspace': 'Backspace',
          'Delete': 'Delete',
          'Insert': 'Insert',
          'Home': 'Home',
          'End': 'End',
          'PageUp': 'PageUp',
          'PageDown': 'PageDown',
          'Pause': 'Pause'
        }
        mainKey = keyMap[key] || key
      }

      parts.push(mainKey)
      const accelerator = parts.join('+')

      if (recordingType === 'playback') onPlaybackShortcutChange(accelerator)
      if (recordingType === 'stop') onStopShortcutChange(accelerator)
      if (recordingType === 'speedUp') onSpeedUpShortcutChange(accelerator)
      if (recordingType === 'speedDown') onSpeedDownShortcutChange(accelerator)
      setRecordingType(null)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recordingType, onPlaybackShortcutChange, onStopShortcutChange, onSpeedUpShortcutChange, onSpeedDownShortcutChange])

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

  const formatDisplayShortcut = (shortcut: string) => {
    if (!shortcut) return t('settings.shortcutDisabled')
    return shortcut
      .split('+')
      .map(part => {
        const lower = part.toLowerCase()
        if (lower === 'plus') return '+'
        if (lower === 'minus') return '-'
        return part
      })
      .join('+')
  }

  const handleStrategyChange = (octave: keyof BlackKeyConfig, val: BlackKeyStrategy) => {
    onBlackKeyConfigChange({ ...blackKeyConfig, [octave]: val })
  }

  return (
    <div className={`settings-overlay ${isClosing ? 'closing' : ''}`}>
      <div className="settings-panel">
        <div className="settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} />
            <h2>{t('settings.title')}</h2>
          </div>
          <button className="btn-close" onClick={onClose} title="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="settings-content">
          {/* 基础设置 */}
          <div className="settings-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Piano size={16} color="var(--text-dim)" />
              <h3>{t('settings.basicSettings')}</h3>
            </div>
            <div className="setting-item" style={isMultiplayerEnabled ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}>
              <label>{t('settings.selectInstrument')}</label>
              <select
                value={audioPreviewInstrument}
                onChange={(e) => onAudioPreviewInstrumentChange(e.target.value)}
                disabled={isMultiplayerEnabled}
                style={{ width: '120px' }}
              >
                <option value="Lyre">{t('instruments.Lyre')}</option>
                <option value="Zither">{t('instruments.Zither')}</option>
                <option value="Vintage-Lyre">{t('instruments.Vintage-Lyre')}</option>
                <option value="Horn">{t('instruments.Horn')}</option>
                <option value="Ukulele">{t('instruments.Ukulele')}</option>
                <option value="LingeringEuphonia">{t('instruments.LingeringEuphonia')}</option>
                <option value="LeapingSpiritPiano">{t('instruments.LeapingSpiritPiano')}</option>
                <option value="HarmonicKey">{t('instruments.HarmonicKey')}</option>
              </select>
            </div>
            <div className="setting-item" style={{ marginTop: '12px' }}>
              <label>{t('settings.theme')}</label>
              <select
                value={theme}
                onChange={(e) => onThemeChange(e.target.value as 'system' | 'light' | 'dark')}
              >
                <option value="system">{t('settings.themeSystem')}</option>
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="light">{t('settings.themeLight')}</option>
              </select>
            </div>
            <div className="setting-item" style={{ marginTop: '12px' }}>
              <label>{t('settings.language')}</label>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as any)}
              >
                <option value="zh">简体中文</option>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* 黑键策略 */}
          <div className="settings-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Sliders size={16} color="var(--text-dim)" />
              <h3>{t('settings.blackKeyStrategyTitle')}</h3>
            </div>
            <div className="setting-item">
              <label>{t('settings.lowOctave')}</label>
              <select
                value={blackKeyConfig.lowOctave}
                onChange={(e) => handleStrategyChange('lowOctave', e.target.value as BlackKeyStrategy)}
              >
                <option value="skip">{t('settings.keySkip')}</option>
                <option value="dual">{t('settings.keyDual')}</option>
                <option value="floor">{t('settings.keyFloor')}</option>
                <option value="ceil">{t('settings.keyCeil')}</option>
                <option value="nearest">{t('settings.keyNearest')}</option>
              </select>
            </div>
            <div className="setting-item">
              <label>{t('settings.midOctave')}</label>
              <select
                value={blackKeyConfig.midOctave}
                onChange={(e) => handleStrategyChange('midOctave', e.target.value as BlackKeyStrategy)}
              >
                <option value="skip">{t('settings.keySkip')}</option>
                <option value="dual">{t('settings.keyDual')}</option>
                <option value="floor">{t('settings.keyFloor')}</option>
                <option value="ceil">{t('settings.keyCeil')}</option>
                <option value="nearest">{t('settings.keyNearest')}</option>
              </select>
            </div>
            <div className="setting-item">
              <label>{t('settings.highOctave')}</label>
              <select
                value={blackKeyConfig.highOctave}
                onChange={(e) => handleStrategyChange('highOctave', e.target.value as BlackKeyStrategy)}
              >
                <option value="skip">{t('settings.keySkip')}</option>
                <option value="dual">{t('settings.keyDual')}</option>
                <option value="floor">{t('settings.keyFloor')}</option>
                <option value="ceil">{t('settings.keyCeil')}</option>
                <option value="nearest">{t('settings.keyNearest')}</option>
              </select>
            </div>
          </div>

          {/* 演奏参数 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Sliders size={16} color="var(--text-dim)" />
              <h3>{t('settings.playbackParams')}</h3>
            </div>
            <div className="setting-item">
              <label>{t('settings.transpose')}</label>
              <input
                type="number"
                value={transpose}
                onChange={(e) => onTransposeChange(parseInt(e.target.value) || 0)}
                min="-12" max="12"
              />
            </div>
            <div className="setting-item">
              <label>{t('settings.startDelay')}</label>
              <input
                type="number"
                value={startDelaySec}
                onChange={(e) => onStartDelaySecChange(parseInt(e.target.value) || 0)}
                min="0" max="10"
              />
            </div>
          </div>

          {/* 音频预览 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Volume2 size={16} color="var(--text-dim)" />
              <h3>{t('settings.audioPreviewTitle')}</h3>
            </div>
            <div className="setting-item" style={isMultiplayerEnabled ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}>
              <label>{t('settings.enableAudioPreview')} {isMultiplayerEnabled && `(${t('settings.multiplayerDisabled')})`}</label>
              <label className="toggle-switch" style={isMultiplayerEnabled ? { pointerEvents: 'none' } : {}}>
                <input
                  type="checkbox"
                  checked={audioPreviewEnabled}
                  onChange={(e) => onAudioPreviewEnabledChange(e.target.checked)}
                  disabled={isMultiplayerEnabled}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* 联机合奏 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Sliders size={16} color="var(--text-dim)" />
              <h3>{t('settings.multiplayerTitle')}</h3>
            </div>
            <div className="setting-item">
              <label>{t('settings.enableMultiplayer')}</label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isMultiplayerEnabled}
                  onChange={(e) => onMultiplayerEnabledChange(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* 全局热键设置 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Sliders size={16} color="var(--text-dim)" />
              <h3>{t('settings.shortcutTitle')}</h3>
            </div>
            <div className="setting-item">
              <label>{t('settings.playbackToggle')}</label>
              <button
                className={`shortcut-record-btn ${recordingType === 'playback' ? 'recording' : ''}`}
                onClick={() => setRecordingType('playback')}
                title="点击后按下快捷键"
              >
                {recordingType === 'playback' ? t('settings.pressAnyKey') : formatDisplayShortcut(playbackShortcut)}
              </button>
            </div>
            <div className="setting-item">
              <label>{t('settings.playbackStop')}</label>
              <button
                className={`shortcut-record-btn ${recordingType === 'stop' ? 'recording' : ''}`}
                onClick={() => setRecordingType('stop')}
                title="点击后按下快捷键"
              >
                {recordingType === 'stop' ? t('settings.pressAnyKey') : formatDisplayShortcut(stopShortcut)}
              </button>
            </div>
            <div className="setting-item">
              <label>{t('settings.speedUp')}</label>
              <button
                className={`shortcut-record-btn ${recordingType === 'speedUp' ? 'recording' : ''}`}
                onClick={() => setRecordingType('speedUp')}
                title="点击后按下快捷键"
              >
                {recordingType === 'speedUp' ? t('settings.pressAnyKey') : formatDisplayShortcut(speedUpShortcut)}
              </button>
            </div>
            <div className="setting-item">
              <label>{t('settings.speedDown')}</label>
              <button
                className={`shortcut-record-btn ${recordingType === 'speedDown' ? 'recording' : ''}`}
                onClick={() => setRecordingType('speedDown')}
                title="点击后按下快捷键"
              >
                {recordingType === 'speedDown' ? t('settings.pressAnyKey') : formatDisplayShortcut(speedDownShortcut)}
              </button>
            </div>
          </div>

          {/* 关于与更新 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Info size={16} color="var(--text-dim)" />
              <h3>{t('settings.aboutTitle')}</h3>
            </div>
            <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <label>{t('settings.currentVersion')}</label>
                <span style={{ color: 'var(--text-dim)' }}>v{appVersion || '...'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <label>{t('settings.openSourceRepo')}</label>
                <a
                  href="https://github.com/kunkun11451/Genshin-Auto-Lyre"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-dim)', textDecoration: 'none', transition: 'color 0.2s', fontSize: '13px' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                >
                  {t('settings.clickToVisit')}
                </a>
              </div>

              <div style={{ display: 'flex', width: '100%', gap: '8px', marginTop: '4px', flexDirection: 'column' }}>
                {updateStatus === 'idle' || updateStatus === 'error' ? (
                  <>
                    <button
                      onClick={handleCheckUpdate}
                      className="mp-btn"
                      style={{ width: '100%', fontSize: '13px' }}
                    >
                      {t('settings.checkUpdate')}
                    </button>
                    {updateStatus === 'error' && updateErrorMsg && (
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>{updateErrorMsg}</span>
                    )}
                  </>
                ) : updateStatus === 'checking' ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center', padding: '6px 0' }}>{t('settings.checkingUpdate')}</span>
                ) : updateStatus === 'available' ? (
                  <div style={{ background: 'var(--bg-highlight)', padding: '12px', borderRadius: '6px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{t('settings.foundNewVersion')}: v{updateInfo?.version}</div>
                    <div className="update-release-notes" style={{ fontSize: '12px', color: 'var(--text-secondary)', maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {parseMarkdown(updateInfo?.releaseNotes)}
                    </div>
                    <button
                      onClick={handleStartUpdate}
                      className="mp-btn"
                      style={{ marginTop: '4px', fontSize: '13px', width: '100%' }}
                    >
                      {t('settings.downloadUpdateNow')}
                    </button>
                  </div>
                ) : updateStatus === 'downloading' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '6px', background: 'var(--bg-highlight)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)' }}>
                      <span>{t('settings.downloadingUpdate')}</span>
                      <span>{updateProgress}%</span>
                    </div>
                    <div style={{ width: '100%', height: '4px', background: 'var(--glass-border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${updateProgress}%`, height: '100%', background: 'var(--text-primary)', transition: 'width 0.2s' }}></div>
                    </div>
                  </div>
                ) : updateStatus === 'ready' ? (
                  <div style={{ background: 'var(--bg-highlight)', padding: '16px', borderRadius: '8px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px' }}>🎉</span> {t('settings.updateReadyTitle')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: '1.6' }}>
                      {t('settings.updateReadyDesc')}
                    </div>
                    <div style={{ display: 'flex', width: '100%', gap: '8px', marginTop: '6px' }}>
                      <button
                        onClick={handleApplyUpdateNow}
                        className="mp-btn primary"
                        style={{ flex: 1, fontSize: '12px' }}
                      >
                        {t('settings.restartNow')}
                      </button>
                      <button
                        onClick={handleApplyUpdateLater}
                        className="mp-btn"
                        style={{ flex: 1, fontSize: '12px' }}
                      >
                        {t('settings.restartLater')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
