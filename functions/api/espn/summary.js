export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = new URL("https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary");
  target.search = url.search;

  const resp = await fetch(target.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 (compatible; nfl-excitement-index/1.0)",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.espn.com/",
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300");

  return new Response(resp.body, { status: resp.status, headers });
}
