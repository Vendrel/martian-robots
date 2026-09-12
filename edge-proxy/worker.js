const ALLOWED_HOSTS = new Set(['mars.nasa.gov', 'pds-imaging.jpl.nasa.gov']);
const IMAGE_PATH = /\.(?:avif|gif|jpe?g|png|tiff?|webp)(?:$|[?#])/i;
const MAX_REDIRECTS = 3;
const CACHE_SECONDS = 60 * 60 * 24 * 30;

function permittedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const sameOrigin = origin === new URL(request.url).origin;
  if (origin && !sameOrigin && !permittedOrigins(env).has(origin)) return null;
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function parseTarget(request) {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) throw new Error('Missing url query parameter');
  const target = new URL(raw);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname) || !IMAGE_PATH.test(target.pathname)) {
    throw new Error('Only approved NASA/JPL image URLs are accepted');
  }
  return target;
}

async function fetchApprovedImage(target) {
  let current = target;
  for (let count = 0; count <= MAX_REDIRECTS; count++) {
    const upstream = await fetch(current.toString(), {
      redirect: 'manual',
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
    });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) return upstream;
    const location = upstream.headers.get('Location');
    if (!location) return upstream;
    current = new URL(location, current);
    if (current.protocol !== 'https:' || !ALLOWED_HOSTS.has(current.hostname) || !IMAGE_PATH.test(current.pathname)) {
      throw new Error('Redirect left the approved image hosts');
    }
  }
  throw new Error('Too many redirects');
}

function clientResponse(source, cors) {
  const headers = new Headers(cors);
  headers.set('Content-Type', source.headers.get('Content-Type') || 'image/jpeg');
  headers.set('Cache-Control', `public, max-age=86400, s-maxage=${CACHE_SECONDS}, immutable`);
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(source.body, { status: source.status, headers });
}

export default {
  async fetch(request, env, context) {
    const cors = corsHeaders(request, env);
    if (!cors) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    let target;
    try { target = parseTarget(request); } catch (error) { return new Response(error.message, { status: 400, headers: cors }); }
    const cache = caches.default;
    const cacheKey = new Request(`https://rover-image-cache.invalid/${encodeURIComponent(target.toString())}`);
    let source = await cache.match(cacheKey);
    if (!source) {
      try { source = await fetchApprovedImage(target); } catch { return new Response('Upstream image unavailable', { status: 502, headers: cors }); }
      if (!source.ok) return clientResponse(source, cors);
      const stored = new Response(source.body, {
        status: source.status,
        headers: {
          'Content-Type': source.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': `public, max-age=${CACHE_SECONDS}`
        }
      });
      context.waitUntil(cache.put(cacheKey, stored.clone()));
      source = stored;
    }
    return clientResponse(source, cors);
  }
};
