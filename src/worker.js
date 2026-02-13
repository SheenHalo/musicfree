const TUNEHUB_BASE = "https://tunehub.sayqz.com/api";
const SUPPORTED_SOURCES = new Set(["netease", "qq", "kuwo"]);
const SUPPORTED_FUNCTIONS = new Set(["search", "toplists", "toplist", "playlist"]);

const rateLimitStore = new Map();
let cleanupCountDown = 100;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const limitInfo = checkRateLimit(request, env);
      if (!limitInfo.allowed) {
        return jsonResponse(
          {
            success: false,
            message: "请求过于频繁，请稍后再试",
          },
          429,
          withRateHeaders(limitInfo),
        );
      }

      const apiResp = await handleApi(request, env);
      const headers = new Headers(apiResp.headers);
      const rateHeaders = withRateHeaders(limitInfo);
      Object.entries(rateHeaders).forEach(([k, v]) => headers.set(k, v));
      return new Response(apiResp.body, {
        status: apiResp.status,
        headers,
      });
    }

    return serveAsset(request, env);
  },
};

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/api/health") {
      return toRawResponse(jsonResponse({ success: true, message: "ok" }));
    }

    if (path === "/api/search") {
      assertMethod(request, ["GET"]);
      const source = requireSource(url);
      const keyword = (url.searchParams.get("keyword") || "").trim();
      const page = safeInt(url.searchParams.get("page"), 1, 1, 1000);
      const limit = safeInt(url.searchParams.get("limit"), 10, 1, 50);

      if (!keyword) {
        return toRawResponse(jsonResponse({ success: false, message: "keyword 不能为空" }, 400));
      }

      const { result, finalSource } = await runSearchWithFallback(source, { keyword, page, limit }, env);
      const rows = attachSourceForSongs(result, finalSource);
      return toRawResponse(jsonResponse({ success: true, data: rows }));
    }

    if (path === "/api/toplists") {
      assertMethod(request, ["GET"]);
      const source = requireSource(url);
      const result = await runMethod(source, "toplists", {}, env);
      return toRawResponse(jsonResponse({ success: true, data: result }));
    }

    if (path === "/api/toplist") {
      assertMethod(request, ["GET"]);
      const source = requireSource(url);
      const id = (url.searchParams.get("id") || "").trim();
      if (!id) {
        return toRawResponse(jsonResponse({ success: false, message: "id 不能为空" }, 400));
      }

      const result = await runMethod(source, "toplist", { id }, env);
      const rows = attachSourceForSongs(result, source);
      return toRawResponse(jsonResponse({ success: true, data: rows }));
    }

    if (path === "/api/playlist") {
      assertMethod(request, ["GET"]);
      const source = requireSource(url);
      const id = (url.searchParams.get("id") || "").trim();
      if (!id) {
        return toRawResponse(jsonResponse({ success: false, message: "id 不能为空" }, 400));
      }

      const result = await runMethod(source, "playlist", { id }, env);
      const normalized = attachSourceForPlaylist(result, source);
      return toRawResponse(jsonResponse({ success: true, data: normalized }));
    }

    if (path === "/api/parse") {
      assertMethod(request, ["GET", "POST"]);

      const payload = await getParsePayload(request);
      if (!SUPPORTED_SOURCES.has(payload.source)) {
        return toRawResponse(jsonResponse({ success: false, message: "source 只支持 netease / qq / kuwo" }, 400));
      }
      if (!payload.ids) {
        return toRawResponse(jsonResponse({ success: false, message: "id 或 ids 不能为空" }, 400));
      }

      const data = await tuneHubRequest("/v1/parse", {
        method: "POST",
        body: {
          platform: payload.source,
          ids: payload.ids,
          quality: payload.quality,
        },
      }, env);

      return toRawResponse(jsonResponse({ success: true, data }));
    }

    if (path === "/api/methods") {
      assertMethod(request, ["GET"]);
      const data = await tuneHubRequest("/v1/methods", { method: "GET" }, env);
      return toRawResponse(jsonResponse({ success: true, data }));
    }

    const methodMatch = path.match(/^\/api\/methods\/([a-z]+)(?:\/([a-z]+))?$/);
    if (methodMatch) {
      assertMethod(request, ["GET"]);
      const source = methodMatch[1];
      const func = methodMatch[2];

      if (!SUPPORTED_SOURCES.has(source)) {
        return toRawResponse(jsonResponse({ success: false, message: "source 只支持 netease / qq / kuwo" }, 400));
      }

      if (func && !SUPPORTED_FUNCTIONS.has(func)) {
        return toRawResponse(jsonResponse({ success: false, message: "function 只支持 search/toplists/toplist/playlist" }, 400));
      }

      const suffix = func ? `/v1/methods/${source}/${func}` : `/v1/methods/${source}`;
      const data = await tuneHubRequest(suffix, { method: "GET" }, env);
      return toRawResponse(jsonResponse({ success: true, data }));
    }

    return toRawResponse(jsonResponse({ success: false, message: "接口不存在" }, 404));
  } catch (err) {
    return toRawResponse(
      jsonResponse(
        {
          success: false,
          message: err.message || "服务器错误",
        },
        err.statusCode || 500,
      ),
    );
  }
}

async function runMethod(source, func, vars, env) {
  const methodConfig = await tuneHubRequest(`/v1/methods/${source}/${func}`, { method: "GET" }, env);
  const requestConfig = buildUpstreamRequest(methodConfig, vars);
  const rawData = await fetchUpstream(requestConfig);
  return transformData(source, func, rawData);
}

async function runSearchWithFallback(source, vars, env) {
  const orderedSources = buildSearchFallbackOrder(source);

  for (const itemSource of orderedSources) {
    try {
      const result = await runMethod(itemSource, "search", vars, env);
      if (Array.isArray(result) && result.length > 0) {
        return {
          result,
          finalSource: itemSource,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    result: [],
    finalSource: source,
  };
}

function buildSearchFallbackOrder(source) {
  if (source === "netease") return ["netease", "kuwo", "qq"];
  if (source === "qq") return ["qq", "kuwo", "netease"];
  return ["kuwo", "netease", "qq"];
}

function buildUpstreamRequest(methodConfig, vars) {
  const method = (methodConfig.method || "GET").toUpperCase();
  const headers = { ...(methodConfig.headers || {}) };

  const url = new URL(methodConfig.url);
  if (methodConfig.params) {
    const params = resolveTemplateObject(methodConfig.params, vars);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  let body = null;
  if (methodConfig.body) {
    const realBody = resolveTemplateObject(methodConfig.body, vars);
    body = JSON.stringify(realBody);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  return {
    url: url.toString(),
    method,
    headers,
    body,
  };
}

async function fetchUpstream(config) {
  const resp = await fetch(config.url, {
    method: config.method,
    headers: config.headers,
    body: config.method === "GET" ? undefined : config.body,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw createError(`上游接口失败：${resp.status}`, 502);
  }

  const json = parseMaybeJson(text);
  if (json === null || json === undefined) {
    throw createError("上游返回数据无法解析", 502);
  }
  return json;
}

function transformData(source, func, response) {
  if (source === "kuwo" && func === "search") {
    const list = Array.isArray(response.abslist) ? response.abslist : [];
    return list.map((item) => ({
      id: String(item.MUSICRID || "").replace("MUSIC_", ""),
      name: item.SONGNAME || item.NAME || "",
      artist: String(item.ARTIST || "").replaceAll("&", ", "),
      album: item.ALBUM || "",
    }));
  }

  if (source === "kuwo" && func === "toplists") {
    const list = Array.isArray(response.child) ? response.child : [];
    return list
      .filter((item) => item && item.source === "1")
      .map((item) => ({
        id: String(item.sourceid || ""),
        name: item.name || "",
        pic: item.pic || "",
        updateFrequency: item.info || "Regular update",
      }));
  }

  if (source === "kuwo" && func === "toplist") {
    const list = Array.isArray(response.musiclist) ? response.musiclist : [];
    return list.map((item) => ({
      id: String(item.id || item.rid || ""),
      name: item.name || "",
      artist: String(item.artist || "").replaceAll("&", ", "),
      album: item.album || "",
    }));
  }

  if (source === "kuwo" && func === "playlist") {
    if (response.result !== "ok") {
      return null;
    }
    const list = Array.isArray(response.musiclist) ? response.musiclist : [];
    return {
      info: {
        name: response.title || "",
        pic: response.pic || "",
        desc: response.info || "",
        author: response.uname || "",
        playCount: response.playnum || 0,
      },
      list: list.map((item) => ({
        id: String(item.id || ""),
        name: item.name || "",
        artist: String(item.artist || "").replaceAll("&", ", "),
        album: item.album || "",
      })),
    };
  }

  if (source === "qq" && func === "search") {
    const songs = response?.req?.data?.body?.song?.list;
    const list = Array.isArray(songs) ? songs : [];
    return list.map((item) => ({
      id: item.mid || "",
      name: item.name || "",
      artist: pickArtistNames(item),
      album: item?.album?.name || "",
    }));
  }

  if (source === "qq" && func === "toplists") {
    const groups = response?.toplist?.data?.group;
    const list = Array.isArray(groups) ? groups : [];
    const result = [];
    list.forEach((group) => {
      const rows = Array.isArray(group.toplist) ? group.toplist : [];
      rows.forEach((item) => {
        result.push({
          id: String(item.topId || ""),
          name: item.title || "",
          pic: item.headPicUrl || item.frontPicUrl || "",
          updateFrequency: item.updateType === 1 ? "Daily" : "Weekly",
        });
      });
    });
    return result;
  }

  if (source === "qq" && func === "toplist") {
    const rows = response?.toplist?.data?.songInfoList;
    const list = Array.isArray(rows) ? rows : [];
    return list.map((item) => ({
      id: item.mid || "",
      name: item.title || "",
      artist: pickArtistNames(item),
      album: item.albumName || item?.album?.name || "",
    }));
  }

  if (source === "qq" && func === "playlist") {
    const cdlist = Array.isArray(response?.cdlist) ? response.cdlist[0] : null;
    if (!cdlist) {
      return null;
    }
    const songs = Array.isArray(cdlist.songlist) ? cdlist.songlist : [];
    return {
      info: {
        name: cdlist.dissname || "",
        pic: cdlist.logo || "",
        desc: String(cdlist.desc || "").replaceAll("<br>", "\n"),
        author: cdlist.nickname || "",
        playCount: cdlist.visitnum || 0,
      },
      list: songs.map((item) => ({
        id: item.mid || "",
        name: item.title || "",
        artist: pickArtistNames(item),
        album: item?.album?.name || "",
      })),
    };
  }

  if (source === "netease" && func === "search") {
    const songs = response?.result?.songs;
    const list = Array.isArray(songs) ? songs : [];
    return list.map((item) => ({
      id: String(item.id || ""),
      name: item.name || "",
      artist: Array.isArray(item.artists) ? item.artists.map((a) => a.name).join(", ") : "",
      album: item?.album?.name || "",
    }));
  }

  if (source === "netease" && func === "toplists") {
    const list = Array.isArray(response.list) ? response.list : [];
    return list.map((item) => ({
      id: String(item.id || ""),
      name: item.name || "",
      pic: item.coverImgUrl || "",
      updateFrequency: item.updateFrequency || "",
    }));
  }

  if (source === "netease" && func === "toplist") {
    const tracks = response?.result?.tracks;
    const list = Array.isArray(tracks) ? tracks : [];
    return list.map((item) => ({
      id: String(item.id || ""),
      name: item.name || "",
      artist: Array.isArray(item.artists) ? item.artists.map((a) => a.name).join(", ") : "",
      album: item?.album?.name || "",
    }));
  }

  if (source === "netease" && func === "playlist") {
    const playlist = response?.result;
    if (!playlist) {
      return null;
    }
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    return {
      info: {
        name: playlist.name || "",
        pic: playlist.coverImgUrl || "",
        desc: playlist.description || "",
        author: playlist?.creator?.nickname || "",
        playCount: playlist.playCount || 0,
      },
      list: tracks.map((item) => ({
        id: String(item.id || ""),
        name: item.name || "",
        artist: Array.isArray(item.artists) ? item.artists.map((a) => a.name).join(", ") : "",
        album: item?.album?.name || "",
      })),
    };
  }

  return response;
}

function resolveTemplateObject(value, vars) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateObject(item, vars));
  }

  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = resolveTemplateObject(item, vars);
    });
    return result;
  }

  if (typeof value !== "string") {
    return value;
  }

  const fullExpr = value.match(/^\{\{(.+)\}\}$/);
  if (fullExpr) {
    return evalTemplateExpr(fullExpr[1], vars);
  }

  return value.replace(/\{\{([^{}]+)\}\}/g, (_, expr) => {
    const result = evalTemplateExpr(expr, vars);
    return result === null || result === undefined ? "" : String(result);
  });
}

function evalTemplateExpr(expression, vars) {
  const expr = String(expression || "").replace(/\s+/g, "");

  if (expr === "keyword") return vars.keyword || "";
  if (expr === "id") return vars.id || "";
  if (expr === "ids") return vars.ids || "";
  if (expr === "page") return toNum(vars.page, 1);
  if (expr === "pageSize") return toNum(vars.pageSize, 30);
  if (expr === "limit") return toNum(vars.limit, 20);
  if (expr === "page||1") return toNum(vars.page, 1);
  if (expr === "limit||20") return toNum(vars.limit, 20);
  if (expr === "(page||1)-1") return toNum(vars.page, 1) - 1;
  if (expr === "((page||1)-1)*(limit||20)") return (toNum(vars.page, 1) - 1) * toNum(vars.limit, 20);
  if (expr === "parseInt(id)") return Number.parseInt(vars.id || "0", 10) || 0;

  if (Object.prototype.hasOwnProperty.call(vars, expr)) {
    return vars[expr];
  }
  return "";
}

function toNum(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

async function tuneHubRequest(path, options, env) {
  const apiKey = env.music_parser_key || env.MUSIC_PARSER_KEY;
  if (!apiKey) {
    throw createError("缺少 music_parser_key，请在 Cloudflare Secrets 中配置", 500);
  }

  const headers = {
    "X-API-Key": apiKey,
    ...(options.headers || {}),
  };

  if (options.body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const resp = await fetch(`${TUNEHUB_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await resp.text();
  const payload = parseMaybeJson(text);

  if (!resp.ok) {
    throw createError(`TuneHub 请求失败：${resp.status}`, 502);
  }

  if (!payload || payload.success === false || payload.code !== 0) {
    throw createError(payload?.message || "TuneHub 返回错误", 502);
  }

  return payload.data;
}

function parseMaybeJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const maybe = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(maybe);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function pickArtistNames(item) {
  if (!item || typeof item !== "object") return "";

  if (Array.isArray(item.singerList)) {
    return item.singerList.map((s) => s?.name).filter(Boolean).join(", ");
  }

  if (Array.isArray(item.singer)) {
    return item.singer.map((s) => s?.name).filter(Boolean).join(", ");
  }

  if (typeof item.singerName === "string") return item.singerName;
  if (typeof item.singer_name === "string") return item.singer_name;
  if (typeof item.singername === "string") return item.singername;
  return "";
}

function attachSourceForSongs(rows, source) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((item) => ({
    ...item,
    source,
  }));
}

function attachSourceForPlaylist(payload, source) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  return {
    ...payload,
    list: attachSourceForSongs(payload.list, source),
  };
}

function checkRateLimit(request, env) {
  const maxPerMinute = safeInt(env.RATE_LIMIT_MAX_PER_MIN, 30, 1, 1000);
  const now = Date.now();
  const bucket = Math.floor(now / 60000);
  const ip = clientIp(request);
  const key = `${ip}:${bucket}`;

  const current = rateLimitStore.get(key) || { count: 0, resetAt: (bucket + 1) * 60000 };
  current.count += 1;
  rateLimitStore.set(key, current);

  cleanupCountDown -= 1;
  if (cleanupCountDown <= 0) {
    cleanupCountDown = 100;
    cleanupRateStore(now);
  }

  const remaining = Math.max(0, maxPerMinute - current.count);
  const allowed = current.count <= maxPerMinute;
  return {
    allowed,
    limit: maxPerMinute,
    remaining,
    resetAt: current.resetAt,
  };
}

function cleanupRateStore(now) {
  for (const [key] of rateLimitStore.entries()) {
    const pieces = key.split(":");
    const bucket = Number(pieces[pieces.length - 1]);
    const bucketEnd = (bucket + 1) * 60000;
    if (!Number.isFinite(bucket) || bucketEnd < now - 1000) {
      rateLimitStore.delete(key);
    }
  }
}

function withRateHeaders(info) {
  return {
    "X-RateLimit-Limit": String(info.limit),
    "X-RateLimit-Remaining": String(info.remaining),
    "X-RateLimit-Reset": String(Math.floor(info.resetAt / 1000)),
  };
}

function clientIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;

  const xff = request.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();

  return "unknown";
}

function requireSource(url) {
  const source = (url.searchParams.get("source") || "netease").trim();
  if (!SUPPORTED_SOURCES.has(source)) {
    throw createError("source 只支持 netease / qq / kuwo", 400);
  }
  return source;
}

async function getParsePayload(request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const source = (url.searchParams.get("source") || "netease").trim();
    const ids = (url.searchParams.get("ids") || url.searchParams.get("id") || "").trim();
    const quality = (url.searchParams.get("quality") || "320k").trim();
    return { source, ids, quality };
  }

  const payload = await request.json();
  const source = String(payload.source || payload.platform || "netease").trim();
  const ids = String(payload.ids || payload.id || "").trim();
  const quality = String(payload.quality || "320k").trim();
  return { source, ids, quality };
}

function safeInt(raw, fallback, min, max) {
  const num = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function assertMethod(request, allowed) {
  if (!allowed.includes(request.method)) {
    throw createError(`仅支持 ${allowed.join(", ")} 请求`, 405);
  }
}

async function serveAsset(request, env) {
  const url = new URL(request.url);
  const res = await env.ASSETS.fetch(request);

  if (res.status !== 404) {
    return res;
  }

  if (url.pathname.includes(".")) {
    return res;
  }

  return env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), request));
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  };
}

function createError(message, statusCode = 500) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function toRawResponse(response) {
  const body = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}
