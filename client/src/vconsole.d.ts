declare module 'vconsole' {
  interface VConsoleOptions {
    defaultPlugins?: string[]
    onReady?: () => void
    onClearLog?: () => void
    maxLogNumber?: number
    theme?: 'light' | 'dark'
  }

  class VConsole {
    constructor(options?: VConsoleOptions)
    static version: string
    static pluginList: Record<string, unknown>
    destroy(): void
    show(): void
    hide(): void
  }

  export default VConsole
}
