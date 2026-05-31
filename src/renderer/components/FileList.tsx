import { Search, FileMusic, FolderPlus, FilePlus, Trash2 } from 'lucide-react'
import './FileList.css'
import type { MidiFileInfo } from '../store/useAppStore'

interface FileListProps {
  files: MidiFileInfo[]
  currentIndex: number
  searchQuery: string
  onSelect: (index: number) => void
  onAddFiles: () => void
  onAddFolder: () => void
  onSearch: (query: string) => void
}

export function FileList({
  files,
  currentIndex,
  searchQuery,
  onSelect,
  onAddFiles,
  onAddFolder,
  onSearch
}: FileListProps): React.JSX.Element {
  
  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="file-list">
      <div className="file-list-header">
        <h3>曲库</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-add" onClick={onAddFiles} title="添加文件">
            <FilePlus size={14} />
          </button>
          <button className="btn-add" onClick={onAddFolder} title="添加文件夹">
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      <div className="search-box">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-dim)' }} />
          <input 
            type="text" 
            placeholder="搜索 MIDI..." 
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>
      </div>

      <div className="file-items">
        {filteredFiles.map((file) => {
          const originalIndex = files.findIndex(f => f.path === file.path)
          const isActive = originalIndex === currentIndex
          return (
            <div 
              key={file.path} 
              className={`file-item ${isActive ? 'active' : ''}`}
              onDoubleClick={() => onSelect(originalIndex)}
            >
              <FileMusic size={14} style={{ marginRight: '8px', color: isActive ? 'var(--text-primary)' : 'var(--text-dim)' }} />
              <span className="file-item-name" title={file.name}>{file.name}</span>
            </div>
          )
        })}
        {filteredFiles.length === 0 && (
          <div className="empty-state">
            <FileMusic size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
            <div>空空如也</div>
          </div>
        )}
      </div>
    </div>
  )
}
