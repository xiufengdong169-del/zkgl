import cloudbase from '@cloudbase/js-sdk'

const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID

if (!envId) {
  throw new Error('缺少 VITE_CLOUDBASE_ENV_ID')
}

const accessKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY

export const cloudbaseApp = cloudbase.init({
  env: envId,
  ...(accessKey ? { accessKey } : {})
})

export const cloudbaseAuth = cloudbaseApp.auth
