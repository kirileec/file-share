import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { FileListPage } from './pages/FileListPage'
import { FileInfoPage } from './pages/FileInfoPage'
import { TransferPage } from './pages/TransferPage'
import { TransferRoomPage } from './pages/TransferRoomPage'

// 初始化 vConsole（移动端调试工具）
import VConsole from 'vconsole'

// 在开发环境或移动端启用 vConsole
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
if (import.meta.env.DEV && isMobile) {
  new VConsole()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FileListPage />} />
        <Route path="/file/:code" element={<FileInfoPage />} />
        <Route path="/transfer" element={<TransferPage />} />
        <Route path="/transfer/:sessionId" element={<TransferRoomPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)