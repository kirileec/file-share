import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { FileListPage } from './pages/FileListPage'
import { FileInfoPage } from './pages/FileInfoPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FileListPage />} />
        <Route path="/file/:code" element={<FileInfoPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)