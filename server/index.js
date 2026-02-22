import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 存储所有WebSocket连接，以及它们订阅的文件code
const wsClients = new Map(); // ws -> Set of subscribed codes

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
  wsClients.forEach((subscribedCodes, client) => {
    if (client.readyState === 1 && subscribedCodes.has(code)) {
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
  wsClients.set(ws, new Set());
  console.log('WebSocket client connected, total:', wsClients.size);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'subscribe' && message.code) {
        const subscribedCodes = wsClients.get(ws);
        if (subscribedCodes) {
          subscribedCodes.add(message.code);
        }
      }
      if (message.type === 'unsubscribe' && message.code) {
        const subscribedCodes = wsClients.get(ws);
        if (subscribedCodes) {
          subscribedCodes.delete(message.code);
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
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

// 在 production 环境下提供静态文件服务
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
    expiresAt: Date.now() + parseInt(expiresIn) * 1000,
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
    if (fileInfo.expiresAt && now <= fileInfo.expiresAt) {
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
    // 下载次数耗完，设置过期时间为1分钟后（如果当前过期时间大于1分钟）
    const oneMinuteLater = Date.now() + 60 * 1000;
    if (fileInfo.expiresAt > oneMinuteLater) {
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

  res.download(filePath, fileInfo.originalName);
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
    fileInfo.expiresAt = fileInfo.createdAt + parseInt(expiresIn) * 1000;
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

// 生成所有者ID
function generateOwnerId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

server.listen(PORT, () => {
  console.log(`File share server running on http://localhost:${PORT}`);
});
