import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Download, 
  QrCode,
  Trash2,
  FileText,
  Image,
  Video,
  Music,
  File,
  Archive,
  FileSpreadsheet,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QRCodeDialog } from '@/components/QRCodeDialog';
import { getFile, getPreviewUrl, createWebSocketConnection, subscribeToFile, unsubscribeFromFile, downloadFile, deleteFile, getTextContent, isTextFile, TEXT_PREVIEW_MAX_SIZE } from '@/lib/api';
import type { FileInfo, WebSocketMessage } from '@/lib/api';
import { formatFileSize, formatDate, formatTimeRemaining, getFileIcon } from '@/lib/utils';

function getFileIconComponent(mimeType: string) {
  const iconType = getFileIcon(mimeType);
  switch (iconType) {
    case 'image':
      return <Image className="h-16 w-16" style={{ color: 'var(--chart-1)' }} />;
    case 'video':
      return <Video className="h-16 w-16" style={{ color: 'var(--chart-2)' }} />;
    case 'audio':
      return <Music className="h-16 w-16" style={{ color: 'var(--chart-3)' }} />;
    case 'pdf':
      return <FileText className="h-16 w-16" style={{ color: 'var(--destructive)' }} />;
    case 'document':
      return <FileText className="h-16 w-16" style={{ color: 'var(--chart-1)' }} />;
    case 'spreadsheet':
      return <FileSpreadsheet className="h-16 w-16" style={{ color: 'var(--chart-3)' }} />;
    case 'archive':
      return <Archive className="h-16 w-16" style={{ color: 'var(--chart-5)' }} />;
    default:
      return <File className="h-16 w-16 text-muted-foreground" />;
  }
}

export function FileInfoPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  
  // 文本预览相关状态
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const loadFile = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getFile(code);
      setFileInfo(response.fileInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件不存在或已过期');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (!code) return;
    
    loadFile();
    
    // 创建WebSocket连接并订阅当前文件
    const ws = createWebSocketConnection((message: WebSocketMessage) => {
      console.log(message);
      if (message.type === 'file-updated' && message.code === code) {
        if (message.fileInfo) {
          setFileInfo(prev => prev ? { ...prev, ...message.fileInfo } : message.fileInfo);
        } else {
          // 文件已过期或删除
          setError('文件已过期或被删除');
        }
      } else if (message.type==='files-updated') {
        console.log("111");
        loadFile();
        return;
      }
    });
    
    if (ws) {
      wsRef.current = ws;
      ws.onopen = () => {
        subscribeToFile(ws, code);
      };
    }
    
    return () => {
      if (wsRef.current) {
        unsubscribeFromFile(wsRef.current, code);
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [code, loadFile]);

  // 判断是否可以预览文本
  const canPreviewText = fileInfo && isTextFile(fileInfo.mimeType, fileInfo.originalName) && fileInfo.size <= TEXT_PREVIEW_MAX_SIZE;

  // 加载文本内容
  const loadTextContent = useCallback(async () => {
    if (!code || !canPreviewText) return;
    
    setTextLoading(true);
    try {
      const result = await getTextContent(code);
      setTextContent(result.content);
      setShowPreview(true);
    } catch (err) {
      console.error('Failed to load text content:', err);
      setTextContent(null);
    } finally {
      setTextLoading(false);
    }
  }, [code, canPreviewText]);

  const handleDownload = async () => {
    if (code) {
      try {
        await downloadFile(code);
      } catch (err) {
        alert(err instanceof Error ? err.message : '下载失败');
      }
    }
  };

  const handleDelete = async () => {
    if (!code) return;
    
    if (!confirm('确定要删除此文件吗？此操作不可恢复。')) {
      return;
    }
    
    try {
      await deleteFile(code);
      navigate('/');
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <div className="text-center py-16">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">文件不可用</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!fileInfo) return null;

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Button variant="ghost" className="mb-4" onClick={() => navigate('/')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        返回
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>文件信息</CardTitle>
        </CardHeader>
        <CardContent>
          {/* File Preview / Icon */}
          <div className="flex flex-col items-center py-8">
            {fileInfo.mimeType.startsWith('image/') ? (
              <div className="max-w-full overflow-hidden rounded-lg border">
                <img 
                  src={getPreviewUrl(code!)} 
                  alt={fileInfo.originalName}
                  className="max-h-64 object-contain"
                />
              </div>
            ) : canPreviewText ? (
              <div className="w-full">
                {/* 文本预览区域 */}
                <div className="flex items-center justify-center mb-4">
                  {getFileIconComponent(fileInfo.mimeType)}
                </div>
                
                {showPreview && textContent !== null ? (
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-80 text-sm whitespace-pre-wrap break-all font-mono">
                      {textContent}
                    </pre>
                    <Button 
                      variant="secondary" 
                      size="sm"
                      className="mt-2"
                      onClick={() => setShowPreview(false)}
                    >
                      <EyeOff className="h-4 w-4 mr-1" />
                      收起预览
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Button 
                      variant="outline" 
                      onClick={loadTextContent}
                      disabled={textLoading}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {textLoading ? '加载中...' : '预览文本内容'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      文件大小: {formatFileSize(fileInfo.size)}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              getFileIconComponent(fileInfo.mimeType)
            )}
          </div>

          {/* File Info */}
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold break-all">{fileInfo.originalName}</h3>
              <p className="text-muted-foreground">Code: {fileInfo.code}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-muted-foreground">文件大小</p>
                <p className="font-medium">{formatFileSize(fileInfo.size)}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-muted-foreground">上传时间</p>
                <p className="font-medium">{formatDate(fileInfo.createdAt)}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-muted-foreground">下载次数</p>
                <p className="font-medium">
                  {fileInfo.maxDownloads === -1 
                    ? `${fileInfo.uploads}次` 
                    : `${fileInfo.uploads}/${fileInfo.maxDownloads}次`}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-muted-foreground">过期时间</p>
                <p className="font-medium text-primary">{formatTimeRemaining(fileInfo.expiresAt)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button className="flex-1" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                下载文件
              </Button>
              {fileInfo.isOwner ? (
                <>
                  <Button 
                    variant="destructive" 
                    onClick={handleDelete}
                    title="删除文件"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="p-2 bg-white rounded-lg border">
                    <QRCodeSVG value={`${window.location.origin}/?code=${code}`} size={80} />
                  </div>
                </>
              ) : (
                <Button variant="outline" onClick={() => setQrCodeOpen(true)}>
                  <QrCode className="h-4 w-4 mr-2" />
                  二维码
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <QRCodeDialog
        open={qrCodeOpen}
        onClose={() => setQrCodeOpen(false)}
        code={code!}
      />

      {/* Footer */}
      <footer className="mt-8 py-4 text-center text-sm text-muted-foreground border-t">
        <p>powered by linx © 2026 </p>
      </footer>
    </div>
  );
}
