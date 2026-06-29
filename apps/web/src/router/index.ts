import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/expense/create', component: () => import('../views/ExpenseCreate.vue') },
    { path: '/expense/:id', component: () => import('../views/ExpenseDetail.vue') },
    { path: '/expense/stats', component: () => import('../views/ExpenseStats.vue') },
    { path: '/expense/export', component: () => import('../views/ExpenseExport.vue') },
    { path: '/reimbursements', component: () => import('../views/Reimbursements.vue') },
    { path: '/sales', component: () => import('../views/SalesList.vue') },
    { path: '/sales/create', component: () => import('../views/SaleCreate.vue') },
    { path: '/sales/:id', component: () => import('../views/SaleDetail.vue') },
    { path: '/bracelets', component: () => import('../views/Bracelets.vue') },
    { path: '/bracelets/:code', component: () => import('../views/BraceletDetail.vue') },
    { path: '/settings', component: () => import('../views/Settings.vue') },
    { path: '/logs', component: () => import('../views/Logs.vue') },
  ],
})

router.beforeEach(async (to) => {
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token) return '/'
})

export default router
