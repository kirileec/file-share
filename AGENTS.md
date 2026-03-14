# AGENTS.md - 项目上下文说明

本文档为 AI 代理提供项目上下文，帮助快速理解和操作本代码库。

## 项目概述

**文件分享服务** - 一个轻量级的临时文件分享平台，支持快速上传文件并生成分享链接。

### 核心特性
- 拖拽/点击上传文件（最大 200MB）
- 自动生成 6 位随机 code 作为分享标识
- 支持设置过期时间（10分钟/30分钟/1小时/3小时）
- 支持设置下载次数限制（1次/3次/无限制）
- 文件自动过期删除
- 二维码分享
- WebSocket 实时更新
- 图片预览功能

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 样式方案 | Tailwind CSS 4 + shadcn/ui |
| 状态管理 | React State + Hooks |
| 路由 | react-router-dom 7 |
| 后端框架 | Express.js |
| 实时通信 | WebSocket (ws) |
| 文件处理 | Multer |
| 容器化 | Docker (多阶段构建) |

## 目录结构

```
file-share/
├── client/                    # 前端项目
│   ├── src/
│   │   ├── components/        # React 组件
│   │   │   ├── EditFileDialog.tsx    # 编辑文件设置对话框
│   │   │   ├── FileCard.tsx          # 文件卡片组件
│   │   │   ├── FileDropZone.tsx      # 文件拖拽上传区域
│   │   │   ├── QRCodeDialog.tsx      # 二维码对话框
│   │   │   ├── UploadSettingsDialog.tsx  # 上传设置对话框
│   │   │   └── ui/                   # shadcn/ui 组件
│   │   ├── lib/
│   │   │   ├── api.ts                # API 调用封装
│   │   │   └── utils.ts              # 工具函数
│   │   ├── pages/
│   │   │   ├── FileInfoPage.tsx      # 文件详情页
│   │   │   └── FileListPage.tsx      # 文件列表页（主页）
│   │   ├── main.tsx                  # 入口文件
│   │   └── index.css                 # 全局样式
│   ├── vite.config.ts            # Vite 配置（含 API 代理）
│   └── package.json
├── server/                    # 后端项目
│   ├── index.js               # Express 服务器（单文件架构）
│   ├── uploads/               # 上传文件存储目录
│   └── package.json
├── Dockerfile                 # Docker 多阶段构建
└── README.md
```

## 构建与运行命令

### 开发环境

```bash
# 安装依赖
cd server && npm install
cd ../client && npm install

# 启动后端（端口 3001）
cd server && npm run dev

# 启动前端（端口 5173）
cd client && npm run dev
```

### 生产构建

```bash
# 构建前端
cd client && npm run build

# 启动后端（生产模式）
cd server && npm start
```

### Docker 部署

```bash
# 构建镜像
docker build -t file-share .

# 运行容器
docker run -p 23001:3001 file-share

# 或使用 docker-compose
# docker-compose up -d
```

## API 接口

| 方法 | 路径 | 描述 | 请求体/参数 |
|------|------|------|-------------|
| POST | `/api/upload` | 上传文件 | FormData: file, expiresIn, maxDownloads |
| GET | `/api/files` | 获取文件列表 | Header: x-browser-id |
| GET | `/api/file/:code` | 获取文件信息 | Header: x-browser-id |
| PUT | `/api/file/:code` | 更新文件设置 | Body: { expiresIn?, maxDownloads? } |
| DELETE | `/api/file/:code` | 删除文件 | Header: x-browser-id |
| GET | `/api/download/:code` | 下载文件 | Query: ?preview=true (图片预览) |

### WebSocket 消息类型

```typescript
// 服务器 -> 客户端
{ type: 'files-updated' }                    // 文件列表更新
{ type: 'file-updated', code, fileInfo }     // 特定文件更新

// 客户端 -> 服务器
{ type: 'subscribe', code }                  // 订阅文件更新
{ type: 'unsubscribe', code }                // 取消订阅
```

## 关键架构决策

### 1. 文件所有权机制
- 使用 `x-browser-id` 请求头标识用户身份
- 首次访问时在客户端生成唯一 ID 并存储到 localStorage
- 只有文件所有者才能修改/删除文件

### 2. 过期与清理
- 服务端每 10 秒检查过期文件并清理
- 下载次数耗尽后，文件会在 1 分钟后过期删除
- 内存存储（`Map`），重启后数据丢失

### 3. 前后端通信
- 开发环境：Vite 代理 `/api` 请求到后端
- 生产环境：Express 直接托管前端静态文件
- WebSocket 用于实时推送文件状态更新

### 4. 文件存储
- 存储路径：`server/uploads/`
- 文件命名：`{timestamp}-{random}{ext}`
- 数据库：内存 Map（非持久化）

## 开发约定

### 前端
- 组件使用函数式组件 + Hooks
- 样式使用 Tailwind CSS 类名
- UI 组件基于 shadcn/ui（Radix UI + Tailwind）
- API 调用统一通过 `src/lib/api.ts`

### 后端
- 单文件架构（`server/index.js`）
- ES Module 语法（`type: "module"`）
- 无数据库依赖，使用内存存储

### 代码风格
- TypeScript 严格模式
- ESLint 配置：`eslint.config.js`
- 组件命名：PascalCase
- 函数命名：camelCase

## 常见任务

### 添加新的 API 端点
1. 在 `server/index.js` 中添加路由处理
2. 在 `client/src/lib/api.ts` 中添加对应的调用函数
3. 确保请求包含 `x-browser-id` 头（如需权限验证）

### 添加新的 UI 组件
1. 在 `client/src/components/` 创建组件
2. 使用 shadcn/ui 基础组件（`components/ui/`）
3. 遵循现有的组件结构和命名规范

### 修改文件存储逻辑
- 当前使用内存 Map 存储，位于 `server/index.js` 的 `fileStore` 变量
- 如需持久化，考虑迁移到 SQLite/Redis

## 注意事项

- 文件上传限制：200MB（在 Multer 配置中设置）
- 生产环境需要确保 `server/uploads/` 目录存在且有写入权限
- 时区设置：Dockerfile 中设置为 Asia/Shanghai
- 默认端口：前端 5173，后端 3001
