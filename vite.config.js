import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Sandbox preview only (BASE44_PREVIEW_MODE=1): the preview serves the app on
// port 3000 behind the platform's proxy, so the dev server has to accept that
// host and answer the manifest the page asks for.
// Unset — a plain `npm run dev` or a build — none of this applies.
const previewMode = process.env.BASE44_PREVIEW_MODE === '1'

// index.html links /manifest.json. The dev server would answer it with
// index.html, which a browser rejects as a manifest, so the preview serves one.
const previewManifestPlugin = {
  name: 'base44-preview-manifest',
  configureServer(server) {
    server.middlewares.use('/manifest.json', (_req, res) => {
      res.setHeader('content-type', 'application/manifest+json')
      res.end(
        JSON.stringify({
          name: 'Base44 APP',
          short_name: 'Base44',
          start_url: '/',
          display: 'standalone',
          icons: [],
        })
      )
    })
  },
}

// https://vite.dev/config/
export default defineConfig(() => {
  const preview = previewMode
    ? {
        server: {
          host: '0.0.0.0',
          port: 3000,
          strictPort: true,
          allowedHosts: ['.' + process.env.BASE44_SANDBOX_HOST_DOMAIN, 'localhost', '127.0.0.1'],
        },
      }
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
      ...(previewMode ? [previewManifestPlugin] : []),
    ],
  }
});
