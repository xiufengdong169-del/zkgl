import cloudbase from '@cloudbase/js-sdk'
import { buildCloudbaseConfig } from './cloudbase-config'

export const cloudbaseApp = cloudbase.init(buildCloudbaseConfig(import.meta.env))

export const cloudbaseAuth = cloudbaseApp.auth
