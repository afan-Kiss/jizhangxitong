import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

function getAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return String(Date.now())
  }
}

const appVersion = getAppVersion()

/** 注入 APP 版本号，便于手机端检测部署更新并清理旧缓存 */
function injectAppVersion() {
  return {
    name: 'inject-app-version',
    config() {
      return { define: { __APP_VERSION__: JSON.stringify(appVersion) } }
    },
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `    <meta name="app-version" content="${appVersion}" />\n  </head>`,
      )
    },
  }
}

export default defineConfig({
  base: process.env.VITE_APP_BASE || '/',
  plugins: [vue(), injectAppVersion()],
  resolve: {
    alias: {
      '@jade-account/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
