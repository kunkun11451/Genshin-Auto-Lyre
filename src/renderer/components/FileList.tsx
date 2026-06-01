import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, FileMusic, FolderOpen, MoreVertical, Edit2, Trash2 } from 'lucide-react'
import './FileList.css'
import type { MidiFileInfo } from '../store/useAppStore'

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
  onCloudSearch: (query: string) => void
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
  onCloudSearch,
  isMiniMode = false
}: FileListProps): React.JSX.Element {
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

  return (
    <div className={`file-list ${isMiniMode ? 'mini-mode' : ''}`}>
      <div className="file-list-header">
        <h3>MIDI曲库</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-add" onClick={onOpenDir} title="在资源管理器中打开 MIDI 文件夹">
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      <div className="search-box" style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-dim)' }} />
          <input 
            type="text" 
            placeholder="搜索..." 
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{ paddingLeft: '32px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim() && !isMiniMode) {
                onCloudSearch(searchQuery.trim())
              }
            }}
          />
        </div>
        {!isMiniMode && (
          <button 
            className="btn-add" 
            onClick={() => onCloudSearch(searchQuery.trim())}
            title="去 MidiShow 在线搜索并下载"
            style={{ padding: '0 12px', whiteSpace: 'nowrap' }}
          >
            在线搜索
          </button>
        )}
      </div>

      <div className="file-items" style={{ overflowY: contextMenu ? 'hidden' : 'auto' }}>
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
