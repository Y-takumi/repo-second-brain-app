/**
 * second-brain-proxy
 * アプリ(index.html)からのリクエストを受け取り、
 *  ①ユーザーごとの週次予算をチェック
 *  ②予算内ならAnthropic APIに転送（APIキーはここでだけ保持）
 *  ③使用量を記録
 * を行うCloudflare Worker。
 *
 * 【デプロイ前に必要な設定】
 * 1. このコードをWorkerのエディタに貼り付けて保存
 * 2. Settings → Variables and Secrets → Add で以下を追加
 *      - ANTHROPIC_API_KEY (Secret) … あなたのAnthropic APIキー
 *      - WEEKLY_CAP_USD    (Text, 任意) … 例: "1.0"。未設定なら$1.00がデフォルト
 * 3. Settings → Bindings → KV Namespace を追加
 *      - Variable name: USAGE_KV
 *      - 新規にKV Namespaceを作成して紐付ける（名前は何でも良い。例: second-brain-usage）
 */

// Claude Sonnet 5 の料金（2026年8月31日までのプロモーション価格。それ以降は要更新）
const PRICE_PER_MTOK_INPUT_USD = 2.0;
const PRICE_PER_MTOK_OUTPUT_USD = 10.0;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "POSTのみ対応しています" }, 405);
    }

    // ここから先で何が起きても、必ずCORSヘッダー付きのJSONを返す（さもないとブラウザ側でLoad failedになる）
    try {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "リクエストの形式が不正です" }, 400);
      }

      if (!body.payload) {
        return jsonResponse({ error: "payload（Anthropic APIへ送る中身）がありません" }, 400);
      }

      if (!env.ANTHROPIC_API_KEY) {
        return jsonResponse({ error: "ANTHROPIC_API_KEYが未設定です。Worker設定を確認してください" }, 500);
      }

      const userId = body.userId || "anonymous";
      const weeklyCapUSD = parseFloat(env.WEEKLY_CAP_USD || "1.0");
      const weekKey = getWeekKey();
      const usageKey = `usage:${userId}:${weekKey}`;

      // ① 予算チェック
      const currentUsageRaw = env.USAGE_KV ? await env.USAGE_KV.get(usageKey) : null;
      const currentUsage = currentUsageRaw ? parseFloat(currentUsageRaw) : 0;

      if (currentUsage >= weeklyCapUSD) {
        return jsonResponse(
          {
            error: "weekly_limit_exceeded",
            message: `今週の利用上限（$${weeklyCapUSD.toFixed(2)}）に達しました。来週またお試しください。`,
            currentUsage: Number(currentUsage.toFixed(4)),
            weeklyCapUSD,
          },
          429
        );
      }

      // ② Anthropic APIへ転送
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body.payload),
      });

      const rawText = await anthropicRes.text();
      let anthropicData;
      try {
        anthropicData = JSON.parse(rawText);
      } catch (e) {
        // AnthropicがJSON以外(HTML等)を返してきた場合の保険
        return jsonResponse(
          { error: "Anthropic APIから予期しない応答がありました", status: anthropicRes.status, raw: rawText.slice(0, 300) },
          502
        );
      }

      // ③ 使用量を概算してKVに積算する
      if (anthropicData.usage && env.USAGE_KV) {
        const inputCost = (anthropicData.usage.input_tokens / 1_000_000) * PRICE_PER_MTOK_INPUT_USD;
        const outputCost = (anthropicData.usage.output_tokens / 1_000_000) * PRICE_PER_MTOK_OUTPUT_USD;
        const callCost = inputCost + outputCost;
        const newUsage = currentUsage + callCost;
        await env.USAGE_KV.put(usageKey, newUsage.toString(), { expirationTtl: 60 * 60 * 24 * 14 });
      }

      return jsonResponse(anthropicData, anthropicRes.status);
    } catch (err) {
      // 想定外のエラーも、必ずCORSヘッダー付きで返す
      return jsonResponse({ error: "Worker内部エラー", detail: String(err && err.message || err) }, 500);
    }
  },
};

function corsHeaders() {
  return {
    // 本来はGitHub PagesのURLだけに絞るのが望ましいが、まずは動作確認のため全許可にしている
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

/** ISO週番号(月曜始まり)ベースの週キーを作る。例: "2026-W29" */
function getWeekKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}