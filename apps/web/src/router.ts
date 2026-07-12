import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/customers', name: 'customers', component: () => import('./views/CustomersView.vue') },
    { path: '/leads', name: 'leads', component: () => import('./views/LeadsView.vue') },
    { path: '/projects', name: 'projects', component: () => import('./views/ProjectsView.vue') },
    { path: '/approvals', name: 'approvals', component: () => import('./views/ApprovalsView.vue') },
    { path: '/bids', name: 'bids', component: () => import('./views/BidsView.vue') },
    { path: '/contracts', name: 'contracts', component: () => import('./views/ContractsView.vue') },
    { path: '/delivery', name: 'delivery', component: () => import('./views/DeliveryView.vue') },
    { path: '/finance', name: 'finance', component: () => import('./views/FinanceView.vue') },
    { path: '/settlements', name: 'settlements', component: () => import('./views/SettlementsView.vue') }
  ]
})
