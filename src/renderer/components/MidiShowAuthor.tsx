import { useEffect, useState, useRef } from 'react'
import { Clock, FileText, Download, Check, RefreshCw, ChevronLeft } from 'lucide-react'
import searchGif from '../../../resources/search.gif'
import { useTranslation } from 'react-i18next'

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
  const { t, i18n } = useTranslation()
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

    const baseUrl = (() => {
      const lang = i18n.language || 'zh'
      if (lang.startsWith('en')) return 'https://www.midishow.com/en'
      if (lang === 'zh-TW' || lang === 'yue') return 'https://www.midishow.com/zh-tw'
      return 'https://www.midishow.com'
    })()

    const targetUrl = `${baseUrl}/u/${encodeURIComponent(authorName)}?page=${page}`
    
    try {
      const response = await window.electronAPI.fetchCloudSearch(targetUrl)
      if (!response.success || !response.html) {
        throw new Error(response.error || t('midiShow.authorNetworkError'))
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
      setError(err.message || t('midiShow.authorFetchFailed'))
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
      bio: t('midiShow.noBio'),
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
      const baseUrl = (() => {
        const lang = i18n.language || 'zh'
        if (lang.startsWith('en')) return 'https://www.midishow.com/en'
        if (lang === 'zh-TW' || lang === 'yue') return 'https://www.midishow.com/zh-tw'
        return 'https://www.midishow.com'
      })()
      const fullUrl = relativeUrl 
        ? (relativeUrl.startsWith('http') ? relativeUrl : `https://www.midishow.com${relativeUrl}`)
        : `${baseUrl}/midi/${id}.html`
        
      const h4 = div.querySelector('h4')
      const titleHtml = h4 ? h4.textContent?.trim() || t('midiShow.unnamedSong') : t('midiShow.unnamedSong')
      
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
            <img src={searchGif} className="cloud-search-loading-gif" alt="Loading..." />
            <div className="loading-text">{t('midiShow.loadingAuthor')}</div>
          </div>
        )}

        {profile && (
          <>
            {/* 作者资料卡 */}
            <div className="author-profile-card">
              <button onClick={onBack} className="author-back-btn" title={t('midiShow.backTitle')}>
                <ChevronLeft size={16} /> {t('midiShow.back')}
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
                  <span className="stat-label">{t('midiShow.midiUnit')}</span>
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
              <h3>{t('midiShow.authorWorks')}</h3>
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
                        <div className="midi-meta-item" title={t('midiShow.fileSize')}>
                          <FileText size={12} className="meta-icon" />
                          <span>{item.fileSize}</span>
                        </div>
                        <div className="midi-meta-item" title={t('midiShow.duration')}>
                          <Clock size={12} className="meta-icon" />
                          <span>{item.duration}</span>
                        </div>
                        <div className="midi-meta-item" title={t('midiShow.instrumentsTitle')}>
                          <span style={{ opacity: 0.5 }}>-- {t('midiShow.instruments')}</span>
                        </div>
                        <div className="midi-meta-item" title={t('midiShow.tracksTitle')}>
                          <span style={{ opacity: 0.5 }}>-- {t('midiShow.tracks')}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="midi-card-right">
                      {downloadState === 'idle' && (
                        <button className="import-action-btn" onClick={() => onDownload(item)}>
                          <Download size={14} />
                          <span>{t('midiShow.import')}</span>
                        </button>
                      )}
                      
                      {downloadState === 'loading' && (
                        <button className="import-action-btn loading" disabled>
                          <RefreshCw size={14} className="spinner-icon" />
                          <span>{t('midiShow.downloading')}</span>
                        </button>
                      )}
                      
                      {downloadState === 'success' && (
                        <button className="import-action-btn success" disabled>
                          <Check size={14} />
                          <span>{t('midiShow.imported')}</span>
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
                    <div className="empty-text">{t('midiShow.noAuthorWorks')}</div>
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
                    {t('midiShow.prevPage')}
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
                    {t('midiShow.nextPage')}
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
