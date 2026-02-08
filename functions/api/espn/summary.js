export async function onRequest({ request }) {
  const url = new URL(request.url);

  // Forward query string (?event=...)
  const qs = url.search || "";

  // ESPN hosts sometimes behave differently for /summary. Try a small fallback set.
  const candidates = [
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary" + qs,
    "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary" + qs,
    "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events" + (url.searchParams.get("event") ? `/${url.searchParams.get("event")}` : "") + "?lang=en&region=us",
  ];

  const headersIn = {
    "Accept": "application/json,text/plain,*/*",
    "User-Agent": "Mozilla/5.0 (compatible; nfl-excitement-index/1.0)",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.espn.com/",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };

  let lastResp = null;
  let chosen = null;

  for (const u of candidates) {
    try {
      const resp = await fetch(u, {
        method: "GET",
        headers: headersIn,
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      lastResp = resp;
      chosen = u;

      if (resp.ok) {
        const outHeaders = new Headers(resp.headers);
        outHeaders.set("Content-Type", "application/json; charset=utf-8");
        outHeaders.set("Cache-Control", "public, max-age=300");
        outHeaders.set("X-ESPN-Proxy-Source", new URL(u).host);
        return new Response(resp.body, { status: resp.status, headers: outHeaders });
      }
    } catch (e) {
      // continue to next candidate
    }
  }

  // If everything failed, return a small JSON payload (so the client can show a useful error)
  const status = lastResp ? lastResp.status : 502;
  const body = JSON.stringify({
    error: "upstream_summary_failed",
    status,
    tried: candidates.map(c => new URL(c).host),
    chosen: chosen ? new URL(chosen).host : null
  });

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
