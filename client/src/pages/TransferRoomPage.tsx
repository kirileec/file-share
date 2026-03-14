import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getSession,
  joinSession,
  leaveSession,
  sendMessage,
  uploadSessionFile,
  createWebSocketConnection,
  subscribeToSession,
  unsubscribeFromSession,
  sendHeartbeat,
  getDownloadUrl
} from '../lib/api'
import type {
  SessionDetail,
  SessionMessage,
  SessionUser,
  ExtendedWebSocketMessage,
  WebSocketWithReconnect
} from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { MarkdownRenderer } from '../components/transfer/MarkdownRenderer'
import { isMobile, getBrowserId, generateUserId } from '../lib/utils'

export function TransferRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showUsersPopup, setShowUsersPopup] = useState(false)
  const [myUserId, setMyUserId] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wsRef = useRef<WebSocketWithReconnect | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)

  // 初始化时计算用户ID
  useEffect(() => {
    const browserId = getBrowserId()
    const userId = generateUserId(browserId)
    setMyUserId(userId)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    
    try {
      const data = await getSession(sessionId)
      setSession(data.session)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    
    // 加入 session
    joinSession(sessionId).catch(console.error)
    
    // 加载 session 数据
    loadSession()
    
    // 创建 WebSocket 连接
    const ws = createWebSocketConnection((message: ExtendedWebSocketMessage) => {
      switch (message.type) {
        case 'new-message':
          if (message.sessionId === sessionId) {
            setSession(prev => {
              if (!prev) return prev
              return {
                ...prev,
                messages: [...prev.messages, message.message]
              }
            })
          }
          break
        case 'user-joined':
          if (message.sessionId === sessionId) {
            setSession(prev => {
              if (!prev) return prev
              return {
                ...prev,
                users: [...prev.users, { ...message.user, isSelf: false }]
              }
            })
          }
          break
        case 'user-left':
          if (message.sessionId === sessionId) {
            setSession(prev => {
              if (!prev) return prev
              return {
                ...prev,
                users: prev.users.filter(u => u.id !== message.userId)
              }
            })
          }
          break
        case 'session-closed':
          if (message.sessionId === sessionId) {
            setError('房间已关闭')
            setTimeout(() => navigate('/transfer'), 2000)
          }
          break
      }
    })
    
    if (ws) {
      wsRef.current = ws
      ws.onopen = () => {
        // 连接/重连后重新加入 session 并订阅
        joinSession(sessionId).catch(console.error)
        subscribeToSession(ws, sessionId)
      }
    }
    
    // 心跳保持活跃 - 缩短为10秒，防止移动端断开
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current && sessionId) {
        sendHeartbeat(wsRef.current, sessionId)
      }
    }, 10000)
    
    // 页面可见性处理 - 移动端切换回页面时刷新数据
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面重新可见时，重新加载数据并检查连接
        loadSession()
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.log('Page visible but WS not open, will reconnect...')
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (wsRef.current) {
        unsubscribeFromSession(wsRef.current)
        wsRef.current.close()
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
      if (sessionId) {
        leaveSession(sessionId).catch(console.error)
      }
    }
  }, [sessionId, navigate, loadSession])

  useEffect(() => {
    scrollToBottom()
  }, [session?.messages])

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !sessionId || sending) return
    
    const content = messageInput.trim()
    setMessageInput('')
    setSending(true)
    
    // 乐观更新：立即显示消息
    const tempMessage: SessionMessage = {
      id: `temp-${Date.now()}`,
      sessionId: sessionId,
      type: 'text',
      senderId: myUserId,
      senderName: session?.users.find(u => u.id === myUserId)?.nickname || '我',
      content: content,
      timestamp: Date.now()
    }
    
    setSession(prev => {
      if (!prev) return prev
      return {
        ...prev,
        messages: [...prev.messages, tempMessage]
      }
    })
    
    try {
      await sendMessage(sessionId, {
        type: 'text',
        content: content
      })
      // 发送成功后，移除临时消息（服务器会通过WebSocket发送正式消息）
      setSession(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.filter(m => m.id !== tempMessage.id)
        }
      })
    } catch (err) {
      console.error('Failed to send message:', err)
      // 发送失败也保留临时消息，但标记状态
    } finally {
      setSending(false)
      // 发送后重新聚焦输入框，触发移动端键盘弹出
      if (textareaRef.current) {
        textareaRef.current.blur()
        setTimeout(() => {
          textareaRef.current?.focus()
        }, 100)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 移动端回车换行，不发送消息
    if (isMobile()) {
      return
    }
    // 桌面端 Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    
    setUploading(true)
    setUploadProgress(0)
    
    try {
      await uploadSessionFile(sessionId, file, (progress) => {
        setUploadProgress(progress.percentage)
      })
    } catch (err) {
      console.error('Failed to upload file:', err)
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 消息复制按钮组件
  const MessageCopyButton = ({ content }: { content: string }) => {
    const [copied, setCopied] = useState(false)
    
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
    
    return (
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10"
        title={copied ? '已复制' : '复制消息'}
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    )
  }

  const renderMessage = (msg: SessionMessage, users: SessionUser[]) => {
    // 使用 hash 后的 userId 判断是否为自己发送的消息
    const isSelf = msg.senderId === myUserId
    
    return (
      <div
        key={msg.id}
        className={`flex ${isSelf ? 'justify-end' : 'justify-start'} mb-3 group`}
      >
        <div className={`max-w-[70%] ${isSelf ? 'order-1' : ''}`}>
          <div className={`text-xs text-muted-foreground mb-1 ${isSelf ? 'text-right' : ''}`}>
            {msg.senderName} · {formatTime(msg.timestamp)}
          </div>
          <div
            className={`rounded-lg px-4 py-2 border ${
              isSelf
                ? 'bg-primary text-primary-foreground border-primary/20'
                : 'bg-secondary text-secondary-foreground border-border'
            }`}
          >
            {msg.type === 'text' && (
              <MarkdownRenderer content={msg.content} />
            )}
            {msg.type === 'image' && (
              <a href={getDownloadUrl(msg.fileCode!)} target="_blank" rel="noopener noreferrer">
                <img 
                  src={getDownloadUrl(msg.fileCode!)} 
                  alt={msg.fileName}
                  className="max-w-full rounded max-h-64 object-contain"
                />
              </a>
            )}
            {msg.type === 'file' && (
              <a
                href={getDownloadUrl(msg.fileCode!)}
                className="flex items-center gap-2 hover:underline"
                download={msg.fileName}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <div className="font-medium">{msg.fileName}</div>
                  <div className="text-xs opacity-70">{formatFileSize(msg.fileSize || 0)}</div>
                </div>
              </a>
            )}
          </div>
          {/* 复制按钮 - 悬浮在消息下方 */}
          <div className={`mt-1 flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
            <MessageCopyButton content={msg.type === 'text' ? msg.content : msg.fileName || ''} />
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-screen bg-gradient-to-br from-background via-card to-background flex items-center justify-center">
        <div className="text-foreground">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen bg-gradient-to-br from-background via-card to-background flex items-center justify-center">
        <Card>
          <CardContent className="py-8 px-12 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => navigate('/transfer')}>
              返回房间列表
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="h-screen bg-gradient-to-br from-background via-card to-background flex flex-col overflow-hidden">
      {/* Header - Fixed at top */}
      <div className="bg-background/80 backdrop-blur-sm border-b px-4 py-3 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/transfer')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Button>
          <div>
            <h1 className="font-semibold text-foreground">{session.name}</h1>
            <div className="text-xs text-muted-foreground">房间ID: {sessionId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 移动端点击显示用户列表，桌面端仅显示文字 */}
          {isMobile() ? (
            <button
              className="text-muted-foreground text-sm hover:text-foreground transition-colors"
              onClick={() => setShowUsersPopup(!showUsersPopup)}
            >
              {session.users.length} 人在线
            </button>
          ) : (
            <span className="text-muted-foreground text-sm">
              {session.users.length} 人在线
            </span>
          )}
        </div>
      </div>

      {/* Users Popup (Mobile Only) */}
      {showUsersPopup && isMobile() && (
        <div 
          className="fixed inset-0 z-50 pt-16" 
          onClick={() => setShowUsersPopup(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-lg w-64 max-h-64 overflow-y-auto mx-4" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">在线用户</h3>
              <button onClick={() => setShowUsersPopup(false)} className="text-muted-foreground hover:text-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-2 space-y-1">
              {session.users.map(user => {
                const isSelf = user.id === myUserId
                return (
                  <div
                    key={user.id}
                    className={`text-sm px-3 py-2 rounded ${
                      isSelf 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      {user.nickname}
                      {isSelf && <span className="text-xs text-muted-foreground">(我)</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages List - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {session.messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                暂无消息，发送第一条消息开始聊天吧
              </div>
            ) : (
              <>
                {session.messages.map(msg => renderMessage(msg, session.users))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area - Fixed at bottom */}
          <div className="border-t bg-card p-3 flex-shrink-0">
            {uploading && (
              <div className="mb-2">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-muted-foreground text-xs mt-1">上传中... {uploadProgress}%</div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </Button>
              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isMobile() ? "输入消息... (支持Markdown)" : "输入消息... (Enter发送, Shift+Enter换行, 支持Markdown)"}
                className="flex-1 min-h-[40px] max-h-32 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sending}
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px'
                }}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!messageInput.trim() || sending}
                className="flex-shrink-0"
              >
                发送
              </Button>
            </div>
          </div>
        </div>

        {/* Users Sidebar (Desktop) */}
        <div className="w-48 bg-sidebar border-l p-4 hidden md:block flex-shrink-0">
          <h3 className="text-sm font-medium mb-3 text-sidebar-foreground">在线用户</h3>
          <div className="space-y-2">
            {session.users.map(user => {
              const isSelf = user.id === myUserId
              return (
                <div
                  key={user.id}
                  className={`text-sm px-2 py-1 rounded ${
                    isSelf 
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                      : 'text-sidebar-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    {user.nickname}
                    {isSelf && <span className="text-xs">(我)</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}