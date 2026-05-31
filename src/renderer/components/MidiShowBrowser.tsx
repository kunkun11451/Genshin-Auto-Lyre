import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import './MidiShowBrowser.css'

// 与用户在控制台中手动输入的劫持脚本完全一致
const HIJACK_SCRIPT = `
var Original_JZZ_MIDI_SMF = JZZ.MIDI.SMF;
JZZ.MIDI.SMF = function(Midi_File){
  var Midi_File_Name = document.title.replace(" MIDI 音乐下载试听 :: MidiShow","") + ".mid"
  var Midi_File_Binary_Array = new Uint8Array(Midi_File.length);
  for (var Binary_Pointer = 0; Binary_Pointer < Midi_File.length ; Binary_Pointer++) { 
    Midi_File_Binary_Array[Binary_Pointer] = Midi_File.charCodeAt(Binary_Pointer);
  }
  var Midi_File_Blob = new Blob([Midi_File_Binary_Array],{type:''});
  var Midi_File_Url = URL.createObjectURL(Midi_File_Blob);
  var Midi_Downloader = document.createElement("a");
  Midi_Downloader.setAttribute("href",Midi_File_Url);
  Midi_Downloader.setAttribute("download",Midi_File_Name);
  Midi_Downloader.setAttribute("target","_blank");
  let Click_Event = document.createEvent("MouseEvents");
  Click_Event.initEvent("click",true,true);
  Midi_Downloader.dispatchEvent(Click_Event);
  return Original_JZZ_MIDI_SMF(Midi_File);
}
`.trim()

const PARTITION = 'persist:midishow'

interface MidiShowBrowserProps {
  url: string
  onClose: () => void
}

export function MidiShowBrowser({ url, onClose }: MidiShowBrowserProps): React.JSX.Element {
  const webviewRef = useRef<any>(null)
  const [pageTitle, setPageTitle] = useState('加载中...')
  const sessionSetup = useRef(false)

  // 初始化 session（仅一次）
  useEffect(() => {
    if (!sessionSetup.current) {
      sessionSetup.current = true
      window.electronAPI.setupMidiSession(PARTITION)
    }
  }, [])

  // 绑定 webview 事件
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const onDidFinishLoad = () => {
      setPageTitle(webview.getTitle() || 'MidiShow')
      injectScript(webview)
    }

    const onDidNavigateInPage = () => {
      setPageTitle(webview.getTitle() || 'MidiShow')
      injectScript(webview)
    }

    const onNewWindow = (e: any) => {
      // 拦截 target="_blank"，在同一 webview 内跳转
      e.preventDefault()
      webview.loadURL(e.url)
    }

    webview.addEventListener('did-finish-load', onDidFinishLoad)
    webview.addEventListener('did-navigate-in-page', onDidNavigateInPage)
    webview.addEventListener('new-window', onNewWindow)

    return () => {
      webview.removeEventListener('did-finish-load', onDidFinishLoad)
      webview.removeEventListener('did-navigate-in-page', onDidNavigateInPage)
      webview.removeEventListener('new-window', onNewWindow)
    }
  }, [])

  // 通过 <script> 标签注入到主世界，轮询等待 JZZ 就绪
  const injectScript = (webview: any) => {
    const escaped = JSON.stringify(HIJACK_SCRIPT)
    webview.executeJavaScript(`
      (function() {
        if (window._hijackTimer) clearInterval(window._hijackTimer);
        window._jzzHijacked = false;
        window._jzzReady = false;
        var retries = 0;
        window._hijackTimer = setInterval(function() {
          try {
            var testScript = document.createElement('script');
            testScript.textContent = 'window._jzzReady = (typeof JZZ !== "undefined" && JZZ.MIDI && JZZ.MIDI.SMF) ? true : false;';
            document.documentElement.appendChild(testScript);
            testScript.remove();
          } catch(e) {}
          
          if (window._jzzReady && !window._jzzHijacked) {
            clearInterval(window._hijackTimer);
            window._jzzHijacked = true;
            var s = document.createElement('script');
            s.textContent = ${escaped};
            document.documentElement.appendChild(s);
            s.remove();
            console.log('JZZ Hijacked successfully via main world script tag!');
          } else if (retries++ > 2000) {
            clearInterval(window._hijackTimer);
          }
        }, 500);
      })();
    `).catch(() => {})
  }

  const handleBack = () => {
    const webview = webviewRef.current
    if (webview && webview.canGoBack()) {
      webview.goBack()
    }
  }

  return (
    <div className="midishow-browser">
      {/* 顶部工具栏 */}
      <div className="midishow-toolbar">
        <button className="midishow-toolbar-btn" onClick={handleBack} title="返回">
          <ArrowLeft size={16} />
        </button>
        <div className="midishow-toolbar-title">{pageTitle}</div>
        <span className="midishow-hijack-badge">选择曲目后点击试听自动下载</span>
        <button className="midishow-toolbar-btn midishow-close-btn" onClick={onClose} title="关闭">
          <X size={16} />
        </button>
      </div>

      {/* 内嵌网页 */}
      <div className="midishow-content">
        <webview
          ref={webviewRef}
          src={url}
          partition={PARTITION}
          style={{ width: '100%', height: '100%' }}
          // @ts-ignore
          allowpopups="true"
        />
      </div>
    </div>
  )
}
