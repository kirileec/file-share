import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface MarkdownRendererProps {
  content: string
}

// 代码块复制按钮组件
function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
      title={copied ? '已复制' : '复制代码'}
    >
      {copied ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 自定义代码块样式
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !className
            const codeString = String(children).replace(/\n$/, '')
            
            if (isInline) {
              return (
                <code 
                  className="bg-black/20 px-1.5 py-0.5 rounded text-sm font-mono border border-white/10"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            
            return (
              <div className="relative">
                <code className={`${className} block bg-black/30 p-3 pr-10 rounded-md overflow-x-auto text-sm font-mono border border-white/10`} {...props}>
                  {children}
                </code>
                <CodeBlockCopyButton code={codeString} />
              </div>
            )
          },
          // 预标签包装代码块
          pre({ children }) {
            return <pre className="my-2">{children}</pre>
          },
          // 自定义链接样式
          a({ href, children }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-current hover:opacity-80 underline font-medium"
              >
                {children}
              </a>
            )
          },
          // 自定义表格样式
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border border-white/20">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border border-white/20 px-3 py-1.5 bg-black/20 text-left font-semibold">
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td className="border border-white/20 px-3 py-1.5">
                {children}
              </td>
            )
          },
          // 自定义列表样式
          ul({ children }) {
            return <ul className="list-disc list-inside my-1.5 space-y-0.5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside my-1.5 space-y-0.5">{children}</ol>
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>
          },
          // 自定义引用样式
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-white/30 pl-3 my-2 py-1 bg-black/10 rounded-r italic">
                {children}
              </blockquote>
            )
          },
          // 自定义标题样式
          h1({ children }) {
            return <h1 className="text-xl font-bold my-2 pb-1 border-b border-white/20">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold my-2 pb-0.5 border-b border-white/10">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-base font-bold my-1.5">{children}</h3>
          },
          h4({ children }) {
            return <h4 className="text-sm font-bold my-1">{children}</h4>
          },
          // 自定义段落样式
          p({ children }) {
            return <p className="my-1 leading-relaxed">{children}</p>
          },
          // 分割线
          hr() {
            return <hr className="my-3 border-white/20" />
          },
          // 强调
          strong({ children }) {
            return <strong className="font-bold">{children}</strong>
          },
          em({ children }) {
            return <em className="italic">{children}</em>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
