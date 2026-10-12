// Cloudflare Worker: proxy chat cho game Vo Lam Idle.
// Chat server nguon (volam.vinarpg.com) khong tra CORS header, nen browser/WebView
// goi truc tiep bi chan. Worker nay proxy same-origin /api/chat/* ve nguon va them CORS.
// Path con lai -> ASSETS.fetch (giu nguyen hanh vi assets-only).

const UPSTREAM = "https://volam.vinarpg.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Chat-GM-Token",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Proxy /api/chat/* (chat the gioi) va /api/rankings* (bang xep hang —
    // cung nguon server, gom profile tu presence cua moi player).
    const isProxied = url.pathname.startsWith("/api/chat/") || url.pathname.startsWith("/api/rankings");

    // Preflight: tra 204 luon, khong len upstream.
    if (request.method === "OPTIONS" && isProxied) {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Path khong phai chat/rankings -> assets nhu cu.
    if (!isProxied) return env.ASSETS.fetch(request);

    // Build URL dich: giu nguyen pathname + search.
    const target = new URL(url.pathname + url.search, UPSTREAM);
    const headers = new Headers();
    const contentType = request.headers.get("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);
    // Forward token GM neu client gui.
    const gmToken = request.headers.get("X-Chat-GM-Token");
    if (gmToken) headers.set("X-Chat-GM-Token", gmToken);

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      // POST co body; GET/DELETE khong co.
      body: request.method === "POST" ? request.body : undefined,
    });

    // Copy header tu upstream (giu content-type text/event-stream, retry: cua SSE), them CORS.
    const outHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS)) outHeaders.set(key, value);

    // Pipe body streaming nguyen ven.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};
