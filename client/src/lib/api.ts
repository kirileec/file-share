import { getBrowserId } from './utils';

const API_BASE = '/api';

export interface FileInfo {
  code: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploads: number;
  maxDownloads: number;
  createdAt: number;
  expiresAt: number;
  isOwner?: boolean;
}

export interface UploadResponse {
  success: boolean;
  code: string;
  ownerId: string;
  fileInfo: FileInfo;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  speed: number; // bytes per second
  percentage: number;
}

export async function uploadFile(
  file: File,
  expiresIn: number,
  maxDownloads: number | 'unlimited',
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('expiresIn', expiresIn.toString());
    formData.append('maxDownloads', maxDownloads.toString());

    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000; // seconds
        const loadedDiff = event.loaded - lastLoaded;
        
        const speed = timeDiff > 0 ? loadedDiff / timeDiff : 0;
        
        onProgress({
          loaded: event.loaded,
          total: event.total,
          speed,
          percentage: Math.round((event.loaded / event.total) * 100)
        });
        
        lastLoaded = event.loaded;
        lastTime = now;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          reject(new Error('Invalid response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('POST', `${API_BASE}/upload`);
    xhr.setRequestHeader('x-browser-id', getBrowserId());
    xhr.send(formData);
  });
}

export async function getFiles(): Promise<{ files: FileInfo[] }> {
  const response = await fetch(`${API_BASE}/files`, {
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) throw new Error('Failed to fetch files');
  return response.json();
}

export async function getFile(code: string): Promise<{ fileInfo: FileInfo }> {
  const response = await fetch(`${API_BASE}/file/${code}`, {
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch file');
  }
  return response.json();
}

export async function updateFile(
  code: string,
  data: { expiresIn?: number; maxDownloads?: number | 'unlimited' }
): Promise<{ success: boolean; fileInfo: FileInfo }> {
  const response = await fetch(`${API_BASE}/file/${code}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-browser-id': getBrowserId()
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update file');
  }
  return response.json();
}

export async function deleteFile(code: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/file/${code}`, {
    method: 'DELETE',
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete file');
  }
  return response.json();
}

export function getDownloadUrl(code: string): string {
  return `${API_BASE}/download/${code}`;
}

export function getPreviewUrl(code: string): string {
  return `${API_BASE}/download/${code}?preview=true`;
}

export async function downloadFile(code: string): Promise<void> {
  const response = await fetch(`${API_BASE}/download/${code}`, {
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '下载失败' }));
    throw new Error(error.error || '下载失败');
  }
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'download';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export type WebSocketMessage = {
  type: 'files-updated';
} | {
  type: 'file-updated';
  code: string;
  fileInfo: FileInfo | null;
};

export function createWebSocketConnection(
  onMessage: (message: WebSocketMessage) => void
): WebSocket | null {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;
  
  // 在开发环境下直接连接到后端服务器
  const actualWsUrl = import.meta.env.DEV 
    ? `ws://localhost:3001/api/ws` 
    : wsUrl;
  
  try {
    const ws = new WebSocket(actualWsUrl);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        onMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };
    
    return ws;
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
    return null;
  }
}

export function subscribeToFile(ws: WebSocket, code: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', code }));
  }
}

export function unsubscribeFromFile(ws: WebSocket, code: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unsubscribe', code }));
  }
}
