import React, { useState, useCallback } from 'react';
import { FileText, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 生成随机文件名（6-8位字母，大小写随机）
function generateRandomFilename(): string {
  const length = Math.floor(Math.random() * 3) + 6; // 6-8位
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface TextCreateZoneProps {
  onCreateText: (content: string, filename: string) => void;
  isCreating: boolean;
}

export function TextCreateZone({ onCreateText, isCreating }: TextCreateZoneProps) {
  const [showInput, setShowInput] = useState(false);
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState(generateRandomFilename);

  const handleOpen = useCallback(() => {
    setShowInput(true);
    setContent('');
    setFilename(generateRandomFilename());
  }, []);

  const handleClose = useCallback(() => {
    setShowInput(false);
    setContent('');
    setFilename(generateRandomFilename());
  }, []);

  const handleSubmit = useCallback(() => {
    if (content.trim()) {
      onCreateText(content.trim(), filename || generateRandomFilename());
      handleClose();
    }
  }, [content, filename, onCreateText, handleClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!showInput) {
    return (
      <button
        onClick={handleOpen}
        className="w-full border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 rounded-lg p-4 text-center transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <FileText className="h-5 w-5" />
        <span>直接输入文本创建文件</span>
      </button>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="文件名"
            className="bg-transparent border-b border-muted-foreground/25 focus:border-primary outline-none px-1 py-0.5 text-sm"
          />
          <span className="text-sm text-muted-foreground">.txt</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="在此输入文本内容...&#10;提示: 按 Ctrl+Enter 快速提交"
        className="w-full h-32 p-3 bg-muted rounded-lg resize-none outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        disabled={isCreating}
        autoFocus
      />
      
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground">
          {content.length} 字符 | Ctrl+Enter 提交
        </span>
        <Button 
          size="sm" 
          onClick={handleSubmit}
          disabled={!content.trim() || isCreating}
        >
          <Send className="h-4 w-4 mr-1" />
          {isCreating ? '创建中...' : '创建文件'}
        </Button>
      </div>
    </div>
  );
}
