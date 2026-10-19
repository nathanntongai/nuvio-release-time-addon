/**
 * src/server.js
 * Minimal working NuvioTV Addon HTTP server prototype (Milestone 5).
 * Serves /manifest.json, /catalog/:type/:id.json, and /meta/:type/:id.json
 */

const http = require("node:http");
const manifest = require("../manifest.json");

// Adjustable parameter: Port number where the addon server listens
const PORT = Number(process.env.PORT) || 7000;
const HOST = "0.0.0.0";

/**
 * Helper function to send JSON responses with CORS headers required by NuvioTV.
 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

/**
 * Prototype sample metadata matching NuvioTV's MetaResponseDto.kt and VideoDto.kt.
 * In Milestone 6 & 7, this will be powered by our releaseTimeParser and live metadata provider.
 */
const PROTOTYPE_SERIES_META = {
  id: "rt:demo-us-evening-show",
  type: "series",
  name: "Release Time Demo: US Prime-Time Series",
  releaseInfo: "2026",
  released: "2026-10-14",
  description:
    "Original Network Schedule: Wednesdays at 9:00 PM EDT (America/New_York). Preserved without shifting to Thursday in EAT (UTC+3).",
  genres: ["Drama", "Schedule Verification"],
  videos: [
    {
      id: "rt:demo-us-evening-show:1:1",
      title: "Episode 1 — Regional Evening Release (9:00 PM EDT)",
      season: 1,
      episode: 1,
      // Plain calendar date preserves Oct 14 in NuvioTV's EpisodeReleaseDateParser.kt
      released: "2026-10-14",
      overview:
        "[Original Release: Wed, Oct 14, 2026 at 9:00 PM EDT (America/New_York) | Local EAT: Thu, Oct 15, 2026 at 4:00 AM UTC+3] This episode aired Wednesday night in New York."
    },
    {
      id: "rt:demo-us-evening-show:1:2",
      title: "Episode 2 — Date-Only Release (No Time Fabricated)",
      season: 1,
      episode: 2,
      released: "2026-10-21",
      overview:
        "[Original Release: Wed, Oct 21, 2026 (Date-Only — No exact airtime specified by distributor)]"
    }
  ]
};

const PROTOTYPE_MOVIE_META = {
  id: "rt:demo-movie-date-only",
  type: "movie",
  name: "Release Time Demo: Theatrical Movie",
  releaseInfo: "2026",
  released: "2026-11-06",
  description:
    "[Original Release: Fri, Nov 6, 2026 (Date-Only)] Preserves exact theatrical calendar date without time-zone conversion."
};

/**
 * Main HTTP request router
 */
const server = http.createServer((req, res) => {
  // Handle browser/app preflight CORS checks
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  // 1. Root health-check page
  if (pathname === "/" || pathname === "") {
    return sendJson(res, 200, {
      status: "ok",
      addon: manifest.name,
      version: manifest.version,
      manifestUrl: `http://127.0.0.1:${PORT}/manifest.json`
    });
  }

  // 2. Manifest endpoint (/manifest.json)
  if (pathname === "/manifest.json") {
    return sendJson(res, 200, manifest);
  }

  // 3. Catalog endpoint (/catalog/:type/:id.json)
  const catalogMatch = pathname.match(/^\/catalog\/([^/]+)\/([^/]+)\.json\$/);
  if (catalogMatch) {
    const [, type] = catalogMatch;
    if (type === "series") {
      return sendJson(res, 200, {
        metas: [
          {
            id: PROTOTYPE_SERIES_META.id,
            type: PROTOTYPE_SERIES_META.type,
            name: PROTOTYPE_SERIES_META.name,
            releaseInfo: PROTOTYPE_SERIES_META.releaseInfo,
            released: PROTOTYPE_SERIES_META.released,
            description: PROTOTYPE_SERIES_META.description
          }
        ]
      });
    }
    if (type === "movie") {
      return sendJson(res, 200, {
        metas: [
          {
            id: PROTOTYPE_MOVIE_META.id,
            type: PROTOTYPE_MOVIE_META.type,
            name: PROTOTYPE_MOVIE_META.name,
            releaseInfo: PROTOTYPE_MOVIE_META.releaseInfo,
            released: PROTOTYPE_MOVIE_META.released,
            description: PROTOTYPE_MOVIE_META.description
          }
        ]
      });
    }
    return sendJson(res, 200, { metas: [] });
  }

  // 4. Meta detail endpoint (/meta/:type/:id.json)
  const metaMatch = pathname.match(/^\/meta\/([^/]+)\/([^/]+)\.json\$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;
    if (type === "series" && id === PROTOTYPE_SERIES_META.id) {
      return sendJson(res, 200, { meta: PROTOTYPE_SERIES_META });
    }
    if (type === "movie" && id === PROTOTYPE_MOVIE_META.id) {
      return sendJson(res, 200, { meta: PROTOTYPE_MOVIE_META });
    }
    return sendJson(res, 404, { error: `No metadata found for ${type}/${id}` });
  }

  // 5. Fallback 404 for unknown routes
  return sendJson(res, 404, { error: "Endpoint not found" });
});

// Start listening only when run directly (not when imported by automated tests)
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log("====================================================");
    console.log(`Nuvio Addon Server running!`);
    console.log(`Manifest URL: http://127.0.0.1:${PORT}/manifest.json`);
    console.log(`Press Ctrl + C to stop the server.`);
    console.log("====================================================");
  });
}

module.exports = { server, manifest, PROTOTYPE_SERIES_META, PROTOTYPE_MOVIE_META };