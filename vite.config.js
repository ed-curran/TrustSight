import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'
import {resolve} from "path";

//level (for levelgraph) needs this, which is pretty gross
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const root = resolve(__dirname, 'src');
const pagesDir = resolve(root, 'pages');
const assetsDir = resolve(root, 'assets');

export default defineConfig({
  // build: {
  //   rollupOptions: {
  //     output: {
  //       banner: 'globalThis.regeneratorRuntime=undefined;console.log(regeneratorRuntime);',
  //       intro: "window.regeneratorRuntime = undefined;"
  //     }
  //   }
  // },
  // esbuild: {
  //   banner: `var regeneratorRuntime;`,
  // },


  resolve: {
    alias: {
      '@assets': assetsDir,
      '@pages': pagesDir,
      '@': root,
      buffer: '',
      '@digitalcredentials/open-badges-context': '@digitalcredentials/open-badges-context/dist/context.js',
    },
  },
  plugins: [
    react({babel: {
        plugins: ['@babel/plugin-syntax-import-assertions'],
      },}),
    crx({ manifest }),
    nodePolyfills()
  ]
})