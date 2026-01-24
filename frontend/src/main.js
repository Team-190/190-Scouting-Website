import { mount } from 'svelte'
import './app.css'
import App from './pages/dash/event-select-screen.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app