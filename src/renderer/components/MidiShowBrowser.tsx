import { useEffect, useState, useRef } from 'react'
import { X, Search, Clock, FileText, Music, Layers, Download, Check, RefreshCw } from 'lucide-react'
import './MidiShowBrowser.css'
import searchImg from '../../../resources/search.png'

declare global {
  interface Window {
    electronAPI: any
  }
}

interface SearchResultItem {
  id: string
  title: string
  description: string
  url: string
  fileSize: string
  duration: string
  instrumentsCount: string
  tracksCount: string
}

interface PageItem {
  page: number
  active: boolean
}

interface MidiShowBrowserProps {
  url: string
  onClose: () => void
}

export function MidiShowBrowser({ url, onClose }: MidiShowBrowserProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [pages, setPages] = useState<PageItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [lastSearchedQuery, setLastSearchedQuery] = useState('') // 上一次实际成功发起云端搜索的词，防止输入框打字时实时提示报错
  
  // 记录每个歌曲 ID 的下载状态: 'idle' | 'loading' | 'success'
  const [downloadStates, setDownloadStates] = useState<Record<string, 'idle' | 'loading' | 'success'>>({})
  
  const containerRef = useRef<HTMLDivElement>(null)

  // 1. 初始化，提取传入 URL 中的搜索词并初始化下载 Session
  useEffect(() => {
    // 确保后台静默下载拦截 session 已经挂载初始化
    window.electronAPI.setupMidiSession('persist:midishow')

    try {
      const searchParams = new URL(url)
      const q = searchParams.searchParams.get('q') || ''
      setQuery(q)
      if (q) {
        fetchCloudData(q, 1)
      }
    } catch (e) {
      // 如果不是合法的 URL，可能直接是关键字
      setQuery(url)
      if (url) {
        fetchCloudData(url, 1)
      }
    }
  }, [url])

  // 2. 监听后台下载完成，将正在下载的歌曲标记为已载入成功
  useEffect(() => {
    const unsubscribe = window.electronAPI.onMidiDownloaded((filePath: string) => {
      // 提取文件名用于可能的匹配，同时直接将所有 loading 状态置为 success
      setDownloadStates((prev) => {
        const next = { ...prev }
        let updated = false
        Object.keys(next).forEach((id) => {
          if (next[id] === 'loading') {
            next[id] = 'success'
            updated = true
          }
        })
        return updated ? next : prev
      })
    })
    return () => unsubscribe()
  }, [])

  // 3. 执行抓取与 HTML 解析
  const fetchCloudData = async (searchQuery: string, page: number) => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setError(null)
    setCurrentPage(page)
    
    // 回滚容器滚动条
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }

    const targetUrl = `https://www.midishow.com/search/result?q=${encodeURIComponent(searchQuery)}&page=${page}`
    
    try {
      const response = await window.electronAPI.fetchCloudSearch(targetUrl)
      if (!response.success || !response.html) {
        throw new Error(response.error || '无法获取在线搜索结果，请检查网络连接。')
      }

      const parsed = parseMidiShowHtml(response.html)
      setResults(parsed.items)
      setPages(parsed.pages)
      setTotalPages(parsed.totalPages)
      
      // 如果解析出来的当前页和请求的页数不一致，以解析的为准
      if (parsed.currentPage) {
        setCurrentPage(parsed.currentPage)
      }
      setLastSearchedQuery(searchQuery) // 只有成功获取并重绘数据后才更新实际搜索词，避免打字干扰
    } catch (err: any) {
      console.error('Fetch cloud data error:', err)
      setError(err.message || '抓取数据失败')
    } finally {
      setLoading(false)
    }
  }

  // 4. 解析 HTML 数据核心逻辑
  const parseMidiShowHtml = (htmlString: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, 'text/html')
    const items: SearchResultItem[] = []
    
    // 提取搜索结果容器
    const resultDivs = doc.querySelectorAll('div[data-key]')
    resultDivs.forEach((div) => {
      const id = div.getAttribute('data-key') || ''
      if (!id) return
      
      const aLink = div.querySelector('a[target="ms_p"]')
      const relativeUrl = aLink ? aLink.getAttribute('href') : ''
      const fullUrl = relativeUrl 
        ? (relativeUrl.startsWith('http') ? relativeUrl : `https://www.midishow.com${relativeUrl}`)
        : `https://www.midishow.com/midi/${id}.html`
        
      const h3 = div.querySelector('h3.text-hover-primary')
      const titleHtml = h3 ? h3.innerHTML : '未命名歌曲'
      
      const pDesc = div.querySelector('p.font-size-1')
      const descHtml = pDesc ? pDesc.innerHTML : ''
      
      let fileSize = '--'
      let duration = '--'
      let instrumentsCount = '--'
      let tracksCount = '--'
      
      const sizeDiv = div.querySelector('div[title="文件大小"]')
      if (sizeDiv) fileSize = sizeDiv.textContent?.replace(/\s+/g, ' ').trim() || '--'
      
      const clockDiv = div.querySelector('div[title="乐曲时长"]')
      if (clockDiv) duration = clockDiv.textContent?.replace(/\s+/g, ' ').trim() || '--'
      
      const guitarDiv = div.querySelector('div[title="乐器数量"]')
      if (guitarDiv) instrumentsCount = guitarDiv.textContent?.replace(/\s+/g, ' ').trim() || '--'
      
      const barsDiv = div.querySelector('div[title="音轨数量"]')
      if (barsDiv) tracksCount = barsDiv.textContent?.replace(/\s+/g, ' ').trim() || '--'
      
      items.push({
        id,
        title: titleHtml,
        description: descHtml,
        url: fullUrl,
        fileSize,
        duration,
        instrumentsCount,
        tracksCount
      })
    })

    // 解析分页信息
    const parsedPages: PageItem[] = []
    let parsedCurrentPage = 1
    let parsedTotalPages = 1
    
    const pagination = doc.querySelector('.pagination')
    if (pagination) {
      const pageItems = pagination.querySelectorAll('li.page-item')
      pageItems.forEach((li) => {
        const text = li.textContent?.trim() || ''
        const isNum = /^\d+$/.test(text)
        if (isNum) {
          const pageNum = parseInt(text, 10)
          const isActive = li.classList.contains('active')
          if (isActive) {
            parsedCurrentPage = pageNum
          }
          parsedPages.push({
            page: pageNum,
            active: isActive
          })
        }
      })
    }

    if (parsedPages.length > 0) {
      parsedTotalPages = Math.max(...parsedPages.map((p) => p.page))
    }

    return {
      items,
      pages: parsedPages,
      currentPage: parsedCurrentPage,
      totalPages: parsedTotalPages
    }
  }

  // 5. 点击触发后台无头下载
  const handleDownload = async (item: SearchResultItem) => {
    setDownloadStates((prev) => ({ ...prev, [item.id]: 'loading' }))
    
    try {
      const res = await window.electronAPI.downloadCloudMidi(item.url)
      if (!res.success) {
        throw new Error(res.error || '静默下载唤起失败')
      }
      // 成功唤起后，会由 onMidiDownloaded 监听到下载完成并自动置为 'success'
    } catch (e: any) {
      console.error('Trigger silent download error:', e)
      setDownloadStates((prev) => ({ ...prev, [item.id]: 'idle' }))
      alert(`下载失败: ${e.message || '网络或后台错误'}`)
    }
  }

  // 6. 渲染搜索命中高亮标签
  const renderHighlight = (htmlText: string, className: string) => {
    // 将 <em> 标签替换为我们高亮显示的类名
    const safeHtml = htmlText
      .replace(/<em>/g, '<span class="cloud-search-highlight">')
      .replace(/<\/em>/g, '</span>')
    return <div className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      fetchCloudData(query.trim(), 1)
    }
  }

  return (
    <div className={`midishow-browser-local ${!lastSearchedQuery ? 'no-scroll' : ''}`} ref={containerRef}>
      {/* 顶部工具栏与搜索区 */}
      <div className="cloud-search-header">
        <form onSubmit={handleSearchSubmit} className="cloud-search-form">
          <div className="cloud-search-input-wrapper">
            <Search size={16} className="cloud-search-icon" />
            <input
              type="text"
              placeholder="输入歌曲名或歌手搜索 MIDI..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="cloud-search-input"
            />
          </div>
          <button type="submit" className="cloud-search-btn" disabled={loading}>
            {loading ? <RefreshCw size={14} className="spinner-icon" /> : '搜 索'}
          </button>
        </form>
      </div>

      {/* 主体结果列表区 */}
      <div className="cloud-search-body">
        {loading && (
          <div className="cloud-search-status-container">
            <div className="wave-loading-indicator">
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
            </div>
            <div className="loading-text">正在从云端调取搜索结果...</div>
          </div>
        )}

        {!loading && error && (
          <div className="cloud-search-status-container">
            <div className="error-card">
              <div className="error-icon">⚠️</div>
              <div className="error-msg">{error}</div>
              <button onClick={() => fetchCloudData(query, currentPage)} className="retry-btn">
                重新加载
              </button>
            </div>
          </div>
        )}

        {!loading && !error && results.length === 0 && lastSearchedQuery && (
          <div className="cloud-search-status-container">
            <div className="empty-card">
              <div className="empty-icon">📁</div>
              <div className="empty-text">未在云端检索到 “{lastSearchedQuery}” 的相关结果</div>
              <div className="empty-subtext">建议缩短关键词，或尝试其他热门歌曲名字</div>
            </div>
          </div>
        )}

        {!loading && !error && !lastSearchedQuery && (
          <div className="cloud-search-guide-container">
            <div className="cloud-search-guide-content">
              <img src={searchImg} className="cloud-search-guide-img" alt="Search Guide" draggable="false" />
              <div className="cloud-search-guide-text-group">
                <div className="cloud-search-guide-text">在线搜索由 MidiShow 驱动</div>
                <div className="cloud-search-guide-subtext">
                  使用前需
                  <button 
                    type="button" 
                    className="cloud-login-link-inline-btn" 
                    onClick={() => window.electronAPI.openLoginWindow()}
                    title="点击打开登录界面"
                  >
                    登录
                  </button>
                  才能正常使用(已登录请忽略)
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="midi-cards-container">
            {results.map((item) => {
              const downloadState = downloadStates[item.id] || 'idle'
              return (
                <div className="midi-result-card" key={item.id}>
                  <div className="midi-card-left">
                    {renderHighlight(item.title, 'midi-card-title-container')}
                    {item.description && renderHighlight(item.description, 'midi-card-desc')}
                    
                    {/* 歌曲技术指标元数据 */}
                    <div className="midi-meta-grid">
                      <div className="midi-meta-item" title="文件大小">
                        <FileText size={12} className="meta-icon" />
                        <span>{item.fileSize}</span>
                      </div>
                      <div className="midi-meta-item" title="播放时长">
                        <Clock size={12} className="meta-icon" />
                        <span>{item.duration}</span>
                      </div>
                      <div className="midi-meta-item" title="包含乐器数">
                        <Music size={12} className="meta-icon" />
                        <span>{item.instrumentsCount} 个乐器</span>
                      </div>
                      <div className="midi-meta-item" title="音轨数量">
                        <Layers size={12} className="meta-icon" />
                        <span>{item.tracksCount} 音轨</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="midi-card-right">
                    {downloadState === 'idle' && (
                      <button className="import-action-btn" onClick={() => handleDownload(item)}>
                        <Download size={14} />
                        <span>一键导入</span>
                      </button>
                    )}
                    
                    {downloadState === 'loading' && (
                      <button className="import-action-btn loading" disabled>
                        <RefreshCw size={14} className="spinner-icon" />
                        <span>正在下载...</span>
                      </button>
                    )}
                    
                    {downloadState === 'success' && (
                      <button className="import-action-btn success" disabled>
                        <Check size={14} />
                        <span>已载入曲库</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 底部精美分页导航 */}
      {!loading && !error && results.length > 0 && pages.length > 1 && (
        <div className="cloud-search-footer">
          <div className="cloud-pagination">
            <button
              onClick={() => fetchCloudData(query, currentPage - 1)}
              disabled={currentPage <= 1}
              className="pagination-arrow-btn"
            >
              &lt; 上一页
            </button>
            
            <div className="pagination-numbers">
              {pages.map((p) => (
                <button
                  key={p.page}
                  onClick={() => fetchCloudData(query, p.page)}
                  className={`pagination-num-btn ${p.active ? 'active' : ''}`}
                >
                  {p.page}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => fetchCloudData(query, currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="pagination-arrow-btn"
            >
              下一页 &gt;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
