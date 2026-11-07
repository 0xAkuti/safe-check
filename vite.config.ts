import { defineConfig } from 'vite'

export default defineConfig({
  // the page's CSP would block Vite's own scripts and websocket, so only `vite build` keeps it
  plugins: [
    {
      name: 'dev-without-csp',
      apply: 'serve',
      transformIndexHtml: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
    },
  ],
  // an onchain site is one document: nothing can be loaded by URL
  build: { target: 'es2022', modulePreload: false, rolldownOptions: { output: { codeSplitting: false } } },
})
