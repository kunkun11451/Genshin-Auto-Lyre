/**
 * network-manager.ts - WebRTC 联机与时钟同步模块
 *
 * 封装 PeerJS，管理主机与客机的连接，以及进行 NTP 风格的毫秒级时钟同步。
 */

import Peer, { DataConnection } from 'peerjs'
import type { MappedNote } from './note-mapper'

export type NetworkRole = 'none' | 'host' | 'client'

export interface NetworkPlayer {
  id: string
  name: string
  conn: DataConnection
  ping: number
  ready?: boolean
}

// 消息类型
export type NetworkMessage =
  | { type: 'SYNC_REQ'; clientSendTime: number }
  | { type: 'SYNC_RES'; clientSendTime: number; hostReplyTime: number }
  | { type: 'PLAY'; targetTime: number }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'SEEK'; timeMs: number }
  | { type: 'TRACK_DATA'; notes: MappedNote[]; totalDurationMs?: number; instrumentMode?: 'standard' | 'chord' | 'horn'; previewInstrument?: string }
  | { type: 'READY_STATE'; ready: boolean }
  | { type: 'OVERVIEW_DATA'; playerCombinedTracks: Record<string, MappedNote[]>; multiplayerPreviewInstruments: Record<string, string>; totalDurationMs: number; hostName?: string }

// 事件监听接口
export interface NetworkEvents {
  onRoleChange?: (role: NetworkRole) => void
  onPlayersChange?: (players: NetworkPlayer[]) => void
  onConnected?: (hostId: string) => void
  onDisconnected?: () => void
  onError?: (err: Error) => void
  onPlayCommand?: (targetTime: number) => void
  onPauseCommand?: () => void
  onStopCommand?: () => void
  onSeekCommand?: (timeMs: number) => void
  onTrackDataReceived?: (
    notes: MappedNote[],
    totalDurationMs?: number,
    instrumentMode?: 'standard' | 'chord' | 'horn',
    previewInstrument?: string
  ) => void
  onOverviewDataReceived?: (
    combinedTracks: Record<string, MappedNote[]>,
    previewInstruments: Record<string, string>,
    totalDurationMs: number,
    hostName?: string
  ) => void
}

export class NetworkManager {
  private peer: Peer | null = null
  private role: NetworkRole = 'none'

  // 作为 Host 时的状态
  private players: Map<string, NetworkPlayer> = new Map()

  // 作为 Client 时的状态
  private hostConn: DataConnection | null = null

  // 时钟同步状态 (Client 用)
  private timeOffset: number = 0
  private syncInterval: ReturnType<typeof setInterval> | null = null

  public events: NetworkEvents = {}

  constructor() { }

  // ==========================================
  // 公共 API
  // ==========================================

  /** 获取自己的 Peer ID */
  get myId(): string {
    if (this.role === 'host' && !this.peer) {
      return 'DEV-ROOM'
    }
    return this.peer?.id || ''
  }

  /** 获取当前角色 */
  get currentRole(): NetworkRole {
    return this.role
  }

  /** 获取连接的玩家列表 (仅 Host) */
  get connectedPlayers(): NetworkPlayer[] {
    return Array.from(this.players.values())
  }

  /** 创建本地单机开发调试房间 */
  createDevRoom() {
    this.cleanup()
    this.setRole('host')

    // 模拟 11 个就绪玩家 (P2 ~ P12)，共计 12 人调试
    const mockPlayers: NetworkPlayer[] = Array.from({ length: 11 }).map((_, i) => ({
      id: `mock_${i + 1}`,
      name: `P${i + 2}`,
      conn: { send: () => { } } as any,
      ping: Math.floor(Math.random() * 15) + 5,
      ready: true
    }))

    mockPlayers.forEach(p => this.players.set(p.id, p))
    this.notifyPlayersChange()
  }

  /** 创建房间 (成为 Host) */
  async createRoom(playerName: string): Promise<string> {
    this.cleanup()
    return new Promise((resolve, reject) => {
      // 生成 6 位随机短 ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
      // 注意：目前 peerjs 无法给 Host 自己设 metadata，Host 的名字需要别的机制同步，或者客户端直接叫它主机
      this.peer = new Peer(roomId)

      this.peer.on('open', (id) => {
        this.setRole('host')
        resolve(id)
      })

      this.peer.on('connection', (conn) => {
        this.handleClientConnection(conn)
      })

      this.peer.on('error', (err) => {
        this.events.onError?.(err)
        reject(err)
      })
    })
  }

  /** 加入房间 (成为 Client) */
  async joinRoom(hostId: string, playerName: string): Promise<void> {
    this.cleanup()
    return new Promise((resolve, reject) => {
      this.peer = new Peer()

      this.peer.on('open', () => {
        const conn = this.peer!.connect(hostId, { reliable: true, metadata: { name: playerName } })
        this.hostConn = conn

        conn.on('open', () => {
          this.setRole('client')
          this.events.onConnected?.(hostId)
          this.startSync()
          resolve()
        })

        conn.on('data', (data) => {
          this.handleMessageFromHost(data as NetworkMessage)
        })

        conn.on('close', () => {
          this.cleanup()
          this.events.onDisconnected?.()
        })

        conn.on('error', (err) => {
          this.events.onError?.(err)
          reject(err)
        })
      })

      this.peer.on('error', (err) => {
        this.events.onError?.(err)
        reject(err)
      })
    })
  }

  /** 离开/关闭房间 */
  disconnect(): void {
    this.cleanup()
    this.events.onDisconnected?.()
  }

  /** 获取与主机同步的时间戳 (毫秒) */
  getSyncedTime(): number {
    if (this.role === 'host') {
      return Date.now()
    }
    return Date.now() + this.timeOffset
  }

  // ==========================================
  // 房主 API
  // ==========================================

  /** 给某个玩家发送轨道数据 */
  sendTrackDataToPlayer(
    playerId: string,
    notes: MappedNote[],
    totalDurationMs?: number,
    instrumentMode?: 'standard' | 'chord' | 'horn',
    previewInstrument?: string
  ) {
    if (this.role !== 'host') return
    const player = this.players.get(playerId)
    if (player && player.conn.open) {
      player.conn.send({ type: 'TRACK_DATA', notes, totalDurationMs, instrumentMode, previewInstrument })
    }
  }

  /** 广播播放命令 */
  broadcastPlay(delayMs: number = 3000): number {
    if (this.role !== 'host') return 0
    const targetTime = Date.now() + delayMs
    this.broadcast({ type: 'PLAY', targetTime })
    return targetTime
  }

  /** 广播停止命令 */
  broadcastStop(): void {
    if (this.role !== 'host') return
    this.broadcast({ type: 'STOP' })
  }

  /** 广播暂停命令 */
  broadcastPause(): void {
    if (this.role !== 'host') return
    this.broadcast({ type: 'PAUSE' })
  }

  /** 广播进度跳转命令 */
  broadcastSeek(timeMs: number): void {
    if (this.role !== 'host') return
    this.broadcast({ type: 'SEEK', timeMs })
  }

  // ==========================================
  // 内部实现
  // ==========================================

  /** 给主机发送准备就绪状态 */
  sendReadyState(ready: boolean) {
    if (this.role !== 'client' || !this.hostConn || !this.hostConn.open) return
    this.hostConn.send({ type: 'READY_STATE', ready })
  }

  private setRole(role: NetworkRole) {
    this.role = role
    this.events.onRoleChange?.(role)
  }

  private cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    if (this.peer) {
      this.peer.destroy()
      this.peer = null
    }
    this.hostConn = null
    this.players.clear()
    this.setRole('none')
    this.timeOffset = 0
    this.notifyPlayersChange()
  }

  broadcast(msg: NetworkMessage) {
    for (const player of this.players.values()) {
      if (player.conn.open) {
        player.conn.send(msg)
      }
    }
  }

  // ==== Host 逻辑 ====

  private handleClientConnection(conn: DataConnection) {
    conn.on('open', () => {
      const playerName = conn.metadata?.name || `玩家 ${conn.peer.substring(0, 4)}`
      const player: NetworkPlayer = { id: conn.peer, name: playerName, conn, ping: 0 }
      this.players.set(conn.peer, player)
      this.notifyPlayersChange()
    })

    conn.on('data', (data) => {
      const msg = data as NetworkMessage
      if (msg.type === 'SYNC_REQ') {
        // 主机收到客机的同步请求，原样带回并加上主机的当前时间
        conn.send({
          type: 'SYNC_RES',
          clientSendTime: msg.clientSendTime,
          hostReplyTime: Date.now()
        })
      } else if (msg.type === 'READY_STATE') {
        const player = this.players.get(conn.peer)
        if (player) {
          player.ready = msg.ready
          this.notifyPlayersChange()
        }
      }
    })

    conn.on('close', () => {
      this.players.delete(conn.peer)
      this.notifyPlayersChange()
    })

    conn.on('error', () => {
      this.players.delete(conn.peer)
      this.notifyPlayersChange()
    })
  }

  private notifyPlayersChange() {
    this.events.onPlayersChange?.(Array.from(this.players.values()))
  }

  // ==== Client 逻辑 ====

  private startSync() {
    // 初始快速同步几次
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.sendSyncReq(), i * 200)
    }
    // 之后定期同步防漂移
    this.syncInterval = setInterval(() => this.sendSyncReq(), 5000)
  }

  private sendSyncReq() {
    if (!this.hostConn || !this.hostConn.open) return
    this.hostConn.send({ type: 'SYNC_REQ', clientSendTime: Date.now() })
  }

  private handleMessageFromHost(msg: NetworkMessage) {
    if (msg.type === 'SYNC_RES') {
      const now = Date.now()
      const rtt = now - msg.clientSendTime
      // offset = 主机时间 - (收到时的本地时间 - 往返延迟/2)
      // 计算得出本地时间比主机时间快还是慢。
      // SyncedTime = LocalTime + offset
      const newOffset = msg.hostReplyTime - (now - rtt / 2)

      // 平滑处理 offset
      if (this.timeOffset === 0) {
        this.timeOffset = newOffset
      } else {
        this.timeOffset = this.timeOffset * 0.8 + newOffset * 0.2
      }
    } else if (msg.type === 'PLAY') {
      this.events.onPlayCommand?.(msg.targetTime)
    } else if (msg.type === 'PAUSE') {
      this.events.onPauseCommand?.()
    } else if (msg.type === 'STOP') {
      this.events.onStopCommand?.()
    } else if (msg.type === 'SEEK') {
      this.events.onSeekCommand?.(msg.timeMs)
    } else if (msg.type === 'TRACK_DATA') {
      this.events.onTrackDataReceived?.(msg.notes, msg.totalDurationMs, msg.instrumentMode, msg.previewInstrument)
    } else if (msg.type === 'OVERVIEW_DATA') {
      this.events.onOverviewDataReceived?.(msg.playerCombinedTracks, msg.multiplayerPreviewInstruments, msg.totalDurationMs, msg.hostName)
    }
  }
}

// 导出单例
export const networkManager = new NetworkManager()
