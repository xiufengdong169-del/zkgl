import type { ApiResult } from '@zkgl/shared'
import { cloudbaseAuth } from './cloudbase'

const baseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

export async function callApi<T>(action: string, payload?: unknown): Promise<T> {
  if (!baseUrl) throw new Error('缺少 VITE_API_BASE_URL')
  const { accessToken } = await cloudbaseAuth.getAccessToken()
  if (!accessToken) throw new Error('登录状态已失效')
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload, requestId: crypto.randomUUID() })
  })
  let result: ApiResult<T>
  try {
    result = await response.json() as ApiResult<T>
  } catch {
    throw new Error(`请求失败：${response.status}`)
  }
  if (!response.ok || !result.ok) throw new Error(result.ok ? `请求失败：${response.status}` : result.error.message)
  return result.data
}

export function openTrustedDownloadUrl(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('下载地址无效')
  }
  if (url.protocol !== 'https:') throw new Error('下载地址协议不受信任')
  globalThis.open(url.toString(), '_blank', 'noopener,noreferrer')
}
