/// <reference types="vite/client" />

type WebMCPToolResult = {
  content: Array<{ type: 'text'; text: string }>
}

type WebMCPTool = {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute: (
    input: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ) => Promise<WebMCPToolResult> | WebMCPToolResult
}

interface ModelContext {
  registerTool: (
    tool: WebMCPTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => Promise<void>
}

interface Document {
  modelContext?: ModelContext
}
