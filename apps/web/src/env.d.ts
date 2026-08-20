/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID: string
  readonly VITE_CLOUDBASE_REGION?: string
  readonly VITE_CLOUDBASE_PUBLISHABLE_KEY?: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_DEMO_MODE?: string
  readonly VITE_ALLOW_LOCAL_HTTP_API?: string
  readonly VITE_LOCAL_AUTH_MODE?: string
  readonly VITE_LOCAL_AUTH_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
