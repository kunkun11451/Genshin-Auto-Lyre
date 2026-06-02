import { useEffect, useState, useRef } from 'react'
import { Clock, FileText, Download, Check, RefreshCw, ChevronLeft } from 'lucide-react'
import searchGif from '../../../resources/search.gif'

interface MidiShowAuthorProps {
  authorName: string
  onBack: () => void
  downloadStates: Record<string, 'idle' | 'loading' | 'success'>
  onDownload: (item: any) => void
}

interface AuthorProfile {
  name: string
  avatar: string
  bio: string
  midiCount: string
  viewCount: string
}

interface AuthorMidiItem {
  id: string
  title: string
  url: string
  fileSize: string
  duration: string
}

interface PageItem {
  page: number
  active: boolean
}

export function MidiShowAuthor({ authorName, onBack, downloadStates, onDownload }: MidiShowAuthorProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [profile, setProfile] = useState<AuthorProfile | null>(null)
  const [results, setResults] = useState<AuthorMidiItem[]>([])
  
  const [pages, setPages] = useState<PageItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const worksHeaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (authorName) {
      fetchAuthorData(1)
    }
  }, [authorName])

  const fetchAuthorData = async (page: number) => {
    setLoading(true)
    setError(null)
    setCurrentPage(page)
    
    // 如果是第一页，滚动到最顶端展示作者信息；如果是翻页，滚动到作品列表区域
    if (page === 1) {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0
      }
    } else {
      if (worksHeaderRef.current) {
        worksHeaderRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    const targetUrl = `https://www.midishow.com/u/${encodeURIComponent(authorName)}?page=${page}`
    
    try {
      const response = await window.electronAPI.fetchCloudSearch(targetUrl)
      if (!response.success || !response.html) {
        throw new Error(response.error || '无法获取在线数据，请检查网络连接。')
      }

      const parsed = parseAuthorHtml(response.html)
      setProfile(parsed.profile)
      setResults(parsed.items)
      setPages(parsed.pages)
      setTotalPages(parsed.totalPages)
      
      if (parsed.currentPage) {
        setCurrentPage(parsed.currentPage)
      }
    } catch (err: any) {
      console.error('Fetch author data error:', err)
      setError(err.message || '抓取作者数据失败')
    } finally {
      setLoading(false)
    }
  }

  const parseAuthorHtml = (htmlString: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, 'text/html')
    
    // Parse Profile
    let profile: AuthorProfile = {
      name: authorName,
      avatar: '',
      bio: '暂无简介',
      midiCount: '--',
      viewCount: '--'
    }
    
    const avatarImg = doc.querySelector('.u-xl-avatar img') as HTMLImageElement
    if (avatarImg) {
      profile.avatar = avatarImg.getAttribute('src') || ''
      profile.name = avatarImg.getAttribute('alt') || authorName
    }
    
    // Find "个人简介"
    const h2s = doc.querySelectorAll('h2')
    h2s.forEach(h2 => {
      if (h2.textContent?.includes('个人简介')) {
        const p = h2.nextElementSibling
        if (p && p.tagName === 'P') {
          profile.bio = p.innerHTML.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, '').trim()
        }
      }
    })
    
    // Find MIDI count
    const h4s = doc.querySelectorAll('h4')
    h4s.forEach(h4 => {
      if (h4.textContent?.includes('MIDI')) {
        const span = h4.nextElementSibling
        if (span) profile.midiCount = span.textContent?.trim() || '--'
      }
    })
    
    // Parse Items
    const items: AuthorMidiItem[] = []
    const resultDivs = doc.querySelectorAll('div[data-key]')
    
    resultDivs.forEach((div) => {
      const id = div.getAttribute('data-key') || ''
      if (!id) return
      
      const aLink = div.querySelector('a[target="ms_p"]')
      const relativeUrl = aLink ? aLink.getAttribute('href') : ''
      const fullUrl = relativeUrl 
        ? (relativeUrl.startsWith('http') ? relativeUrl : `https://www.midishow.com${relativeUrl}`)
        : `https://www.midishow.com/midi/${id}.html`
        
      const h4 = div.querySelector('h4')
      const titleHtml = h4 ? h4.textContent?.trim() || '未命名歌曲' : '未命名歌曲'
      
      let fileSize = '--'
      let duration = '--'
      
      const listItems = div.querySelectorAll('.list-inline-item')
      listItems.forEach(li => {
        const text = li.textContent?.trim() || ''
        if (text.includes('KB') || text.includes('MB')) {
          fileSize = text
        } else if (text.includes(':')) {
          duration = text
        }
      })
      
      items.push({
        id,
        title: titleHtml,
        url: fullUrl,
        fileSize,
        duration
      })
    })

    // Parse Pagination
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
      profile,
      items,
      pages: parsedPages,
      currentPage: parsedCurrentPage,
      totalPages: parsedTotalPages
    }
  }

  return (
    <div className="author-view-container" ref={containerRef}>
      <div className="cloud-search-body">
        {loading && !profile && (
          <div className="cloud-search-status-container">
            <img src={searchGif} className="cloud-search-loading-gif" alt="正在加载..." />
            <div className="loading-text">正在调取作者主页...</div>
          </div>
        )}

        {profile && (
          <>
            {/* 作者资料卡 */}
            <div className="author-profile-card">
              <button onClick={onBack} className="author-back-btn" title="返回搜索结果">
                <ChevronLeft size={16} /> 返回
              </button>
              
              <div className="author-profile-avatar-container">
                {profile.avatar ? (
                  <img src={profile.avatar} alt={profile.name} className="author-profile-avatar" draggable="false" />
                ) : (
                  <div className="author-profile-avatar-fallback">{profile.name.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <h2 className="author-profile-name">{profile.name}</h2>
              <div className="author-profile-stats">
                <div className="author-stat-item">
                  <span className="stat-value">{profile.midiCount}</span>
                  <span className="stat-label">首 MIDI</span>
                </div>
              </div>
              {profile.bio && (
                <div className="author-bio">
                  {profile.bio.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
            </div>

            {/* 作品列表 */}
            <div className="author-works-header" ref={worksHeaderRef}>
              <h3>TA 的全部作品</h3>
            </div>

            <div className="midi-cards-container">
              {results.map((item) => {
                const downloadState = downloadStates[item.id] || 'idle'
                return (
                  <div className="midi-result-card" key={item.id}>
                    <div className="midi-card-left">
                      <div className="midi-card-title-container">
                        <h3>{item.title}</h3>
                      </div>
                      
                      <div className="midi-meta-grid">
                        <div className="midi-meta-item" title="文件大小">
                          <FileText size={12} className="meta-icon" />
                          <span>{item.fileSize}</span>
                        </div>
                        <div className="midi-meta-item" title="播放时长">
                          <Clock size={12} className="meta-icon" />
                          <span>{item.duration}</span>
                        </div>
                        <div className="midi-meta-item" title="乐器数量">
                          <span style={{ opacity: 0.5 }}>-- 个乐器</span>
                        </div>
                        <div className="midi-meta-item" title="音轨数量">
                          <span style={{ opacity: 0.5 }}>-- 音轨</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="midi-card-right">
                      {downloadState === 'idle' && (
                        <button className="import-action-btn" onClick={() => onDownload(item)}>
                          <Download size={14} />
                          <span>导入</span>
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
              
              {results.length === 0 && !loading && (
                <div className="cloud-search-status-container">
                  <div className="empty-card">
                    <div className="empty-icon">📁</div>
                    <div className="empty-text">该作者暂无上传的 MIDI 作品</div>
                  </div>
                </div>
              )}
            </div>
            
            {/* 底部精美分页导航 */}
            {!loading && !error && results.length > 0 && pages.length > 1 && (
              <div className="cloud-search-footer" style={{ background: 'transparent', borderTop: 'none', paddingBottom: 0 }}>
                <div className="cloud-pagination">
                  <button
                    onClick={() => fetchAuthorData(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="pagination-arrow-btn"
                  >
                    &lt; 上一页
                  </button>
                  
                  <div className="pagination-numbers">
                    {pages.map((p) => (
                      <button
                        key={p.page}
                        onClick={() => fetchAuthorData(p.page)}
                        className={`pagination-num-btn ${p.active ? 'active' : ''}`}
                      >
                        {p.page}
                      </button>
                    ))}
                  </div>
                  
                  <button
                    onClick={() => fetchAuthorData(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="pagination-arrow-btn"
                  >
                    下一页 &gt;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
