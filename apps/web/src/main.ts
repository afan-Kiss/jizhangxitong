import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Vant from 'vant'
import 'vant/lib/index.css'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import { registerGlobalErrorHandlers, showBootstrapError, syncAppVersion } from './utils/bootstrap-error'

syncAppVersion()

try {
  const app = createApp(App)
  registerGlobalErrorHandlers(app)
  app.use(createPinia())
  app.use(router)
  app.use(Vant)
  app.mount('#app')
} catch (err) {
  console.error('[bootstrap-failed]', err)
  showBootstrapError('页面加载失败，请刷新重试；如果还不行，请联系管理员。')
}
