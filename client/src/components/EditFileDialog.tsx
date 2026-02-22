import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateFile } from '@/lib/api';
import type { FileInfo } from '@/lib/api';

interface EditFileDialogProps {
  open: boolean;
  onClose: () => void;
  fileInfo: FileInfo | null;
  onSuccess: () => void;
}

const EXPIRE_OPTIONS = [
  { label: '10分钟', value: '600' },
  { label: '30分钟', value: '1800' },
  { label: '1小时', value: '3600' },
  { label: '3小时', value: '10800' },
];

const DOWNLOAD_OPTIONS = [
  { label: '1次', value: '1' },
  { label: '3次', value: '3' },
  { label: '无限制', value: 'unlimited' },
];

export function EditFileDialog({ open, onClose, fileInfo, onSuccess }: EditFileDialogProps) {
  const [expiresIn, setExpiresIn] = useState('3600');
  const [maxDownloads, setMaxDownloads] = useState('1');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fileInfo) {
      // 计算原始设置的总过期时间（从创建时算起）
      const totalSeconds = Math.floor((fileInfo.expiresAt - fileInfo.createdAt) / 1000);
      
      // 找到最接近的选项
      const optionValues = EXPIRE_OPTIONS.map(o => parseInt(o.value));
      const closestOption = optionValues.reduce((prev, curr) => 
        Math.abs(curr - totalSeconds) < Math.abs(prev - totalSeconds) ? curr : prev
      );
      
      setExpiresIn(closestOption.toString());
      setMaxDownloads(fileInfo.maxDownloads === -1 ? 'unlimited' : fileInfo.maxDownloads.toString());
    }
  }, [fileInfo]);

  const handleSave = async () => {
    if (!fileInfo) return;
    
    setLoading(true);
    try {
      await updateFile(fileInfo.code, {
        expiresIn: parseInt(expiresIn),
        maxDownloads: maxDownloads as 'unlimited' | number
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to update file:', error);
      alert('更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑分享设置</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">过期时间</label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">可下载次数</label>
            <Select value={maxDownloads} onValueChange={setMaxDownloads}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOWNLOAD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
