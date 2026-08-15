// netlify/functions/works.js
// Live storage for the "Works" section, backed by Netlify Blobs.
// GET  -> returns the currently published works array (public, no auth).
// POST -> replaces the published works array (requires x-admin-key header
//         matching the ADMIN_KEY environment variable set in Netlify).

const { getStore } = require("@netlify/blobs");

const STORE_NAME = "nut-works";
const BLOB_KEY = "works";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const store = getStore(STORE_NAME);

  if (event.httpMethod === "GET") {
    try {
      const data = await store.get(BLOB_KEY, { type: "json" });
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify(data || []),
      };
    } catch (err) {
      // Nothing published yet, or a transient read error — return an
      // empty array so the frontend falls back to works.json / embedded data.
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: "[]",
      };
    }
  }

  if (event.httpMethod === "POST") {
    const key = event.headers["x-admin-key"] || event.headers["X-Admin-Key"];

    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
      return {
        statusCode: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "unauthorized" }),
      };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "[]");
    } catch (err) {
      return {
        statusCode: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "invalid json" }),
      };
    }

    if (!Array.isArray(payload)) {
      return {
        statusCode: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "expected an array" }),
      };
    }

    await store.setJSON(BLOB_KEY, payload);

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, count: payload.length }),
    };
  }

  return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
};
