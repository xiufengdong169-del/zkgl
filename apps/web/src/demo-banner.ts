import { demoMode } from './demo'

export const demoBannerText =
  '演示模式：当前页面使用样例数据展示系统成果，未连接生产 MySQL。正式上线环境为腾讯云轻量应用服务器。'

export function shouldShowDemoBanner() {
  return demoMode
}
