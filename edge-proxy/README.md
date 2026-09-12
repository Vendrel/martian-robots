# Rover image edge proxy

This Cloudflare Worker turns an approved NASA/JPL rover-image URL into a
cacheable, browser-safe image response. It deliberately does not proxy API
requests, arbitrary URLs, non-image products, or redirects to other hosts.

## Deploy

1. Install and authenticate the Cloudflare Wrangler CLI.
2. In this directory, set `ALLOWED_ORIGINS` in `wrangler.toml` to the exact
   HTTPS origin of the app, then run `wrangler deploy`.
3. Copy the returned Worker URL into `dist/runtime-config.js`:

   ```js
   window.MARS_ROVER_IMAGE_PROXY = {
     endpoint: 'https://mars-rover-image-proxy.example.workers.dev'
   };
   ```

   If the Worker is routed as `/nasa-image` on the same app domain, use
   `endpoint: '/nasa-image'` instead.

The browser calls `?url=<encoded-original-image-url>`; the worker fetches only
HTTPS image files at `mars.nasa.gov` or `pds-imaging.jpl.nasa.gov`. Responses
are cached at the edge for 30 days. The original NASA URL is preserved in
Crossview exports and source links.

## Operations

Keep the permitted-origin list narrow. Do not use `*`, do not remove the host
allowlist, and retain the long cache lifetime: this avoids turning the worker
into a public open proxy or repeatedly stressing the NASA image servers.
