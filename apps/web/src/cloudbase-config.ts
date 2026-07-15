export interface BrowserCloudbaseEnv {
  VITE_CLOUDBASE_ENV_ID?: string;
  VITE_CLOUDBASE_REGION?: string;
  VITE_CLOUDBASE_PUBLISHABLE_KEY?: string;
}

export function buildCloudbaseConfig(environment: BrowserCloudbaseEnv) {
  const env = environment.VITE_CLOUDBASE_ENV_ID?.trim();
  if (!env) throw new Error("缺少 VITE_CLOUDBASE_ENV_ID");

  const region = environment.VITE_CLOUDBASE_REGION?.trim();
  const accessKey = environment.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim();

  return {
    env,
    ...(region ? { region } : {}),
    ...(accessKey ? { accessKey } : {}),
  };
}
