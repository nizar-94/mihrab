import { defineConfig } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('src/main/index.js') } } },
  preload: {
    build: {
      rollupOptions: {
        input: {
          notification: resolve('src/preload/notification.js'),
          settings: resolve('src/preload/settings.js')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          notification: resolve('src/renderer/notification/index.html'),
          settings: resolve('src/renderer/settings/index.html')
        }
      }
    }
  }
});
