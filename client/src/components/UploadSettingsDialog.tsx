import React, { useState } from 'react';
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
import { QRCodeSVG } from 'qrcode.react';
import { Input } from '@/components/ui/input';
import { Copy, Check } from 'lucide-react';

interface UploadSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  code: string;
  onConfirm: (expiresIn: number, maxDownloads: number | 'unlimited') => void;
  onNavigateToFile?: (code: string) => void;
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

export function UploadSettingsDialog({ open, onClose, code, onConfirm, onNavigateToFile }: UploadSettingsDialogProps) {
  const [expiresIn, setExpiresIn] = useState('3600');
  const [maxDownloads, setMaxDownloads] = useState('1');
  const [copied, setCopied] = React.useState(false);
  
  const url = `${window.location.origin}/?code=${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = () => {
    onConfirm(parseInt(expiresIn), maxDownloads as 'unlimited' | number);
    onClose();
    if (onNavigateToFile) {
      onNavigateToFile(code);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传成功</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="p-4 bg-white rounded-lg">
            <QRCodeSVG value={url} size={180} />
          </div>
          
          <div className="flex items-center gap-2 w-full">
            <Input value={url} readOnly className="flex-1" />
            <Button onClick={handleCopy} variant="outline" size="icon">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
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
            关闭
          </Button>
          <Button onClick={handleConfirm}>
            确认设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
