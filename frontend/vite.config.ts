import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }): UserConfig =>
  mode === 'lab'
    ? {
        // lab.html (served at /lab via vercel.json) is built in a second pass
        // (`vite build --mode lab`, see package.json) because it imports
        // src/data/heroCircuits.ts, which index.html also imports. As a third
        // input here, Rolldown would split that module into a shared chunk
        // and change every public chunk hash. Its own pass leaves the first
        // build's output untouched.
        build: {
          emptyOutDir: false,
          copyPublicDir: false,
          rolldownOptions: { input: { lab: 'lab.html' } },
        },
      }
    : {
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
      },
)
