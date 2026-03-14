import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  getSessions, 
  createSession, 
  joinSession, 
  createWebSocketConnection
} from '../lib/api'
import type { 
  SessionInfo,
  ExtendedWebSocketMessage
} from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'

export function TransferPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [nickname, setNickname] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [, setTick] = useState(0) // 用于触发重新渲染

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions()
      setSessions(data.sessions)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 每秒更新一次倒计时显示
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    loadSessions()
    
    const ws = createWebSocketConnection((message: ExtendedWebSocketMessage) => {
      if (message.type === 'sessions-updated') {
        loadSessions()
      }
    })
    
    // 页面可见性处理 - 移动端切换回页面时刷新数据
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadSessions()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (ws) ws.close()
    }
  }, [loadSessions])

  const handleCreateSession = async () => {
    setCreating(true)
    try {
      const result = await createSession(sessionName || undefined)
      // 创建后自动加入
      await joinSession(result.sessionId, nickname || undefined)
      navigate(`/transfer/${result.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
      setCreateDialogOpen(false)
      setSessionName('')
    }
  }

  const handleJoinSession = async () => {
    if (!selectedSessionId.trim()) return
    
    setJoining(true)
    try {
      await joinSession(selectedSessionId, nickname || undefined)
      navigate(`/transfer/${selectedSessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败')
    } finally {
      setJoining(false)
      setJoinDialogOpen(false)
      setSelectedSessionId('')
    }
  }

  const handleQuickJoin = async (sessionId: string) => {
    setJoining(true)
    try {
      await joinSession(sessionId, nickname || undefined)
      navigate(`/transfer/${sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败')
    } finally {
      setJoining(false)
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 计算关闭倒计时（秒）
  const getCloseCountdown = (closeAt: number | null): number | null => {
    if (!closeAt) return null
    const remaining = Math.ceil((closeAt - Date.now()) / 1000)
    return remaining > 0 ? remaining : null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">传输助手</h1>
            <p className="text-muted-foreground mt-1">创建或加入房间，实时传输文件和消息</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
            >
              文件分享
            </Button>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setCreateDialogOpen(true)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                创建房间
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">创建一个新的传输房间，邀请他人加入</p>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setJoinDialogOpen(true)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                加入房间
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">输入房间ID加入已有的传输房间</p>
            </CardContent>
          </Card>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            {error}
          </div>
        )}

        {/* Active Sessions */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">活跃房间</h2>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                暂无活跃房间，创建一个新房间开始传输吧
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {sessions.map(session => {
                const closeCountdown = getCloseCountdown(session.closeAt)
                const isEmpty = session.userCount === 0
                
                return (
                  <Card key={session.id} 
                        className={`hover:shadow-lg transition-shadow cursor-pointer ${isEmpty ? 'opacity-60' : ''}`}
                        onClick={() => handleQuickJoin(session.id)}>
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{session.name}</div>
                        <div className="text-muted-foreground text-sm">
                          房间ID: {session.id} · {session.userCount} 人在线 · {formatTime(session.createdAt)}
                          {isEmpty && closeCountdown !== null && (
                            <span className="ml-2 text-red-500 font-medium">
                              将于 {closeCountdown} 秒后关闭
                            </span>
                          )}
                        </div>
                      </div>
                      <Button size="sm">
                        加入
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Create Session Dialog */}
        {createDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <Card className="w-full max-w-md mx-4 bg-white">
              <CardHeader>
                <CardTitle>创建新房间</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm block mb-1 text-foreground">房间名称（可选）</label>
                  <Input 
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="留空自动生成"
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1 text-foreground">昵称（可选）</label>
                  <Input 
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="留空自动生成"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button 
                    onClick={handleCreateSession}
                    disabled={creating}
                  >
                    {creating ? '创建中...' : '创建'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Join Session Dialog */}
        {joinDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <Card className="w-full max-w-md mx-4 bg-white">
              <CardHeader>
                <CardTitle>加入房间</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm block mb-1 text-foreground">房间ID</label>
                  <Input 
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    placeholder="输入8位房间ID"
                    maxLength={8}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1 text-foreground">昵称（可选）</label>
                  <Input 
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="留空自动生成"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => setJoinDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button 
                    onClick={handleJoinSession}
                    disabled={joining || !selectedSessionId.trim()}
                  >
                    {joining ? '加入中...' : '加入'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-muted-foreground text-sm">
          传输助手 - 实时文件与消息传输
        </div>
      </div>
    </div>
  )
}
