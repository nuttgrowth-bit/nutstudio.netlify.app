// netlify/functions/ai-assist.js
// AI-assisted copywriting for the admin panel: suggest project titles/content
// and translate work items between Arabic and English.
// Requires ANTHROPIC_API_KEY (and reuses the same ADMIN_KEY as /api/works).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `You are a bilingual (Arabic/English) copywriter for "nut. creative studio",
a Saudi branding and marketing agency. House voice: short, confident, concrete
sentences — no filler adjectives, real specifics over vague claims. Arabic
copy uses natural, contemporary Modern Standard Arabic (Gulf-friendly), not
stiff formal Arabic. Numbers in Arabic chapter labels use Arabic-Indic
digits (٠١، ٠٢...); numbers in English chapter labels use plain digits
(01, 02...).
Always respond with ONLY valid JSON matching the exact schema requested in
the user message — no markdown, no code fences, no explanation before or
after the JSON.`;

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
  }

  const key = event.headers["x-admin-key"] || event.headers["X-Admin-Key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return jsonResponse(401, { ok: false, error: "unauthorized" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonResponse(500, { ok: false, error: "ANTHROPIC_API_KEY not configured on the server" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { ok: false, error: "invalid json" });
  }

  const { action } = body;
  let userPrompt;

  if (action === "translate") {
    const { from, to, content } = body;
    if (!from || !to || !content) {
      return jsonResponse(400, { ok: false, error: "missing from/to/content" });
    }
    userPrompt = `Translate this project content from ${from === "ar" ? "Arabic" : "English"} to ${to === "ar" ? "Arabic" : "English"}.

Keep the exact same JSON shape:
{ "name": string, "cat": string, "lede": string,
  "ch": [[number, chapterTitle, chapterBody], ...4 items],
  "res": [[value, label], ...3 items] }

Translate every text field naturally, adapting idiom rather than translating
literally. Keep the "number" field in each ch item as the step number in the
target language's numeral style (do not translate it as text).

Source JSON:
${JSON.stringify(content)}

Respond with only the translated JSON object, in the exact same shape.`;
  } else if (action === "suggest") {
    const { lang, hint, existing } = body;
    if (!lang) {
      return jsonResponse(400, { ok: false, error: "missing lang" });
    }
    userPrompt = `Suggest a project name, category, and one-line lede for a portfolio
case study, in ${lang === "ar" ? "Arabic" : "English"}.
${hint ? `Context from the user: ${hint}` : "No extra context was given — invent something plausible and on-brand for a Saudi creative/marketing studio."}
${existing ? `The same project already exists in the other language, for reference/consistency only (do not translate it): ${JSON.stringify(existing)}` : ""}

Respond with only JSON: { "name": "...", "cat": "...", "lede": "..." }`;
  } else {
    return jsonResponse(400, { ok: false, error: "unknown action" });
  }

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    console.error("NUT AI: network error calling Anthropic", err);
    return jsonResponse(502, { ok: false, error: "network error" });
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("NUT AI: Anthropic API error", res.status, errText);
    return jsonResponse(502, { ok: false, error: "AI request failed (" + res.status + ")" });
  }

  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("").trim();

  let parsed;
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("NUT AI: could not parse model output:", text);
    return jsonResponse(502, { ok: false, error: "AI returned invalid JSON" });
  }

  return jsonResponse(200, { ok: true, result: parsed });
};
