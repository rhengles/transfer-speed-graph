import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const LIB_NAME = 'arijs-transfer-speed-graph'

// core/package.json has "type": "module", so Node reads any .js file in the package
// as ESM. The UMD bundle used by `require()` must therefore be .cjs. The same bundle
// is also published as .umd.js, the path used by <script> tags and CDN links.
function umdJsCopy() {
  return {
    name: 'umd-js-copy',
    generateBundle(outputOptions, bundle) {
      if (outputOptions.format !== 'umd') return
      const chunk = bundle[`${LIB_NAME}.umd.cjs`]
      if (!chunk || chunk.type !== 'chunk') {
        this.error(`${LIB_NAME}.umd.cjs not found in the UMD bundle`)
      }
      this.emitFile({
        type: 'asset',
        fileName: `${LIB_NAME}.umd.js`,
        source: chunk.code,
      })
    },
  }
}

export default defineConfig({
  plugins: [umdJsCopy()],
  build: {
    // The bundle must run on Windows 7 browsers (last versions: Chrome 109, Firefox 115 ESR).
    target: ['chrome109', 'edge109', 'firefox115', 'safari16'],
    lib: {
      entry: resolve(import.meta.dirname, 'core/main.js'),
      name: 'TransferSpeedGraph',
      formats: ['es', 'umd'],
      fileName: (format) => {
        if (format === 'es') return `${LIB_NAME}.js`
        return `${LIB_NAME}.${format}.cjs`
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