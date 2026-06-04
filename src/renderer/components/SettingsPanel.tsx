import { useState, useEffect } from 'react'
import { X, Settings, Piano, Sliders, Info, Volume2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
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
        setUpdateErrorMsg('当前已是最新版本')
      }
    } catch (err: any) {
      setUpdateStatus('error')
      setUpdateErrorMsg(err.message || '检查更新失败')
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
    if (!shortcut) return '已禁用'
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
            <h2>设置</h2>
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
              <h3>基础设置</h3>
            </div>
            <div className="setting-item" style={isMultiplayerEnabled ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}>
              <label>选择乐器</label>
              <select
                value={audioPreviewInstrument}
                onChange={(e) => onAudioPreviewInstrumentChange(e.target.value)}
                disabled={isMultiplayerEnabled}
                style={{ width: '120px' }}
              >
                <option value="Lyre">风物之诗琴</option>
                <option value="Zither">镜花之琴</option>
                <option value="Vintage-Lyre">老旧的诗琴</option>
                <option value="Horn">晚风圆号</option>
                <option value="Ukulele">悠可琴</option>
                <option value="LingeringEuphonia">「余音」</option>
                <option value="LeapingSpiritPiano">跃律琴</option>
                <option value="HarmonicKey">谐律键琴</option>
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
          </div>

          {/* 音频预览 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Volume2 size={16} color="var(--text-dim)" />
              <h3>音频预览与调试</h3>
            </div>
            <div className="setting-item" style={isMultiplayerEnabled ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}>
              <label>开启按键试听 {isMultiplayerEnabled && '(多人演奏中已强制禁用)'}</label>
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
              <h3>多人联机合奏</h3>
            </div>
            <div className="setting-item">
              <label>开启多人演奏模式</label>
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
              <h3>热键设置</h3>
            </div>
            <div className="setting-item">
              <label>暂停 / 播放</label>
              <button 
                className={`shortcut-record-btn ${recordingType === 'playback' ? 'recording' : ''}`}
                onClick={() => setRecordingType('playback')}
                title="点击后按下快捷键"
              >
                {recordingType === 'playback' ? '请按下按键...' : formatDisplayShortcut(playbackShortcut)}
              </button>
            </div>
            <div className="setting-item">
              <label>停止</label>
              <button 
                className={`shortcut-record-btn ${recordingType === 'stop' ? 'recording' : ''}`}
                onClick={() => setRecordingType('stop')}
                title="点击后按下快捷键"
              >
                {recordingType === 'stop' ? '请按下按键...' : formatDisplayShortcut(stopShortcut)}
              </button>
            </div>
            <div className="setting-item">
              <label>演奏加速</label>
              <button 
                className={`shortcut-record-btn ${recordingType === 'speedUp' ? 'recording' : ''}`}
                onClick={() => setRecordingType('speedUp')}
                title="点击后按下快捷键"
              >
                {recordingType === 'speedUp' ? '请按下按键...' : formatDisplayShortcut(speedUpShortcut)}
              </button>
            </div>
            <div className="setting-item">
              <label>演奏减速</label>
              <button 
                className={`shortcut-record-btn ${recordingType === 'speedDown' ? 'recording' : ''}`}
                onClick={() => setRecordingType('speedDown')}
                title="点击后按下快捷键"
              >
                {recordingType === 'speedDown' ? '请按下按键...' : formatDisplayShortcut(speedDownShortcut)}
              </button>
            </div>
          </div>
          
          {/* 关于与更新 */}
          <div className="settings-group" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Info size={16} color="var(--text-dim)" />
              <h3>关于</h3>
            </div>
            <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <label>当前版本</label>
                <span style={{ color: 'var(--text-dim)' }}>v{appVersion || '...'}</span>
              </div>
              
              <div style={{ display: 'flex', width: '100%', gap: '8px', marginTop: '4px', flexDirection: 'column' }}>
                {updateStatus === 'idle' || updateStatus === 'error' ? (
                  <>
                    <button 
                      onClick={handleCheckUpdate}
                      style={{ padding: '6px 12px', background: 'var(--bg-highlight)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                    >
                      检查更新
                    </button>
                    {updateStatus === 'error' && updateErrorMsg && (
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>{updateErrorMsg}</span>
                    )}
                  </>
                ) : updateStatus === 'checking' ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center', padding: '6px 0' }}>正在检查更新...</span>
                ) : updateStatus === 'available' ? (
                  <div style={{ background: 'var(--bg-highlight)', padding: '12px', borderRadius: '6px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>发现新版本: v{updateInfo?.version}</div>
                    <div className="update-release-notes" style={{ fontSize: '12px', color: 'var(--text-secondary)', maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {parseMarkdown(updateInfo?.releaseNotes)}
                    </div>
                    <button 
                      onClick={handleStartUpdate}
                      style={{ padding: '6px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '4px', cursor: 'pointer', marginTop: '4px', fontSize: '13px' }}
                    >
                      立即下载更新
                    </button>
                  </div>
                ) : updateStatus === 'downloading' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '6px', background: 'var(--bg-highlight)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)' }}>
                      <span>正在下载更新...</span>
                      <span>{updateProgress}%</span>
                    </div>
                    <div style={{ width: '100%', height: '4px', background: 'var(--glass-border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${updateProgress}%`, height: '100%', background: 'var(--text-primary)', transition: 'width 0.2s' }}></div>
                    </div>
                  </div>
                ) : updateStatus === 'ready' ? (
                  <div style={{ background: 'var(--bg-highlight)', padding: '16px', borderRadius: '8px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px' }}>🎉</span> 更新已准备就绪！
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: '1.6' }}>
                      新版本已成功下载。<br />
                      您可以选择立即重启以应用新版本，<br />
                      或者在您关闭软件后，它也会在后台自动完成升级替换。
                    </div>
                    <div style={{ display: 'flex', width: '100%', gap: '8px', marginTop: '6px' }}>
                      <button 
                        onClick={handleApplyUpdateNow}
                        style={{ flex: 1, padding: '8px 12px', background: 'var(--text-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        立即重启更新
                      </button>
                      <button 
                        onClick={handleApplyUpdateLater}
                        style={{ flex: 1, padding: '8px 12px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--glass-border)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        稍后 (退出时更新)
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
