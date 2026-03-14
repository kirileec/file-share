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
  expiresAt: number | null;
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
  data: { expiresIn?: number | 'unlimited'; maxDownloads?: number | 'unlimited' }
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
  
  // 解析 Content-Disposition 头获取文件名
  const contentDisposition = response.headers.get('content-disposition');
  let filename = 'download';
  if (contentDisposition) {
    // 优先解析 RFC 5987 格式: filename*=UTF-8''encoded_filename
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/i);
    if (utf8Match) {
      filename = decodeURIComponent(utf8Match[1]);
    } else {
      // 兼容旧格式: filename="filename" 或 filename=filename
      const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      if (asciiMatch) {
        filename = asciiMatch[1];
      }
    }
  }
  
  a.download = filename;
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

export type WebSocketWithReconnect = {
  onopen: ((this: WebSocket, ev: Event) => any) | null;
  readyState: number;
  send: (data: string) => void;
  close: () => void;
};

export function createWebSocketConnection(
  onMessage: (message: WebSocketMessage) => void
): WebSocketWithReconnect | null {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;
  
  // 在开发环境下直接连接到后端服务器
  const actualWsUrl = import.meta.env.DEV 
    ? `ws://10.10.0.103:8989/api/ws` 
    : wsUrl;
  
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = true;
  let onopenCallback: ((this: WebSocket, ev: Event) => any) | null = null;
  
  const connect = () => {
    try {
      ws = new WebSocket(actualWsUrl);
      
      ws.onopen = (event) => {
        console.log('WebSocket connected');
        if (onopenCallback) {
          onopenCallback.call(ws!, event);
        }
      };
      
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
        // 自动重连 - 缩短为1秒
        if (shouldReconnect) {
          reconnectTimer = setTimeout(() => {
            console.log('Reconnecting WebSocket...');
            connect();
          }, 1000);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      // 连接失败也尝试重连
      if (shouldReconnect) {
        reconnectTimer = setTimeout(() => {
          connect();
        }, 1000);
      }
    }
  };
  
  connect();
  
  // 返回一个包装对象，可以停止重连
  return {
    get readyState() {
      return ws?.readyState ?? WebSocket.CLOSED;
    },
    set onopen(callback: ((this: WebSocket, ev: Event) => any) | null) {
      onopenCallback = callback;
      if (ws && ws.readyState === WebSocket.OPEN) {
        // 如果已经连接，立即调用回调
        callback?.call(ws, new Event('open'));
      }
    },
    get onopen() {
      return onopenCallback;
    },
    send: (data: string) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    close: () => {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
    },
  };
}

export function subscribeToFile(ws: WebSocketWithReconnect | WebSocket, code: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', code }));
  }
}

export function unsubscribeFromFile(ws: WebSocketWithReconnect | WebSocket, code: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unsubscribe', code }));
  }
}

// 文本文件最大预览大小（100KB）
export const TEXT_PREVIEW_MAX_SIZE = 100 * 1024;

// 判断是否为文本文件
export function isTextFile(mimeType: string, originalName: string): boolean {
  const textMimeTypes = [
    'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/javascript',
    'application/json', 'application/javascript', 'application/xml', 'text/xml', 'text/csv'
  ];
  
  if (textMimeTypes.some(type => mimeType.includes(type))) {
    return true;
  }
  
  const textExtensions = ['.txt', '.md', '.markdown', '.json', '.js', '.ts', '.jsx', '.tsx',
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.xml', '.yaml', '.yml',
    '.csv', '.log', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.py',
    '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php',
    '.sql', '.vue', '.svelte'];
  
  const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();
  return textExtensions.includes(ext);
}

// 获取文本文件内容
export async function getTextContent(code: string): Promise<{
  content: string;
  mimeType: string;
  originalName: string;
}> {
  const response = await fetch(`${API_BASE}/text/${code}`, {
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get text content');
  }
  return response.json();
}

// 创建文本文件
export async function createTextFile(
  content: string,
  filename: string,
  expiresIn: number,
  maxDownloads: number | 'unlimited'
): Promise<UploadResponse> {
  const params = new URLSearchParams({
    filename,
    expiresIn: expiresIn.toString(),
    maxDownloads: maxDownloads.toString()
  });
  
  const response = await fetch(`${API_BASE}/text?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'x-browser-id': getBrowserId()
    },
    body: content
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create text file');
  }
  
  return response.json();
}

// ==================== 传输助手 API ====================

export interface SessionUser {
  id: string;
  nickname: string;
  isSelf?: boolean;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  type: 'text' | 'image' | 'file' | 'system';
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileCode?: string;
}

export interface SessionInfo {
  id: string;
  name: string;
  userCount: number;
  createdAt: number;
  closeAt: number | null;
}

export interface SessionDetail {
  id: string;
  name: string;
  users: SessionUser[];
  messages: SessionMessage[];
  createdAt: number;
}

// 创建 Session
export async function createSession(name?: string): Promise<{
  success: boolean;
  sessionId: string;
  session: SessionInfo;
}> {
  const response = await fetch(`${API_BASE}/transfer/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-browser-id': getBrowserId()
    },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create session');
  }
  return response.json();
}

// 获取 Session 列表
export async function getSessions(): Promise<{ sessions: SessionInfo[] }> {
  const response = await fetch(`${API_BASE}/transfer/sessions`, {
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

// 获取 Session 详情
export async function getSession(id: string): Promise<{
  success: boolean;
  session: SessionDetail;
}> {
  const response = await fetch(`${API_BASE}/transfer/session/${id}`, {
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch session');
  }
  return response.json();
}

// 加入 Session
export async function joinSession(
  sessionId: string,
  nickname?: string
): Promise<{
  success: boolean;
  session: SessionDetail;
}> {
  const response = await fetch(`${API_BASE}/transfer/session/${sessionId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-browser-id': getBrowserId()
    },
    body: JSON.stringify({ nickname })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to join session');
  }
  return response.json();
}

// 离开 Session
export async function leaveSession(sessionId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/transfer/session/${sessionId}/leave`, {
    method: 'POST',
    headers: {
      'x-browser-id': getBrowserId()
    }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to leave session');
  }
  return response.json();
}

// 发送消息
export async function sendMessage(
  sessionId: string,
  data: {
    type: 'text' | 'image' | 'file';
    content: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    fileCode?: string;
  }
): Promise<{ success: boolean; message: SessionMessage }> {
  const response = await fetch(`${API_BASE}/transfer/session/${sessionId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-browser-id': getBrowserId()
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send message');
  }
  return response.json();
}

// 上传文件到 Session
export async function uploadSessionFile(
  sessionId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<{
  success: boolean;
  fileCode: string;
  message: SessionMessage;
}> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
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
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('POST', `${API_BASE}/transfer/session/${sessionId}/upload`);
    xhr.setRequestHeader('x-browser-id', getBrowserId());
    xhr.send(formData);
  });
}

// WebSocket 订阅 Session
export function subscribeToSession(ws: WebSocketWithReconnect | WebSocket, sessionId: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'subscribe-session', 
      sessionId,
      userId: getBrowserId()
    }));
  }
}

// WebSocket 取消订阅 Session
export function unsubscribeFromSession(ws: WebSocketWithReconnect | WebSocket) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unsubscribe-session' }));
  }
}

// WebSocket 发送心跳
export function sendHeartbeat(ws: WebSocketWithReconnect | WebSocket, sessionId: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'heartbeat', sessionId }));
  }
}

// 传输助手 WebSocket 消息类型
export type TransferWebSocketMessage = {
  type: 'sessions-updated';
} | {
  type: 'user-joined';
  sessionId: string;
  user: SessionUser;
} | {
  type: 'user-left';
  sessionId: string;
  userId: string;
} | {
  type: 'new-message';
  sessionId: string;
  message: SessionMessage;
} | {
  type: 'session-closed';
  sessionId: string;
};

// 扩展的 WebSocket 消息类型
export type ExtendedWebSocketMessage = WebSocketMessage | TransferWebSocketMessage;
