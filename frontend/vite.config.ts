import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // admin.html is a second entry (served at /admin via vercel.json) so
      // the admin page never touches the public bundle.
      input: {
        index: 'index.html',
        admin: 'admin.html',
      },
    },
  },
})
