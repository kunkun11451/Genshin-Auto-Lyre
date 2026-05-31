import { useEffect, useRef } from 'react'
import type { ParsedNote } from '../core/midi-parser'
import type { MappedNote } from '../core/note-mapper'
import { GAME_NOTES } from '../core/constants'
import { useAppStore } from '../store/useAppStore'
import './TrackCanvas.css'

interface TrackCanvasProps {
  originalNotes: ParsedNote[]
  mappedNotes: MappedNote[]
  totalDurationMs: number
  isPlaying: boolean
  onSeek: (timeMs: number) => void
}

export function TrackCanvas({
  originalNotes,
  mappedNotes,
  totalDurationMs,
  isPlaying,
  onSeek
}: TrackCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 渲染参数
  const pixelsPerMsRef = useRef<number>(0.1) // 缩放因子
  const scrollXRef = useRef<number>(0) // 视口水平偏移
  const currentTimeMsRef = useRef<number>(useAppStore.getState().currentTimeMs)
  
  // 避免 subscribe 闭包陷阱的最新 props 引用
  const latestPropsRef = useRef({ mappedNotes, isPlaying })
  useEffect(() => {
    latestPropsRef.current = { mappedNotes, isPlaying }
  }, [mappedNotes, isPlaying])

  // 初始化大小及响应窗口变化
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      canvas.width = width
      canvas.height = height
      renderCanvas()
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // 核心绘制逻辑
  const renderCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const pixelsPerMs = pixelsPerMsRef.current
    const { mappedNotes: currentMappedNotes, isPlaying: currentIsPlaying } = latestPropsRef.current
    
    // 如果正在播放，将播放头保持在视图中心左侧1/4处
    if (currentIsPlaying) {
      scrollXRef.current = Math.max(0, currentTimeMsRef.current * pixelsPerMs - width / 4)
    }

    const scrollX = scrollXRef.current
    const viewStartMs = scrollX / pixelsPerMs
    const viewEndMs = (scrollX + width) / pixelsPerMs

    ctx.clearRect(0, 0, width, height)

    // 1. 绘制背景网格
    const numRows = GAME_NOTES.length
    const rowHeight = height / numRows
    
    ctx.lineWidth = 1
    for (let i = 0; i < numRows; i++) {
      const y = i * rowHeight
      // 交替明暗行
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(0, y, width, rowHeight)
      // 横向网格线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // 映射 MIDI note 到行索引 (高音在上，倒序GAME_NOTES)
    const reversedNotes = [...GAME_NOTES].reverse()
    const getNoteY = (midiNote: number) => {
      // 如果不在白键内，折叠或找最接近的（仅可视化用）
      let targetNote = midiNote
      while (targetNote < 48) targetNote += 12
      while (targetNote > 83) targetNote -= 12
      
      let index = reversedNotes.indexOf(targetNote)
      if (index === -1) {
        // 对于黑键，找最近的白键
        let minDiff = 100
        reversedNotes.forEach((n, i) => {
          if (Math.abs(n - targetNote) < minDiff) {
            minDiff = Math.abs(n - targetNote)
            index = i
          }
        })
      }
      return index * rowHeight
    }

    // 2. 绘制处理后的音符
    for (const note of currentMappedNotes) {
      if (note.startMs > viewEndMs || note.startMs + note.durationMs < viewStartMs) continue

      const x = note.startMs * pixelsPerMs - scrollX
      const w = note.durationMs * pixelsPerMs
      const y = getNoteY(note.midiNote)

      // 使用不同颜色区分和弦与普通音符
      if (note.chordName) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.85)' // 金色高亮和弦
      } else {
        ctx.fillStyle = note.isDualGenerated ? 'rgba(180, 180, 180, 0.85)' : 'rgba(255, 255, 255, 0.85)'
      }
      ctx.beginPath()
      ctx.roundRect(x, y + 2, w, rowHeight - 4, 4)
      ctx.fill()

      if (note.chordName && w > 20) {
        ctx.fillStyle = '#000'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(note.chordName, x + w / 2, y + rowHeight / 2)
      }
    }

    // 3. 绘制播放头
    const playheadX = currentTimeMsRef.current * pixelsPerMs - scrollX
    if (playheadX >= 0 && playheadX <= width) {
      ctx.strokeStyle = '#e94560'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, height)
      ctx.stroke()
    }
  }

  // 依赖状态变化时重新渲染
  useEffect(() => {
    renderCanvas()
  }, [originalNotes, mappedNotes, totalDurationMs, isPlaying])

  // 监听 currentTimeMs 变化而不触发 React 渲染
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (state.currentTimeMs !== prevState.currentTimeMs) {
        currentTimeMsRef.current = state.currentTimeMs
        renderCanvas()
      }
    })
    return unsub
  }, [])

  // 事件处理
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey) {
      // 缩放
      const canvas = canvasRef.current
      if (!canvas) return
      
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      
      const timeAtMouse = (scrollXRef.current + mouseX) / pixelsPerMsRef.current
      
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newPixelsPerMs = Math.max(0.01, Math.min(2.0, pixelsPerMsRef.current * zoomFactor))
      pixelsPerMsRef.current = newPixelsPerMs
      
      scrollXRef.current = Math.max(0, timeAtMouse * newPixelsPerMs - mouseX)
      
    } else {
      // 滚动
      scrollXRef.current = Math.max(0, scrollXRef.current + e.deltaY)
    }
    renderCanvas()
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const clickedTimeMs = (scrollXRef.current + mouseX) / pixelsPerMsRef.current
    onSeek(clickedTimeMs)
  }

  return (
    <div className="track-canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="track-canvas"
        onWheel={handleWheel}
        onClick={handleClick}
      />
    </div>
  )
}
