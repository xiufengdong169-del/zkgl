import cloudbase from '@cloudbase/js-sdk'
import { buildCloudbaseConfig } from './cloudbase-config'

let cloudbaseApp: ReturnType<typeof cloudbase.init> | null = null

export function getCloudbaseApp() {
  cloudbaseApp ??= cloudbase.init(buildCloudbaseConfig(import.meta.env))
  return cloudbaseApp
}

export function getCloudbaseAuth() {
  return getCloudbaseApp().auth
}
