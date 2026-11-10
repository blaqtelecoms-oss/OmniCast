import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import http from 'node:http'

// Sandbox preview only (BASE44_PREVIEW_MODE=1): the preview serves the app on
// port 3000 and routes /api through the local bridge in ./server, which talks to
// this app's hosted Base44 backend with its access token held server-side.
// Unset — the Base44 platform, a plain `npm run dev`, a build — none of this applies.
const previewMode = process.env.BASE44_PREVIEW_MODE === '1'
const apiBridge = process.env.API_PROXY_TARGET || 'http://api:8787'

// The app id lives with the bridge, which is the only process holding it.
const readPreviewAppId = () =>
  new Promise((resolve) => {
    const request = http.get(`${apiBridge}/api/_preview/app-id`, { timeout: 5000 }, (response) => {
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body).appId || '')
        } catch {
          resolve('')
        }
      })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(''))
  })

// The client only asks `auth.me()` when it holds a token; the bridge swaps this
// placeholder for the real credential upstream, so no credential reaches the browser.
const previewSessionPlugin = {
  name: 'base44-preview-session',
  transformIndexHtml: () => [
    {
      tag: 'script',
      injectTo: 'head-prepend',
      children:
        "try{if(!localStorage.getItem('base44_access_token')){localStorage.setItem('base44_access_token','preview-session');localStorage.setItem('token','preview-session')}}catch(e){}",
    },
  ],
}

// https://vite.dev/config/
export default defineConfig(async () => {
  const preview = previewMode
    ? await (async () => {
        if (!process.env.VITE_BASE44_APP_ID) {
          process.env.VITE_BASE44_APP_ID = await readPreviewAppId()
        }
        return {
          server: {
            host: '0.0.0.0',
            port: 3000,
            strictPort: true,
            allowedHosts: ['.' + process.env.BASE44_SANDBOX_HOST_DOMAIN, 'localhost', '127.0.0.1'],
            proxy: {
              '/api': { target: apiBridge, changeOrigin: true },
            },
          },
        }
      })()
    : {}

  return {
    ...preview,
    plugins: [
      base44({
        // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
        // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
        hmrNotifier: true,
        navigationNotifier: true,
        analyticsTracker: true,
        visualEditAgent: true
      }),
      react(),
      ...(previewMode ? [previewSessionPlugin] : []),
    ],
  }
});
