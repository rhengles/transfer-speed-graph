import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'core/main.js'),
      name: 'TransferSpeedGraph',
      // the proper extensions will be added
      // fileName: 'arijs-transfer-speed-graph',
      fileName: (format) => {
        if (format === 'es') return `arijs-transfer-speed-graph.js`;
        return `arijs-transfer-speed-graph.${format}.js`;
      }
    },
    minify: 'terser',
    outDir: 'core/dist',
    // rolldownOptions: {
    //   // make sure to externalize deps that shouldn't be bundled
    //   // into your library
    //   external: [],
    //   output: {
    //     // Provide global variables to use in the UMD build
    //     // for externalized deps
    //     globals: {
    //       vue: 'Vue',
    //     },
    //   },
    // },
  },
})