import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

interface QRCodeDialogProps {
  open: boolean;
  onClose: () => void;
  code: string;
}

export function QRCodeDialog({ open, onClose, code }: QRCodeDialogProps) {
  const [copied, setCopied] = React.useState(false);
  const url = `${window.location.origin}/?code=${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享链接</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-white rounded-lg">
            <QRCodeSVG value={url} size={200} />
          </div>
          <div className="flex items-center gap-2 w-full">
            <Input value={url} readOnly className="flex-1" />
            <Button onClick={handleCopy} variant="outline" size="icon">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
