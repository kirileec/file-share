import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileDropZone } from '@/components/FileDropZone';
import { FileCard } from '@/components/FileCard';
import { QRCodeDialog } from '@/components/QRCodeDialog';
import { EditFileDialog } from '@/components/EditFileDialog';
import { UploadSettingsDialog } from '@/components/UploadSettingsDialog';
import { getFiles, uploadFile, deleteFile, updateFile, createWebSocketConnection, downloadFile } from '@/lib/api';
import type { FileInfo, UploadProgress } from '@/lib/api';

export function FileListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [searchCode, setSearchCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  
  // Dialog states
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadSettingsOpen, setUploadSettingsOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [uploadedCode, setUploadedCode] = useState('');

  // Check for code in URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      navigate(`/file/${code}`);
    }
  }, [searchParams, navigate]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getFiles();
      setFiles(response.files);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    
    // 使用WebSocket替代轮询
    const ws = createWebSocketConnection((message) => {
      if (message.type === 'files-updated') {
        loadFiles();
      }
    });
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [loadFiles]);

  const handleSearch = () => {
    if (searchCode.trim()) {
      navigate(`/file/${searchCode.trim()}`);
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress({ loaded: 0, total: file.size, speed: 0, percentage: 0 });
    
    try {
      const response = await uploadFile(
        file,
        3600, // default 1 hour
        1,    // default 1 download
        (progress) => setUploadProgress(progress)
      );
      
      setUploadedCode(response.code);
      setUploadSettingsOpen(true);
      await loadFiles();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('上传失败');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleUploadSettingsConfirm = async (expiresIn: number, maxDownloads: number | 'unlimited') => {
    try {
      await updateFile(uploadedCode, { expiresIn, maxDownloads });
      await loadFiles();
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  const handleView = (code: string) => {
    navigate(`/file/${code}`);
  };

  const handleDownload = async (code: string) => {
    try {
      await downloadFile(code);
    } catch (err) {
      alert(err instanceof Error ? err.message : '下载失败');
    }
  };

  const handleQrCode = (code: string) => {
    setSelectedCode(code);
    setQrCodeOpen(true);
  };

  const handleEdit = (code: string) => {
    const file = files.find(f => f.code === code);
    if (file) {
      setSelectedFile(file);
      setEditOpen(true);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm('确定要删除这个文件吗？')) return;
    
    try {
      await deleteFile(code);
      await loadFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('删除失败');
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">文件分享</h1>
        <Button variant="outline" size="icon" onClick={loadFiles} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <Input
          placeholder="输入code查看文件"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch}>
          <Search className="h-4 w-4 mr-2" />
          查找
        </Button>
      </div>

      {/* Upload Zone */}
      <div className="mb-8">
        <FileDropZone
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress ? { percentage: uploadProgress.percentage, speed: uploadProgress.speed } : undefined}
        />
      </div>

      {/* File List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">正在分享的文件</h2>
        {loading ? (
          <p className="text-muted-foreground text-center py-8">加载中...</p>
        ) : files.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">暂无分享的文件</p>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <FileCard
                key={file.code}
                file={file}
                onView={handleView}
                onDownload={handleDownload}
                onQrCode={handleQrCode}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <QRCodeDialog
        open={qrCodeOpen}
        onClose={() => setQrCodeOpen(false)}
        code={selectedCode}
      />
      
      <EditFileDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fileInfo={selectedFile}
        onSuccess={loadFiles}
      />
      
      <UploadSettingsDialog
        open={uploadSettingsOpen}
        onClose={() => setUploadSettingsOpen(false)}
        code={uploadedCode}
        onConfirm={handleUploadSettingsConfirm}
        onNavigateToFile={(code) => navigate(`/file/${code}`)}
      />

      {/* Footer */}
      <footer className="mt-12 py-4 text-center text-sm text-muted-foreground border-t">
        <p>powered by linx © 2026</p>
      </footer>
    </div>
  );
}
