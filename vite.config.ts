import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        current: fileURLToPath(new URL('./index.html', import.meta.url)),
        week1: fileURLToPath(new URL('./1week/index.html', import.meta.url)),
        week2: fileURLToPath(new URL('./2week/index.html', import.meta.url)),
        week3: fileURLToPath(new URL('./3week/index.html', import.meta.url)),
        week4: fileURLToPath(new URL('./4week/index.html', import.meta.url)),
        week5: fileURLToPath(new URL('./5week/index.html', import.meta.url)),
        cam: fileURLToPath(new URL('./cam/index.html', import.meta.url)),
        camConan: fileURLToPath(new URL('./cam/conan/index.html', import.meta.url)),
        camFace: fileURLToPath(new URL('./cam/face/index.html', import.meta.url)),
        camSolar: fileURLToPath(new URL('./cam/solar/index.html', import.meta.url)),
        camVortex: fileURLToPath(new URL('./cam/vortex/index.html', import.meta.url)),
        camBlur: fileURLToPath(new URL('./cam/blur/index.html', import.meta.url)),
        camTyping: fileURLToPath(new URL('./cam/typing/index.html', import.meta.url)),
        camLevitation: fileURLToPath(new URL('./cam/levitation/index.html', import.meta.url)),
      },
    },
  },
})
