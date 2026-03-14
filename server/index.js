import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8989;
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 存储所有WebSocket连接，以及它们订阅的文件code和session
const wsClients = new Map(); // ws -> { fileCodes: Set<string>, sessionId: string | null, userId: string }

// ==================== 传输助手 Session 存储 ====================
// Session 存储: sessionId -> Session
const sessionStore = new Map();

// Session 数据结构:
// {
//   id: string;           // 8位随机字符串
//   name: string;         // session 名称
//   createdBy: string;    // 创建者的 browserId
//   createdAt: number;    // 创建时间戳
//   users: Map<string, { id: string, nickname: string, joinedAt: number, lastSeen: number }>;
//   messages: Array;      // 消息列表
//   closeTimer: null | Timeout; // 自动关闭计时器
// }

// 生成8位随机字符串作为 Session ID
function generateSessionId() {
  let id;
  do {
    id = crypto.randomBytes(4).toString('hex'); // 8位十六进制字符
  } while (sessionStore.has(id));
  return id;
}

// 广播 Session 列表更新
function broadcastSessionsUpdate() {
  const message = JSON.stringify({ type: 'sessions-updated' });
  wsClients.forEach((_, client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// 广播 Session 内消息
function broadcastToSession(sessionId, message) {
  wsClients.forEach((data, client) => {
    if (client.readyState === 1 && data.sessionId === sessionId) {
      client.send(JSON.stringify(message));
    }
  });
}

// 获取公开的 Session 信息（用于列表展示）
function getPublicSessionInfo(session) {
  return {
    id: session.id,
    name: session.name,
    userCount: session.users.size,
    createdAt: session.createdAt,
    closeAt: session.closeAt || null
  };
}

// 获取 Session 详情（用于聊天室内）
function getSessionDetail(session, currentUserId) {
  return {
    id: session.id,
    name: session.name,
    users: Array.from(session.users.entries()).map(([id, user]) => ({
      id,
      nickname: user.nickname,
      isSelf: id === currentUserId
    })),
    messages: session.messages.slice(-100), // 最近100条消息
    createdAt: session.createdAt
  };
}

// 启动 Session 自动关闭计时器
function scheduleSessionClose(sessionId) {
  const session = sessionStore.get(sessionId);
  if (!session || session.closeTimer) return;
  
  // 设置关闭时间（60秒后）
  session.closeAt = Date.now() + 60000;
  
  session.closeTimer = setTimeout(() => {
    const currentSession = sessionStore.get(sessionId);
    if (currentSession && currentSession.users.size === 0) {
      // 广播 session 关闭
      broadcastToSession(sessionId, { type: 'session-closed', sessionId });
      sessionStore.delete(sessionId);
      broadcastSessionsUpdate();
      console.log(`Session ${sessionId} auto-closed after 1 minute of inactivity`);
    }
  }, 60000); // 1分钟
}

// 取消 Session 自动关闭计时器
function cancelSessionClose(sessionId) {
  const session = sessionStore.get(sessionId);
  if (session && session.closeTimer) {
    clearTimeout(session.closeTimer);
    session.closeTimer = null;
    session.closeAt = null;
  }
}

// 广播文件列表更新
function broadcastFilesUpdate() {
  const message = JSON.stringify({ type: 'files-updated' });
  wsClients.forEach((_, client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// 广播特定文件更新
function broadcastFileUpdate(code, fileInfo) {
  const message = JSON.stringify({ 
    type: 'file-updated', 
    code,
    fileInfo: fileInfo ? getPublicFileInfo(fileInfo) : null
  });
  wsClients.forEach((data, client) => {
    if (client.readyState === 1 && data.fileCodes.has(code)) {
      client.send(message);
    }
  });
}

// 检查并发送即将过期文件的通知（剩余时间少于等于60秒的文件）
function checkExpiringFiles() {
  const now = Date.now();
  for (const [code, fileInfo] of fileStore) {
    if (fileInfo.expiresAt) {
      const remaining = fileInfo.expiresAt - now;
      // 如果剩余时间在60秒以内且大于0，发送更新通知
      if (remaining > 0 && remaining <= 60000) {
        broadcastFileUpdate(code, fileInfo);
      }
    }
  }
}

// 每10秒检查即将过期的文件
setInterval(checkExpiringFiles, 10000);

wss.on('connection', (ws) => {
  wsClients.set(ws, { fileCodes: new Set(), sessionId: null, userId: null });
  console.log('WebSocket client connected, total:', wsClients.size);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // 文件订阅相关
      if (message.type === 'subscribe' && message.code) {
        const clientData = wsClients.get(ws);
        if (clientData) {
          clientData.fileCodes.add(message.code);
        }
      }
      if (message.type === 'unsubscribe' && message.code) {
        const clientData = wsClients.get(ws);
        if (clientData) {
          clientData.fileCodes.delete(message.code);
        }
      }
      
      // Session 订阅相关
      if (message.type === 'subscribe-session' && message.sessionId) {
        const clientData = wsClients.get(ws);
        if (clientData) {
          clientData.sessionId = message.sessionId;
          // 根据 browserId 生成稳定的 userId
          clientData.userId = message.userId ? generateUserId(message.userId) : null;
        }
      }
      if (message.type === 'unsubscribe-session') {
        const clientData = wsClients.get(ws);
        if (clientData) {
          clientData.sessionId = null;
        }
      }
      
      // 心跳更新用户活跃时间
      if (message.type === 'heartbeat' && message.sessionId) {
        const clientData = wsClients.get(ws);
        if (clientData && clientData.sessionId === message.sessionId) {
          const session = sessionStore.get(message.sessionId);
          if (session && clientData.userId && session.users.has(clientData.userId)) {
            const user = session.users.get(clientData.userId);
            if (user) {
              user.lastSeen = Date.now();
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    const clientData = wsClients.get(ws);
    
    // 处理用户离开 session
    if (clientData && clientData.sessionId && clientData.userId) {
      const session = sessionStore.get(clientData.sessionId);
      if (session && session.users.has(clientData.userId)) {
        session.users.delete(clientData.userId);
        
        // 广播用户离开
        broadcastToSession(clientData.sessionId, {
          type: 'user-left',
          sessionId: clientData.sessionId,
          userId: clientData.userId
        });
        
        // 如果 session 为空，启动自动关闭计时器
        if (session.users.size === 0) {
          scheduleSessionClose(clientData.sessionId);
        }
        
        broadcastSessionsUpdate();
      }
    }
    
    wsClients.delete(ws);
    console.log('WebSocket client disconnected, total:', wsClients.size);
  });
});

// 存储文件信息的内存数据库
const fileStore = new Map();

// 生成6位随机数字code
function generateCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (fileStore.has(code));
  return code;
}

// 清理过期文件
function cleanExpiredFiles() {
  const now = Date.now();
  let hasChanges = false;
  for (const [code, fileInfo] of fileStore) {
    if (fileInfo.expiresAt && now > fileInfo.expiresAt) {
      const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fileStore.delete(code);
      console.log(`Cleaned expired file: ${code}`);
      hasChanges = true;
    }
  }
  if (hasChanges) {
    broadcastFilesUpdate();
  }
}

function sendUpdate() {
  broadcastFilesUpdate();
}

// 每10秒检查一次过期文件
setInterval(cleanExpiredFiles, 10000);
setInterval(sendUpdate, 10000);

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    // 修复中文文件名乱码：将 latin1 转换为 utf-8
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 限制200MB
});

app.use(cors());
app.use(express.json());

// ==================== 传输助手 Session API ====================

// 创建 Session
app.post('/api/transfer/session', (req, res) => {
  const browserId = req.headers['x-browser-id'];
  const { name } = req.body;
  
  const sessionId = generateSessionId();
  // 如果没有提供房间名，使用创建者的 userId 生成 "user-xxx的房间" 格式
  let actualName;
  if (name) {
    actualName = name;
  } else if (browserId) {
    const userId = generateUserId(browserId);
    actualName = `${generateNicknameFromUserId(userId)}的房间`;
  } else {
    actualName = '新房间';
  }
  
  const session = {
    id: sessionId,
    name: actualName,
    createdBy: browserId,
    createdAt: Date.now(),
    users: new Map(),
    messages: [],
    closeTimer: null
  };
  
  sessionStore.set(sessionId, session);
  broadcastSessionsUpdate();
  
  res.json({
    success: true,
    sessionId,
    session: getPublicSessionInfo(session)
  });
});

// 获取活跃 Session 列表
app.get('/api/transfer/sessions', (req, res) => {
  const sessions = [];
  
  for (const [id, session] of sessionStore) {
    sessions.push(getPublicSessionInfo(session));
  }
  
  // 按创建时间倒序排序
  sessions.sort((a, b) => b.createdAt - a.createdAt);
  
  res.json({ sessions });
});

// 获取 Session 详情
app.get('/api/transfer/session/:id', (req, res) => {
  const { id } = req.params;
  const browserId = req.headers['x-browser-id'];
  const session = sessionStore.get(id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // 使用 hash 后的 userId 来判断 isSelf
  const currentUserId = browserId ? generateUserId(browserId) : null;
  res.json({
    success: true,
    session: getSessionDetail(session, currentUserId)
  });
});

// 根据 userId 生成昵称（user- + userId前4位）
function generateNicknameFromUserId(userId) {
  return `user-${userId.substring(0, 4)}`;
}

// 根据 browserId 生成用户 ID（使用 djb2 hash，与前端保持一致）
function generateUserId(browserId) {
  // 简单的 djb2 hash 算法
  let hash = 5381;
  for (let i = 0; i < browserId.length; i++) {
    hash = ((hash << 5) + hash) + browserId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  // 转换为16进制字符串，取前8位
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return hex.substring(0, 8);
}

// 加入 Session
app.post('/api/transfer/session/:id/join', (req, res) => {
  const { id } = req.params;
  const browserId = req.headers['x-browser-id'];
  const { nickname } = req.body;
  
  if (!browserId) {
    return res.status(400).json({ error: 'Missing browser ID' });
  }
  
  // 根据 browserId 生成稳定的用户 ID
  const userId = generateUserId(browserId);
  
  const session = sessionStore.get(id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // 取消自动关闭计时器（如果有）
  cancelSessionClose(id);
  
  // 检查是否已在 session 中
  const isExistingUser = session.users.has(userId);
  
  // 确定昵称：如果是已存在的用户且没有传入新昵称，保留旧昵称；否则使用 userId 生成
  let actualNickname;
  if (isExistingUser && !nickname) {
    actualNickname = session.users.get(userId).nickname;
  } else if (nickname) {
    actualNickname = nickname;
  } else {
    actualNickname = generateNicknameFromUserId(userId);
  }
  
  // 添加/更新用户
  session.users.set(userId, {
    id: userId,
    browserId: browserId, // 保存原始 browserId
    nickname: actualNickname,
    joinedAt: isExistingUser ? session.users.get(userId).joinedAt : Date.now(),
    lastSeen: Date.now()
  });
  
  // 广播用户加入
  if (!isExistingUser) {
    broadcastToSession(id, {
      type: 'user-joined',
      sessionId: id,
      user: { id: userId, nickname: actualNickname }
    });
  }
  
  broadcastSessionsUpdate();
  
  res.json({
    success: true,
    session: getSessionDetail(session, userId)
  });
});

// 离开 Session
app.post('/api/transfer/session/:id/leave', (req, res) => {
  const { id } = req.params;
  const browserId = req.headers['x-browser-id'];
  
  if (!browserId) {
    return res.json({ success: true });
  }
  
  const userId = generateUserId(browserId);
  const session = sessionStore.get(id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.users.has(userId)) {
    session.users.delete(userId);
    
    // 广播用户离开
    broadcastToSession(id, {
      type: 'user-left',
      sessionId: id,
      userId: userId
    });
    
    // 如果 session 为空，启动自动关闭计时器
    if (session.users.size === 0) {
      scheduleSessionClose(id);
    }
    
    broadcastSessionsUpdate();
  }
  
  res.json({ success: true });
});

// 发送消息
app.post('/api/transfer/session/:id/message', (req, res) => {
  const { id } = req.params;
  const browserId = req.headers['x-browser-id'];
  const { type = 'text', content, fileName, fileSize, mimeType, fileCode } = req.body;
  
  if (!browserId) {
    return res.status(400).json({ error: 'Missing browser ID' });
  }
  
  const userId = generateUserId(browserId);
  const session = sessionStore.get(id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (!session.users.has(userId)) {
    return res.status(403).json({ error: 'Not in session' });
  }
  
  const user = session.users.get(userId);
  const message = {
    id: crypto.randomBytes(8).toString('hex'),
    sessionId: id,
    type, // 'text' | 'image' | 'file'
    senderId: userId,
    senderName: user.nickname,
    content,
    timestamp: Date.now(),
    fileName,
    fileSize,
    mimeType,
    fileCode
  };
  
  session.messages.push(message);
  
  // 广播新消息
  broadcastToSession(id, {
    type: 'new-message',
    sessionId: id,
    message
  });
  
  res.json({ success: true, message });
});

// 上传文件到 Session
app.post('/api/transfer/session/:id/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { id } = req.params;
  const browserId = req.headers['x-browser-id'];
  
  if (!browserId) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Missing browser ID' });
  }
  
  const userId = generateUserId(browserId);
  const session = sessionStore.get(id);
  
  if (!session) {
    // 清理上传的文件
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (!session.users.has(userId)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Not in session' });
  }

  // 生成文件 code
  const fileCode = generateCode();
  const fileInfo = {
    code: fileCode,
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
    uploads: 0,
    maxDownloads: -1, // Session 文件不限制下载次数
    createdAt: Date.now(),
    expiresAt: null, // Session 文件跟随 Session 生命周期
    ownerId: browserId,
    sessionId: id // 关联到 session
  };

  fileStore.set(fileCode, fileInfo);

  const user = session.users.get(userId);
  
  // 创建文件消息
  const messageType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
  const message = {
    id: crypto.randomBytes(8).toString('hex'),
    sessionId: id,
    type: messageType,
    senderId: userId,
    senderName: user.nickname,
    content: `/api/download/${fileCode}`,
    timestamp: Date.now(),
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    fileCode
  };
  
  session.messages.push(message);
  
  // 广播新消息
  broadcastToSession(id, {
    type: 'new-message',
    sessionId: id,
    message
  });

  res.json({
    success: true,
    fileCode,
    message
  });
});

// ==================== 文件分享 API ====================
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));
  
  // 所有非 API 路由返回 index.html (支持 SPA)
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    } else {
      next();
    }
  });
}

// 上传文件
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const code = generateCode();
  const { expiresIn = 3600, maxDownloads = 1 } = req.body;
  
  const fileInfo = {
    code,
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
    uploads: 0,
    maxDownloads: maxDownloads === 'unlimited' ? -1 : parseInt(maxDownloads),
    createdAt: Date.now(),
    expiresAt: expiresIn === 'unlimited' ? null : Date.now() + parseInt(expiresIn) * 1000,
    ownerId: req.headers['x-browser-id'] || generateOwnerId()
  };

  fileStore.set(code, fileInfo);

  // 广播文件列表更新
  broadcastFilesUpdate();

  res.json({
    success: true,
    code,
    ownerId: fileInfo.ownerId,
    fileInfo: getPublicFileInfo(fileInfo)
  });
});

// 获取所有文件列表
app.get('/api/files', (req, res) => {
  const browserId = req.headers['x-browser-id'];
  const files = [];
  
  for (const [code, fileInfo] of fileStore) {
    const now = Date.now();
    // 没有过期时间（无限制）或未过期
    if (!fileInfo.expiresAt || now <= fileInfo.expiresAt) {
      const isOwner = fileInfo.ownerId === browserId;
      files.push({
        ...getPublicFileInfo(fileInfo),
        isOwner
      });
    }
  }
  
  // 按创建时间倒序排序
  files.sort((a, b) => b.createdAt - a.createdAt);
  
  res.json({ files });
});

// 获取文件信息
app.get('/api/file/:code', (req, res) => {
  const { code } = req.params;
  const browserId = req.headers['x-browser-id'];
  const fileInfo = fileStore.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const now = Date.now();
  if (fileInfo.expiresAt && now > fileInfo.expiresAt) {
    // 清理过期文件
    const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fileStore.delete(code);
    return res.status(410).json({ error: 'File has expired' });
  }

  const isOwner = fileInfo.ownerId === browserId;
  res.json({
    fileInfo: {
      ...getPublicFileInfo(fileInfo),
      isOwner
    }
  });
});

// 下载文件
app.get('/api/download/:code', (req, res) => {
  const { code } = req.params;
  const browserId = req.headers['x-browser-id'];
  const isPreview = req.query.preview === 'true';
  const fileInfo = fileStore.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  const now = Date.now();
  if (fileInfo.expiresAt && now > fileInfo.expiresAt) {
    const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fileStore.delete(code);
    return res.status(410).json({ error: 'File has expired' });
  }

  const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  // 判断是否为上传者
  const isOwner = fileInfo.ownerId === browserId;
  
  // 判断是否为图片文件
  const isImageFile = fileInfo.mimeType.startsWith('image/');
  
  // 检查下载次数（上传者下载或图片预览不消耗下载次数）
  const shouldCountDownload = !isOwner && !(isPreview && isImageFile);
  
  if (shouldCountDownload && fileInfo.maxDownloads > 0 && fileInfo.uploads >= fileInfo.maxDownloads) {
    // 下载次数耗完，设置过期时间为1分钟后（如果当前过期时间大于1分钟或无限制）
    const oneMinuteLater = Date.now() + 60 * 1000;
    if (!fileInfo.expiresAt || fileInfo.expiresAt > oneMinuteLater) {
      fileInfo.expiresAt = oneMinuteLater;
      fileStore.set(code, fileInfo);
      // 广播文件列表更新和特定文件更新
      broadcastFilesUpdate();
      broadcastFileUpdate(code, fileInfo);
    }
    return res.status(403).json({ error: 'Download limit reached' });
  }

  // 增加下载计数（仅当需要计数时）
  if (shouldCountDownload) {
    fileInfo.uploads++;
    fileStore.set(code, fileInfo);
    // 广播文件列表更新和特定文件更新
    broadcastFilesUpdate();
    broadcastFileUpdate(code, fileInfo);
  }

  // 使用 RFC 5987 编码处理中文文件名
  const encodedFilename = encodeURIComponent(fileInfo.originalName);
  res.setHeader('Content-Type', fileInfo.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
  res.sendFile(filePath);
});

// 更新文件设置
app.put('/api/file/:code', (req, res) => {
  const { code } = req.params;
  const browserId = req.headers['x-browser-id'];
  const { expiresIn, maxDownloads } = req.body;
  
  const fileInfo = fileStore.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (fileInfo.ownerId !== browserId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (expiresIn !== undefined) {
    fileInfo.expiresAt = expiresIn === 'unlimited' ? null : fileInfo.createdAt + parseInt(expiresIn) * 1000;
  }
  
  if (maxDownloads !== undefined) {
    fileInfo.maxDownloads = maxDownloads === 'unlimited' ? -1 : parseInt(maxDownloads);
  }

  fileStore.set(code, fileInfo);
  
  // 广播文件列表更新
  broadcastFilesUpdate();
  
  res.json({ success: true, fileInfo: getPublicFileInfo(fileInfo) });
});

// 删除文件
app.delete('/api/file/:code', (req, res) => {
  const { code } = req.params;
  const browserId = req.headers['x-browser-id'];
  const fileInfo = fileStore.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (fileInfo.ownerId !== browserId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  fileStore.delete(code);
  
  // 广播文件列表更新
  broadcastFilesUpdate();
  
  res.json({ success: true });
});

// 辅助函数：获取公开的文件信息（不包含敏感信息）
function getPublicFileInfo(fileInfo) {
  return {
    code: fileInfo.code,
    originalName: fileInfo.originalName,
    size: fileInfo.size,
    mimeType: fileInfo.mimeType,
    uploads: fileInfo.uploads,
    maxDownloads: fileInfo.maxDownloads,
    createdAt: fileInfo.createdAt,
    expiresAt: fileInfo.expiresAt
  };
}

// 辅助函数：判断是否为文本文件
function isTextFile(mimeType, originalName) {
  // 检查 MIME 类型
  const textMimeTypes = [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/javascript',
    'application/xml',
    'text/xml',
    'text/csv'
  ];
  
  if (textMimeTypes.some(type => mimeType.includes(type))) {
    return true;
  }
  
  // 检查文件扩展名
  const textExtensions = ['.txt', '.md', '.markdown', '.json', '.js', '.ts', '.jsx', '.tsx', 
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.xml', '.yaml', '.yml', 
    '.csv', '.log', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.py', 
    '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', 
    '.sql', '.vue', '.svelte'];
  
  const ext = path.extname(originalName).toLowerCase();
  return textExtensions.includes(ext);
}

// 文本文件预览大小限制（100KB）
const TEXT_PREVIEW_MAX_SIZE = 100 * 1024;

// 获取文本文件内容（预览）
app.get('/api/text/:code', (req, res) => {
  const { code } = req.params;
  const fileInfo = fileStore.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  const now = Date.now();
  if (fileInfo.expiresAt && now > fileInfo.expiresAt) {
    const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fileStore.delete(code);
    return res.status(410).json({ error: 'File has expired' });
  }

  // 检查是否为文本文件
  if (!isTextFile(fileInfo.mimeType, fileInfo.originalName)) {
    return res.status(400).json({ error: 'Not a text file' });
  }

  // 检查文件大小
  if (fileInfo.size > TEXT_PREVIEW_MAX_SIZE) {
    return res.status(413).json({ error: 'File too large for preview (max 100KB)' });
  }

  const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ 
      content, 
      mimeType: fileInfo.mimeType,
      originalName: fileInfo.originalName
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// 生成随机文件名（6-8位字母，大小写随机）
function generateRandomFilename() {
  const length = Math.floor(Math.random() * 3) + 6; // 6-8位
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 创建文本文件
app.post('/api/text', express.raw({ type: 'text/plain', limit: '100kb' }), (req, res) => {
  const content = req.body.toString('utf-8');
  const defaultFilename = generateRandomFilename() + '.txt';
  const { expiresIn = 3600, maxDownloads = 1, filename = defaultFilename } = req.query;
  
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is empty' });
  }

  const code = generateCode();
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const safeFilename = uniqueSuffix + '.txt';
  const filePath = path.join(__dirname, 'uploads', safeFilename);
  
  // 写入文件
  fs.writeFileSync(filePath, content, 'utf-8');
  
  const fileInfo = {
    code,
    originalName: filename.endsWith('.txt') ? filename : filename + '.txt',
    filename: safeFilename,
    size: Buffer.byteLength(content, 'utf-8'),
    mimeType: 'text/plain',
    uploads: 0,
    maxDownloads: maxDownloads === 'unlimited' ? -1 : parseInt(maxDownloads),
    createdAt: Date.now(),
    expiresAt: Date.now() + parseInt(expiresIn) * 1000,
    ownerId: req.headers['x-browser-id'] || generateOwnerId()
  };

  fileStore.set(code, fileInfo);
  broadcastFilesUpdate();

  res.json({
    success: true,
    code,
    ownerId: fileInfo.ownerId,
    fileInfo: getPublicFileInfo(fileInfo)
  });
});

// 生成所有者ID
function generateOwnerId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

server.listen(PORT, () => {
  console.log(`File share server running on http://localhost:${PORT}`);
});
