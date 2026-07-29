import type { ApiResult } from '@zkgl/shared'
import { cloudbaseAuth } from './cloudbase'

const baseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function trustedApiBaseUrl() {
  if (!baseUrl) throw new Error('缺少 VITE_API_BASE_URL')
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('API 地址无效')
  }
  if (url.protocol !== 'https:') throw new Error('API 地址协议不受信任')
  return url.toString()
}

function failureMessage<T>(result: ApiResult<T>, status: number) {
  if (result.ok) return `请求失败：${status}`
  const message =
    result.error &&
    typeof result.error === 'object' &&
    typeof result.error.message === 'string' &&
    result.error.message.trim()
  return message || `请求失败：${status}`
}

export async function callApi<T>(action: string, payload?: unknown): Promise<T> {
  const apiUrl = trustedApiBaseUrl()
  const { accessToken } = await cloudbaseAuth.getAccessToken()
  if (!accessToken) throw new Error('登录状态已失效')
  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, requestId: crypto.randomUUID() })
    })
  } catch {
    throw new Error('网络请求失败，请检查网络后重试')
  }
  let result: ApiResult<T>
  try {
    result = await response.json() as ApiResult<T>
  } catch {
    throw new Error(`请求失败：${response.status}`)
  }
  if (!response.ok || !result.ok) throw new Error(failureMessage(result, response.status))
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
