import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        'dressing-room': 'src/dressing-room/index.html',
        background: 'src/background/background.ts',
        content: 'src/content/index.ts',
      },
    },
  },
})
