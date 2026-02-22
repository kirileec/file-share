# 文件分享服务

一个简单的前后端分离文件分享服务。

## 技术栈

- **前端**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **后端**: Node.js + Express

## 功能特点

- 拖拽或点击上传文件
- 自动生成6位随机code作为分享标识
- 支持设置过期时间（10分钟/30分钟/1小时/3小时）
- 支持设置下载次数限制（1次/3次/无限制）
- 文件自动过期删除
- 二维码分享
- 上传进度和速度显示
- 图片预览

## 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 2. 启动服务


```bash
# 终端1 - 启动后端
cd server
npm run dev

# 终端2 - 启动前端
cd client
npm run dev
```

### 3. 访问应用

- 前端地址: http://localhost:5173
- 后端地址: http://localhost:3001

## API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/upload | 上传文件 |
| GET | /api/files | 获取文件列表 |
| GET | /api/file/:code | 获取文件信息 |
| PUT | /api/file/:code | 更新文件设置 |
| DELETE | /api/file/:code | 删除文件 |
| GET | /api/download/:code | 下载文件 |

## 目录结构

```
file-share/
├── server/                 # 后端代码
│   ├── index.js           # Express 服务器
│   ├── package.json
│   └── uploads/           # 上传文件存储目录
├── client/                # 前端代码
│   ├── src/
│   │   ├── components/    # React 组件
│   │   │   └── ui/        # UI 组件（shadcn/ui）
│   │   ├── pages/         # 页面组件
│   │   ├── lib/           # 工具函数和API
│   │   └── main.tsx       # 入口文件
│   ├── vite.config.ts     # Vite 配置（含代理）
│   └── package.json
└── Dockerfile              # Dockerfile
```

## docker compose

```yaml
services:
  file-share:
    image: slk1133/file-share:latest
    container_name: file-share
    ports:
      - 23001:3001
    restart: always
```