import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import contextMenuPlugin from './plugins/core/contextMenuPlugin'
import resultTypesPlugin from './plugins/search/resultTypesRegistry'
import { router } from './router/index'
import './assets/base.css'
import 'material-symbols'

const pinia = createPinia()
const app = createApp(App)
app.use(router)
app.use(pinia)
app.use(contextMenuPlugin)
app.use(resultTypesPlugin) // Register the result types registry
app.mount('#app')
