import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const OFFLINE_MSG = '该模块已下线，现在系统只记录项目资金支出。'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
    { path: '/finance-share/:token', component: () => import('../views/FinanceShare.vue'), meta: { public: true } },
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/expenses', redirect: '/expense/stats' },
    { path: '/expense/create', component: () => import('../views/ExpenseCreate.vue') },
    { path: '/expense/:id', component: () => import('../views/ExpenseDetail.vue') },
    { path: '/expense/stats', component: () => import('../views/ExpenseStats.vue') },
    { path: '/bi/drilldown', redirect: '/expense/stats' },
    {
      path: '/reimbursements',
      component: () => import('../views/ModuleDisabled.vue'),
      props: { moduleName: '报销', message: OFFLINE_MSG },
    },
    {
      path: '/expense/export',
      component: () => import('../views/ModuleDisabled.vue'),
      props: { moduleName: '导出', message: OFFLINE_MSG },
    },
    { path: '/sales', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '销售', message: OFFLINE_MSG } },
    { path: '/sales/create', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '销售', message: OFFLINE_MSG } },
    { path: '/sales/:id', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '销售', message: OFFLINE_MSG } },
    { path: '/bracelets', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '货品', message: OFFLINE_MSG } },
    { path: '/bracelets/:code', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '货品', message: OFFLINE_MSG } },
    { path: '/scan', component: () => import('../views/ModuleDisabled.vue'), props: { moduleName: '扫码', message: OFFLINE_MSG } },
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
