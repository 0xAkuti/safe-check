import { defineConfig } from 'vite'

export default defineConfig({
  // an onchain site is one document: nothing can be loaded by URL
  build: { target: 'es2022', modulePreload: false, rolldownOptions: { output: { codeSplitting: false } } },
})
