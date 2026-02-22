import React, { useCallback, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn, formatFileSize } from '@/lib/utils';

interface FileDropZoneProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadProgress?: {
    percentage: number;
    speed: number;
  };
}

export function FileDropZone({ onUpload, isUploading, uploadProgress }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  }, []);

  const handleUpload = useCallback(() => {
    if (selectedFile) {
      onUpload(selectedFile);
      setSelectedFile(null);
    }
  }, [selectedFile, onUpload]);

  const handleCancel = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <div className="w-full">
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-1">拖拽文件到此处或点击选择文件</p>
        <p className="text-sm text-muted-foreground">最大支持 200MB</p>
      </div>

      {selectedFile && !isUploading && (
        <div className="mt-4 p-4 border rounded-lg flex items-center justify-between">
          <div>
            <p className="font-medium">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
              <X className="h-4 w-4 mr-1" />
              取消
            </Button>
            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleUpload(); }}>
              <Upload className="h-4 w-4 mr-1" />
              上传
            </Button>
          </div>
        </div>
      )}

      {isUploading && uploadProgress && (
        <div className="mt-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium">正在上传...</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(uploadProgress.speed)}/s
            </p>
          </div>
          <Progress value={uploadProgress.percentage} className="mb-2" />
          <p className="text-sm text-center text-muted-foreground">{uploadProgress.percentage}%</p>
        </div>
      )}
    </div>
  );
}
