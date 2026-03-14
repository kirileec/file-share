import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

export function formatTimeRemaining(expiresAt: number | null): string {
  if (!expiresAt) return '无限制'
  
  const now = Date.now()
  const diff = expiresAt - now
  
  if (diff <= 0) return '已过期'
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  const remainingSeconds = seconds % 60
  const remainingMinutes = minutes % 60
  
  if (hours > 0) {
    return `${hours}小时${remainingMinutes}分钟${remainingSeconds}秒`
  }
  if (remainingMinutes > 0) {
    return `${remainingMinutes}分钟${remainingSeconds}秒`
  }
  return `${remainingSeconds}秒`
}

export function getBrowserId(): string {
  let browserId = localStorage.getItem('browserId')
  if (!browserId) {
    browserId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    localStorage.setItem('browserId', browserId)
  }
  return browserId
}

// 根据browserId生成固定的用户ID（使用简单hash，同步版本）
export function generateUserId(browserId: string): string {
  // 简单的 djb2 hash 算法
  let hash = 5381
  for (let i = 0; i < browserId.length; i++) {
    hash = ((hash << 5) + hash) + browserId.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  // 转换为16进制字符串，取前8位
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return hex.substring(0, 8)
}

export function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'spreadsheet'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive'
  return 'file'
}