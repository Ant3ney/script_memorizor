import crypto from "node:crypto";
import { getScriptSlotsCollection } from "../../database.js";

const slotIdPattern = /^\d{4}$/;
const maxRequestBytes = 2_000_000;
const maxSavesPerSlot = 100;
const maxScriptLength = 250_000;
const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default async function scriptsHandler(request, context) {
  try {
    const slotId = validateSlotId(context.params?.slotId || getLastPathSegment(request.url));

    if (request.method === "GET") {
      return await loadScripts(slotId);
    }

    if (request.method === "PUT") {
      return await saveScripts(request, slotId);
    }

    return jsonResponse(
      { error: "Only GET and PUT are supported." },
      { status: 405, headers: { Allow: "GET, PUT" } },
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    return jsonResponse(
      { error: status >= 500 ? "The server could not complete the request." : error.message },
      { status },
    );
  }
}

export const config = {
  path: "/api/scripts/:slotId",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

async function loadScripts(slotId) {
  const collection = await getScriptSlotsCollection();
  const slot = await collection.findOne(
    { slotId },
    { projection: { _id: 0, slotId: 1, saves: 1, createdAt: 1, updatedAt: 1 } },
  );

  if (!slot) {
    return jsonResponse({ found: false, slotId, saves: [] });
  }

  return jsonResponse({ found: true, ...slot });
}

async function saveScripts(request, slotId) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxRequestBytes) {
    throw new HttpError(413, "The script library is too large to save.");
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.");
  }

  const saves = sanitizeSaves(body?.saves);
  const collection = await getScriptSlotsCollection();
  const now = new Date();

  await collection.updateOne(
    { slotId },
    {
      $set: { saves, updatedAt: now, schemaVersion: 1 },
      $setOnInsert: { slotId, createdAt: now },
    },
    { upsert: true },
  );

  return jsonResponse({
    ok: true,
    slotId,
    saveCount: saves.length,
    updatedAt: now.toISOString(),
  });
}

function validateSlotId(value) {
  const slotId = String(value || "");
  if (!slotIdPattern.test(slotId)) {
    throw new HttpError(400, "The save ID must contain exactly four digits.");
  }
  return slotId;
}

function sanitizeSaves(input) {
  if (!Array.isArray(input)) {
    throw new HttpError(400, "saves must be an array.");
  }
  if (input.length > maxSavesPerSlot) {
    throw new HttpError(400, `A save ID can contain at most ${maxSavesPerSlot} scripts.`);
  }
  return input.map(sanitizeSave);
}

function sanitizeSave(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "Each script must be an object.");
  }

  const text = typeof input.text === "string" ? input.text : "";
  if (!text.trim()) throw new HttpError(400, "Every script must contain text.");
  if (text.length > maxScriptLength) {
    throw new HttpError(400, `A script cannot exceed ${maxScriptLength} characters.`);
  }

  const title = String(input.title || "Untitled Script").trim().slice(0, 120) || "Untitled Script";
  const hideOrder = Array.isArray(input.hideOrder)
    ? input.hideOrder.filter((value) => Number.isSafeInteger(value) && value >= 0).slice(0, 100_000)
    : [];
  const requestedHiddenCount = Number.isSafeInteger(input.hiddenCount) ? input.hiddenCount : 0;
  const now = new Date().toISOString();

  return {
    id: normalizeScriptId(input.id),
    title,
    text,
    hideOrder,
    hiddenCount: Math.max(0, Math.min(hideOrder.length, requestedHiddenCount)),
    createdAt: normalizeDate(input.createdAt, now),
    updatedAt: normalizeDate(input.updatedAt, now),
  };
}

function normalizeScriptId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= 100 && /^[A-Za-z0-9._-]+$/.test(id) ? id : crypto.randomUUID();
}

function normalizeDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function getLastPathSegment(url) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  return segments.at(-1) || "";
}

function jsonResponse(data, options = {}) {
  return Response.json(data, {
    ...options,
    headers: { ...responseHeaders, ...options.headers },
  });
}
