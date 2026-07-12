import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/customers', name: 'customers', component: () => import('./views/CustomersView.vue') },
    { path: '/leads', name: 'leads', component: () => import('./views/LeadsView.vue') },
    { path: '/projects', name: 'projects', component: () => import('./views/ProjectsView.vue') }
  ]
})
