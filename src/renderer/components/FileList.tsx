import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, FileMusic, FolderOpen, Edit2, Trash2, Cloud, ChevronRight, ChevronDown, Folder } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import './FileList.css'
import type { MidiFileInfo } from '../store/useAppStore'
import { useAppStore } from '../store/useAppStore'

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
  isCacheDir?: boolean
}

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
  const { t } = useTranslation()
  const globalMiniMode = useAppStore(state => state.isMiniMode)
  const isVisible = isMiniMode === globalMiniMode

  const selectedFiles = useAppStore(state => state.selectedFiles)
  const setSelectedFiles = useAppStore(state => state.setSelectedFiles)
  const clipboard = useAppStore(state => state.clipboard)
  const setClipboard = useAppStore(state => state.setClipboard)
  const setLatestDownloadedMidi = useAppStore(state => state.setLatestDownloadedMidi)

  const [baseDir, setBaseDir] = useState<string>('')
  useEffect(() => {
    window.electronAPI.getMidiBaseDir().then((dir: string) => setBaseDir(dir))
  }, [])

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: TreeNode } | null>(null)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fileItemsRef = useRef<HTMLDivElement>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['cache']))
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)

  const [isListFocused, setIsListFocused] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // 侦测点击是否在文件树内，用来控制失焦的高亮状态变灰
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsListFocused(false)
      } else {
        setIsListFocused(true)
      }
    }
    window.addEventListener('mousedown', handleGlobalClick)
    return () => window.removeEventListener('mousedown', handleGlobalClick)
  }, [])

  const isDraggingRef = useRef(false)
  useEffect(() => {
    const handleGlobalDragOver = () => {
      isDraggingRef.current = true
    }
    const handleGlobalDragEnd = () => {
      isDraggingRef.current = false
    }
    window.addEventListener('dragover', handleGlobalDragOver)
    window.addEventListener('dragend', handleGlobalDragEnd)
    window.addEventListener('drop', handleGlobalDragEnd)
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver)
      window.removeEventListener('dragend', handleGlobalDragEnd)
      window.removeEventListener('drop', handleGlobalDragEnd)
    }
  }, [])

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
      const extIndex = editName.lastIndexOf('.')
      if (extIndex > 0) {
        inputRef.current.setSelectionRange(0, extIndex)
      } else {
        inputRef.current.select()
      }
    }
  }, [editingFile, editName])

  // 构建树状结构
  const treeData = useMemo(() => {
    if (!baseDir || files.length === 0) return []

    // 扁平化搜索结果模式
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const filtered = files.filter(f => f.name.toLowerCase().includes(q))
      return filtered.map(f => ({ name: f.name, path: f.path, type: 'file' } as TreeNode))
    }

    const nodesMap = new Map<string, TreeNode>()
    
    // 根虚拟节点
    const root: TreeNode = { name: 'root', path: baseDir, type: 'directory', children: [] }
    nodesMap.set(baseDir.replace(/\\/g, '/'), root)

    files.forEach(file => {
      const normalizedPath = file.path.replace(/\\/g, '/')
      const normalizedBase = baseDir.replace(/\\/g, '/')
      if (!normalizedPath.startsWith(normalizedBase)) return

      const relativePath = normalizedPath.slice(normalizedBase.length).replace(/^\//, '')
      const parts = relativePath.split('/')
      
      let parentPath = normalizedBase
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const currentPath = parentPath + '/' + part
        const isFile = i === parts.length - 1

        if (!nodesMap.has(currentPath)) {
          const node: TreeNode = {
            name: part,
            path: isFile ? file.path : currentPath, // 使用原始绝对路径更安全
            type: isFile ? 'file' : 'directory',
            children: isFile ? undefined : [],
            isCacheDir: i === 0 && part === 'cache'
          }
          nodesMap.set(currentPath, node)
          const parentNode = nodesMap.get(parentPath)
          if (parentNode && parentNode.children) {
            parentNode.children.push(node)
          }
        }
        parentPath = currentPath
      }
    })

    // 排序逻辑：文件夹在前，文件在后；cache 置顶
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.isCacheDir) return -1
        if (b.isCacheDir) return 1
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      nodes.forEach(n => {
        if (n.children) sortNodes(n.children)
      })
    }
    
    if (root.children) {
      sortNodes(root.children)
    }

    return root.children || []
  }, [files, baseDir, searchQuery])

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const handleNodeClick = (e: React.MouseEvent, node: TreeNode) => {
    if (latestDownloadedMidi && (node.path === latestDownloadedMidi || node.isCacheDir)) {
      setLatestDownloadedMidi(null)
    }
    
    if (e.ctrlKey || e.metaKey) {
      const newSelected = new Set(selectedFiles)
      if (newSelected.has(node.path)) {
        newSelected.delete(node.path)
      } else {
        newSelected.add(node.path)
      }
      setSelectedFiles(newSelected)
    } else {
      setSelectedFiles(new Set([node.path]))
      if (node.type === 'directory') {
        toggleFolder(node.path)
      }
    }
  }

  const handleNodeDoubleClick = (e: React.MouseEvent, node: TreeNode) => {
    if (node.type === 'file' && !editingFile) {
      onSelect(node.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    if (node.isCacheDir) return
    if (!selectedFiles.has(node.path)) {
      setSelectedFiles(new Set([node.path]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const startRename = (node: TreeNode) => {
    setEditingFile(node.path)
    setEditName(node.name)
    setContextMenu(null)
  }

  const submitRename = () => {
    if (editingFile && editName.trim()) {
      // 获取扩展名
      const isDir = !editingFile.toLowerCase().endsWith('.mid') && !editingFile.toLowerCase().endsWith('.midi')
      // 如果不是目录，在 rename 中主进程已经做了补后缀逻辑，但此处传递前先判断是否需要
      onRename(editingFile, editName.trim())
    }
    setEditingFile(null)
  }

  const requestDelete = (node: TreeNode) => {
    const isMulti = selectedFiles.size > 1
    const msg = isMulti 
      ? t('fileList.deleteMultiConfirm', { count: selectedFiles.size }) 
      : t('fileList.deleteConfirm', { name: node.name })
    if (window.confirm(msg)) {
      selectedFiles.forEach(path => {
        onDelete(path)
      })
      setSelectedFiles(new Set())
    }
    setContextMenu(null)
  }
  const dragSourceDirRef = useRef<string | null>(null)

  // Windows 路径归一化：统一转小写、统一用反斜杠，消除大小写和分隔符差异
  const normalizePath = (p: string) => p.replace(/\//g, '\\').toLowerCase()

  // ===== 拖拽处理 =====
  const onDragStart = (e: React.DragEvent, node: TreeNode) => {
    e.stopPropagation()
    if (node.isCacheDir) {
      e.preventDefault()
      return
    }
    let draggingFiles = Array.from(selectedFiles)
    if (!selectedFiles.has(node.path)) {
      draggingFiles = [node.path]
      setSelectedFiles(new Set(draggingFiles))
    }
    
    // 同步记录拖拽源目录（归一化）
    if (draggingFiles.length > 0) {
      const p = draggingFiles[0]
      dragSourceDirRef.current = normalizePath(p.substring(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))))
    }
    
    e.dataTransfer.setData('application/json', JSON.stringify(draggingFiles))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e: React.DragEvent, node: TreeNode) => {
    if (node.type !== 'directory') return
    
    e.stopPropagation()
    
    // 归一化比较：拖回源目录时，无条件清除之前的高亮
    if (dragSourceDirRef.current === normalizePath(node.path)) {
      if (dragOverNode) setDragOverNode(null)
      return
    }
    
    e.preventDefault()
    if (dragOverNode !== node.path) {
      setDragOverNode(node.path)
    }
  }

  const onDragLeave = (_e: React.DragEvent, _node: TreeNode) => {
  }

  const onDrop = async (e: React.DragEvent, targetNode: TreeNode) => {
    if (targetNode.type !== 'directory') return
    e.preventDefault()
    e.stopPropagation()
    setDragOverNode(null)
    
    const targetDir = targetNode.path

    try {
      const data = e.dataTransfer.getData('application/json')
      if (data) {
        const sourcePaths = JSON.parse(data) as string[]
        await window.electronAPI.moveMidiFiles(sourcePaths, targetDir)
        setSelectedFiles(new Set())
      }
    } catch (err) {
      console.error('Drop error:', err)
    }
  }

  // 快捷键
  useEffect(() => {
    const onGlobalKeyDown = async (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return 
      if (selectedFiles.size === 0) return

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        setClipboard({ type: 'copy', files: Array.from(selectedFiles) })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        setClipboard({ type: 'cut', files: Array.from(selectedFiles) })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (!clipboard || clipboard.files.length === 0) return
        
        let targetDir = baseDir
        if (selectedFiles.size === 1) {
          const sPath = Array.from(selectedFiles)[0]
          const isDir = !sPath.toLowerCase().endsWith('.mid') && !sPath.toLowerCase().endsWith('.midi')
          if (isDir) {
            targetDir = sPath
          } else {
            targetDir = sPath.substring(0, Math.max(sPath.lastIndexOf('/'), sPath.lastIndexOf('\\')))
          }
        }
        
        if (clipboard.type === 'copy') {
          await window.electronAPI.copyMidiFiles(clipboard.files, targetDir)
        } else {
          await window.electronAPI.moveMidiFiles(clipboard.files, targetDir)
          setClipboard(null)
        }
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [selectedFiles, clipboard, baseDir, setClipboard])

  useEffect(() => {
    if (isVisible && fileItemsRef.current) {
      const savedRatio = (window as any).__fileListScrollRatio || 0
      setTimeout(() => {
        if (fileItemsRef.current) {
          const el = fileItemsRef.current
          el.scrollTop = savedRatio * (el.scrollHeight - el.clientHeight)
        }
      }, 0)
    }
  }, [isVisible, files.length, expandedFolders])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isVisible) return
    const el = e.currentTarget
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 0) {
      ;(window as any).__fileListScrollRatio = el.scrollTop / maxScroll
    }

    // 动态判断吸顶状态，利用原生 DOM 避免 React 渲染开销
    const containerTop = el.getBoundingClientRect().top
    const dirNodes = el.querySelectorAll('.is-dir')
    dirNodes.forEach(node => {
      const depth = parseInt(node.getAttribute('data-depth') || '0', 10)
      const targetTop = containerTop + depth * 34
      const rect = node.getBoundingClientRect()
      if (rect.top <= targetTop + 1) {
        node.classList.add('stuck')
      } else {
        node.classList.remove('stuck')
      }
    })
  }

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isSelected = selectedFiles.has(node.path)
    const isPlaying = node.path === currentFilePath
    const isEditing = node.path === editingFile
    const isDragOver = dragOverNode === node.path
    const isExpanded = expandedFolders.has(node.path)
    const isCut = clipboard?.type === 'cut' && clipboard.files.includes(node.path)

    let displayName = node.name
    if (node.isCacheDir) {
      displayName = t('fileList.downloads', '下载')
    }

    const indentStep = 12
    const basePadding = 6
    const paddingL = basePadding + depth * indentStep

    return (
      <div 
        key={node.path} 
        className={isDragOver ? 'folder-drop-target' : ''}
        onDragOver={(e) => onDragOver(e, node)}
        onDragLeave={(e) => onDragLeave(e, node)}
        onDrop={(e) => onDrop(e, node)}
      >
        <div 
          className={`file-item ${node.type === 'directory' ? 'is-dir' : ''} ${isSelected ? (isListFocused ? 'selected' : 'selected unfocused') : ''} ${isPlaying ? 'active' : ''} ${isCut ? 'cut-node' : ''}`}
          data-depth={depth}
          style={{ 
            paddingLeft: `${paddingL}px`, 
            position: node.type === 'directory' ? 'sticky' : 'relative',
            top: node.type === 'directory' ? `${depth * 34}px` : undefined,
            zIndex: node.type === 'directory' ? 100 - depth : 1
          }}
          onClick={(e) => handleNodeClick(e, node)}
          onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          draggable={!isEditing}
          onDragStart={(e) => onDragStart(e, node)}
          onDragEnd={() => { setDragOverNode(null); dragSourceDirRef.current = null }}
        >
          {Array.from({ length: depth }).map((_, i) => (
            <div 
              key={i} 
              className="indent-guide" 
              style={{ 
                position: 'absolute', 
                left: `${basePadding + i * indentStep + 7}px`, 
                top: 0, 
                bottom: 0, 
                width: '1px', 
                backgroundColor: 'var(--border-color)' 
              }} 
            />
          ))}
          <div className="node-icon-wrapper" style={{ marginRight: '6px', opacity: isPlaying ? 1 : 0.8, color: isPlaying ? 'var(--text-primary)' : 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {node.type === 'directory' ? (
              <>
                <div style={{ display: 'flex' }}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </>
            ) : (
              <>
                <div style={{ width: '18px' }} /> {/* 为文件预留出同级文件夹箭头的占位，使其对齐图标 */}
                <FileMusic size={14} className={isPlaying ? 'icon-active' : ''} />
              </>
            )}
          </div>

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="file-item-rename-input"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={submitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') setEditingFile(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="file-item-name" title={displayName}>{displayName}</span>
          )}

          {(
            (node.type === 'file' && node.path === latestDownloadedMidi) ||
            (node.isCacheDir && latestDownloadedMidi)
          ) ? (
            <span className="file-badge-new">{t('fileList.newBadge')}</span>
          ) : null}
        </div>

        {node.type === 'directory' && isExpanded && node.children && (
          <div className="node-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`file-list ${isMiniMode ? 'mini-mode' : ''}`} ref={containerRef}>
      <div className="file-list-header">
        <h3>{t('fileList.title')}</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isMiniMode && (
            <button 
              className={`btn-add ${isCloudOpen ? 'active-cloud-btn' : ''}`}
              onClick={onToggleCloud} 
              title={isCloudOpen ? t('fileList.closeCloud') : t('fileList.searchCloud')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg style={{ width: '14px', height: '14px', fill: 'currentColor' }} viewBox="0 0 1024 1024">
                <path d="M808.192 246.528a320.16 320.16 0 0 0-592.352 0A238.592 238.592 0 0 0 32 479.936c0 132.352 107.648 240 240 240h91.488a32 32 0 1 0 0-64H272a176.192 176.192 0 0 1-176-176 175.04 175.04 0 0 1 148.48-173.888l19.04-2.976 6.24-18.24C305.248 181.408 402.592 111.936 512 111.936a256 256 0 0 1 242.208 172.896l6.272 18.24 19.04 2.976A175.04 175.04 0 0 1 928 479.936c0 97.024-78.976 176-176 176h-97.28a32 32 0 1 0 0 64h97.28c132.352 0 240-107.648 240-240a238.592 238.592 0 0 0-183.808-233.408zM649.792 789.888L544 876.48V447.936a32 32 0 0 0-64 0V876.48l-106.752-87.424a31.968 31.968 0 1 0-40.544 49.504l159.04 130.24a32 32 0 0 0 40.576 0l158.048-129.44a32 32 0 1 0-40.576-49.472z"></path>
              </svg>
            </button>
          )}
          <button className="btn-add" onClick={onOpenDir} title={t('fileList.openFolder')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      <div className="search-box" style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-dim)' }} />
          <input 
            type="text" 
            placeholder={t('fileList.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>
      </div>

      <div 
        className={`file-items ${dragOverNode === baseDir ? 'folder-drop-target' : ''}`}
        style={{ overflowY: contextMenu ? 'hidden' : 'auto', position: 'relative' }}
        ref={fileItemsRef}
        onScroll={handleScroll}
        onDragOver={(e) => {
          if (!baseDir) return
          if (dragSourceDirRef.current === normalizePath(baseDir)) {
            if (dragOverNode) setDragOverNode(null)
            return
          }
          e.preventDefault()
          if (dragOverNode !== baseDir) setDragOverNode(baseDir)
        }}
        onDragLeave={(e) => {
          const related = e.relatedTarget as Node | null
          if (!related || !e.currentTarget.contains(related)) {
            setDragOverNode(null)
          }
        }}
        onDrop={(e) => {
          if (!baseDir) return
          onDrop(e, { name: 'root', path: baseDir, type: 'directory' })
        }}
        onWheel={(e) => {
          if (isDraggingRef.current) {
            e.currentTarget.scrollTop += e.deltaY
          }
        }}
      >
        {treeData.map(node => renderNode(node))}
        
        {treeData.length === 0 && (
          <div className="empty-state">
            <FileMusic size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
            <div>{t('fileList.emptyState')}</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.5 }}>{searchQuery ? '未找到符合的歌曲' : t('fileList.emptyStateHint')}</div>
          </div>
        )}
      </div>

      {contextMenu && createPortal(
        <div 
          className="context-menu" 
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedFiles.size === 1 && (
            <div className="context-menu-item" onClick={() => startRename(contextMenu.node)}>
              <Edit2 size={14} /> {t('fileList.rename')}
            </div>
          )}
          <div className="context-menu-item danger" onClick={() => requestDelete(contextMenu.node)}>
            <Trash2 size={14} /> {selectedFiles.size > 1 ? `删除 ${selectedFiles.size} 项` : t('fileList.delete')}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
