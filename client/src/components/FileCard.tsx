import { 
  Eye, 
  Download, 
  QrCode, 
  Edit, 
  Trash2,
  FileText,
  Image,
  Video,
  Music,
  File,
  Archive,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FileInfo } from '@/lib/api';
import { formatFileSize, formatDate, formatTimeRemaining, getFileIcon } from '@/lib/utils';

interface FileCardProps {
  file: FileInfo;
  onView: (code: string) => void;
  onDownload: (code: string) => void;
  onQrCode: (code: string) => void;
  onEdit: (code: string) => void;
  onDelete: (code: string) => void;
}

function getFileIconComponent(mimeType: string) {
  const iconType = getFileIcon(mimeType);
  switch (iconType) {
    case 'image':
      return <Image className="h-8 w-8 text-blue-500" />;
    case 'video':
      return <Video className="h-8 w-8 text-purple-500" />;
    case 'audio':
      return <Music className="h-8 w-8 text-green-500" />;
    case 'pdf':
      return <FileText className="h-8 w-8 text-red-500" />;
    case 'document':
      return <FileText className="h-8 w-8 text-blue-600" />;
    case 'spreadsheet':
      return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
    case 'archive':
      return <Archive className="h-8 w-8 text-yellow-600" />;
    default:
      return <File className="h-8 w-8 text-gray-500" />;
  }
}

export function FileCard({ file, onView, onDownload, onQrCode, onEdit, onDelete }: FileCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {getFileIconComponent(file.mimeType)}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate" title={file.originalName}>
              {file.originalName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(file.size)} · {formatDate(file.createdAt)}
            </p>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>Code: {file.code}</span>
              <span>·</span>
              <span>
                {file.maxDownloads === -1 
                  ? `${file.uploads}次下载` 
                  : `${file.uploads}/${file.maxDownloads}次下载`}
              </span>
              <span>·</span>
              <span className="text-orange-500">{formatTimeRemaining(file.expiresAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onView(file.code)} title="查看">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDownload(file.code)} title="下载">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onQrCode(file.code)} title="二维码">
              <QrCode className="h-4 w-4" />
            </Button>
            {file.isOwner && (
              <>
                <Button variant="ghost" size="icon" onClick={() => onEdit(file.code)} title="编辑">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => onDelete(file.code)} 
                  title="删除"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
