import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, FileMusic, FolderOpen, MoreVertical, Edit2, Trash2, Cloud } from 'lucide-react'
import './FileList.css'
import type { MidiFileInfo } from '../store/useAppStore'
import { useAppStore } from '../store/useAppStore'

interface FileListProps {
  files: MidiFileInfo[]
  currentFilePath: string | null
  latestDownloadedMidi?: string | null
  searchQuery: string
  onSelect: (path: string) => void
  onOpenDir: () => void
  onRename: (oldPath: string, newName: string) => void
  onDelete: (filePath: string) => void
  onSearch: (query: string) => void
  onToggleCloud: () => void
  isCloudOpen?: boolean
  isMiniMode?: boolean
}

export function FileList({
  files,
  currentFilePath,
  latestDownloadedMidi = null,
  searchQuery,
  onSelect,
  onOpenDir,
  onRename,
  onDelete,
  onSearch,
  onToggleCloud,
  isCloudOpen = false,
  isMiniMode = false
}: FileListProps): React.JSX.Element {
  const globalMiniMode = useAppStore(state => state.isMiniMode)
  const isVisible = isMiniMode === globalMiniMode

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: MidiFileInfo } | null>(null)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 找出是否有刚刚下载的文件
  const latestDownloadedFile = files.find(f => f.path === latestDownloadedMidi)

  // 过滤出符合搜索条件的文件，同时排除刚刚下载的文件（避免重复）
  const filteredFiles = files.filter(f => 
    f.path !== latestDownloadedMidi && f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 最终显示的列表：如果存在新下载的文件，无视搜索状态直接拼接到最前面
  const displayFiles = latestDownloadedFile 
    ? [latestDownloadedFile, ...filteredFiles]
    : filteredFiles

  // 关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  // 聚焦重命名输入框
  useEffect(() => {
    if (editingFile && inputRef.current) {
      inputRef.current.focus()
      // 选中文件名部分（不包含扩展名）
      const extIndex = editName.lastIndexOf('.')
      if (extIndex > 0) {
        inputRef.current.setSelectionRange(0, extIndex)
      } else {
        inputRef.current.select()
      }
    }
  }, [editingFile])

  const handleContextMenu = (e: React.MouseEvent, file: MidiFileInfo) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  const startRename = (file: MidiFileInfo) => {
    setEditingFile(file.path)
    setEditName(file.name)
    setContextMenu(null)
  }

  const submitRename = () => {
    if (editingFile && editName.trim()) {
      const file = files.find(f => f.path === editingFile)
      if (file && file.name !== editName.trim()) {
        onRename(editingFile, editName.trim())
      }
    }
    setEditingFile(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitRename()
    if (e.key === 'Escape') setEditingFile(null)
  }

  const requestDelete = (file: MidiFileInfo) => {
    if (window.confirm(`确定要删除文件 "${file.name}" 吗？（将移入回收站）`)) {
      onDelete(file.path)
    }
    setContextMenu(null)
  }

  const fileItemsRef = useRef<HTMLDivElement>(null)

  // 恢复和保存滚动位置（使用比例，解决大小窗列表项高度不同导致定位不准的问题）
  useEffect(() => {
    if (isVisible && fileItemsRef.current) {
      const savedRatio = (window as any).__fileListScrollRatio || 0
      // 延迟一帧确保 DOM 渲染完成
      setTimeout(() => {
        if (fileItemsRef.current) {
          const el = fileItemsRef.current
          el.scrollTop = savedRatio * (el.scrollHeight - el.clientHeight)
        }
      }, 0)
    }
  }, [isVisible, displayFiles.length])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isVisible) return
    const el = e.currentTarget
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 0) {
      ;(window as any).__fileListScrollRatio = el.scrollTop / maxScroll
    }
  }

  return (
    <div className={`file-list ${isMiniMode ? 'mini-mode' : ''}`}>
      <div className="file-list-header">
        <h3>MIDI曲库</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isMiniMode && (
            <button 
              className={`btn-add ${isCloudOpen ? 'active-cloud-btn' : ''}`}
              onClick={onToggleCloud} 
              title={isCloudOpen ? "关闭在线曲库" : "在线搜索 MIDI"}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg 
                style={{ width: '14px', height: '14px', fill: 'currentColor' }} 
                viewBox="0 0 1024 1024" 
                version="1.1" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M808.192 246.528a320.16 320.16 0 0 0-592.352 0A238.592 238.592 0 0 0 32 479.936c0 132.352 107.648 240 240 240h91.488a32 32 0 1 0 0-64H272a176.192 176.192 0 0 1-176-176 175.04 175.04 0 0 1 148.48-173.888l19.04-2.976 6.24-18.24C305.248 181.408 402.592 111.936 512 111.936a256 256 0 0 1 242.208 172.896l6.272 18.24 19.04 2.976A175.04 175.04 0 0 1 928 479.936c0 97.024-78.976 176-176 176h-97.28a32 32 0 1 0 0 64h97.28c132.352 0 240-107.648 240-240a238.592 238.592 0 0 0-183.808-233.408zM649.792 789.888L544 876.48V447.936a32 32 0 0 0-64 0V876.48l-106.752-87.424a31.968 31.968 0 1 0-40.544 49.504l159.04 130.24a32 32 0 0 0 40.576 0l158.048-129.44a32 32 0 1 0-40.576-49.472z"></path>
              </svg>
            </button>
          )}
          <button className="btn-add" onClick={onOpenDir} title="在资源管理器中打开 MIDI 文件夹" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      <div className="search-box" style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-dim)' }} />
          <input 
            type="text" 
            placeholder="搜索本地..." 
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>
      </div>

      <div 
        className="file-items" 
        style={{ overflowY: contextMenu ? 'hidden' : 'auto' }}
        ref={fileItemsRef}
        onScroll={handleScroll}
      >
        {displayFiles.map((file) => {
          const isActive = file.path === currentFilePath
          const isEditing = file.path === editingFile
          
          return (
            <div 
              key={file.path} 
              className={`file-item ${isActive ? 'active' : ''}`}
              onDoubleClick={() => !isEditing && onSelect(file.path)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <FileMusic size={14} style={{ marginRight: '8px', color: isActive ? 'var(--text-primary)' : 'var(--text-dim)' }} />
              
              {file.path === latestDownloadedMidi && (
                <span className="file-badge-new">新</span>
              )}

              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  className="file-item-rename-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={handleKeyDown}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="file-item-name" title={file.name}>{file.name}</span>
              )}
            </div>
          )
        })}
        {filteredFiles.length === 0 && (
          <div className="empty-state">
            <FileMusic size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
            <div>空空如也</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.5 }}>请点击上方文件夹按钮放入 MIDI 文件</div>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && createPortal(
        <div 
          className="context-menu" 
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => startRename(contextMenu.file)}>
            <Edit2 size={14} /> 重命名
          </div>
          <div className="context-menu-item danger" onClick={() => requestDelete(contextMenu.file)}>
            <Trash2 size={14} /> 删除
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
