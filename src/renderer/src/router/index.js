import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'search',
    component: () => import('../pages/TransientSearchPage.vue'),
    meta: {
      title: 'Seeksy',
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../pages/SettingsPage.vue'),
    meta: {
      title: 'Settings - Seeksy',
    },
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.afterEach((to, from) => {
  document.title = to.meta.title || 'Seeksy'
})
