import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/bi/drilldown', component: () => import('../views/BiDrilldown.vue') },
    { path: '/expenses', redirect: '/expense/stats' },
    { path: '/expense/create', component: () => import('../views/ExpenseCreate.vue') },
    { path: '/expense/:id', component: () => import('../views/ExpenseDetail.vue') },
    { path: '/expense/stats', component: () => import('../views/ExpenseStats.vue') },
    {
      path: '/reimbursements',
      component: () => import('../views/ModuleDisabled.vue'),
      props: { moduleName: '报销', message: '报销功能已下线，现在统一使用专属经费记支出。' },
    },
    {
      path: '/expense/export',
      component: () => import('../views/ModuleDisabled.vue'),
      props: { moduleName: '报销导出', message: '报销功能已下线，现在统一使用专属经费记支出。' },
    },
    { path: '/sales', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '销售' } },
    { path: '/sales/create', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '销售' } },
    { path: '/sales/:id', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '销售' } },
    { path: '/bracelets', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '镯子' } },
    { path: '/bracelets/:code', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '镯子' } },
    { path: '/scan', component: () => import('../views/ScanBinding.vue') },
    { path: '/settings', component: () => import('../views/Settings.vue') },
    { path: '/logs', component: () => import('../views/Logs.vue') },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.sessionReady) {
    try {
      await auth.initSession()
    } catch {
      auth.logout()
      auth.sessionReady = true
    }
  }

  const token = auth.token
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token && auth.user) return '/'
})

export default router
