// たね：AIを呼ぶサーバー関数
// アプリから { prompt, json } を受け取り、Claude の答えを NDJSON で少しずつ返す。
//   {"t":"text","v":"…"}   文字が増えるたびに
//   {"t":"done"}            正常に終わった
//   {"t":"error","code":"…"} 失敗（rate_limited / refused / too_long / unauthorized / failed）
// 秘密は Supabase の secrets に置く：ANTHROPIC_API_KEY（必須）、AI_DAILY_LIMIT（任意、既定 60）
import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MODEL = "claude-opus-5-5";
const MAX_PROMPT = 40_000;
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "60");
const ALLOW_ORIGIN = Deno.env.get("ALLOW_ORIGIN") ?? "*";

const SYSTEM = `あなたは「たね」というアイデア支援アプリのAIです。利用者は、業界・自分の持ち物・相手・AIの役割を掛け合わせて、小さな仕事の案を考えています。AIで仕事の形が変わること（AX）を前提に、普通の人が来週から始められる形で答えてください。やさしい日本語で、専門用語は使いません。渡された事例にない数字や成果は作りません。`;
const SYSTEM_JSON = `${SYSTEM}\n答えはJSONだけを返してください。前後に説明やコードブロックの記号を付けません。`;

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
// 新しい secret key を優先し、なければ旧 service_role key を使う
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default } catch { return undefined }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, SECRET, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const fail = (code: string, status: number) =>
  new Response(JSON.stringify({ t: "error", code }) + "\n", {
    status,
    headers: { ...cors, "Content-Type": "application/x-ndjson" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail("failed", 405);

  // 匿名ログイン済みの人だけ
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return fail("unauthorized", 401);

  let body: { prompt?: unknown; json?: unknown };
  try { body = await req.json(); } catch { return fail("failed", 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt) return fail("failed", 400);
  if (prompt.length > MAX_PROMPT) return fail("too_long", 413);

  const { data: ok, error } = await admin.rpc("ai_take", { p_user: user.id, p_limit: DAILY_LIMIT });
  if (error) return fail("failed", 500);
  if (!ok) return fail("rate_limited", 429);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        // 安全側の判定で断られたときは、Anthropic が勧めるモデルで自動的にやり直す
        const s = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: body.json ? SYSTEM_JSON : SYSTEM,
          messages: [{ role: "user", content: prompt }],
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            send({ t: "text", v: ev.delta.text });
          }
        }
        const msg = await s.finalMessage();
        if (msg.stop_reason === "refusal") send({ t: "error", code: "refused" });
        else send({ t: "done", stop: msg.stop_reason });
      } catch (e) {
        const code = e instanceof Anthropic.RateLimitError ? "rate_limited" : "failed";
        console.error("ai error", e instanceof Anthropic.APIError ? e.status : "", String(e));
        send({ t: "error", code });
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(stream, { headers: { ...cors, "Content-Type": "application/x-ndjson" } });
});
