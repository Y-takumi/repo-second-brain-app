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

    const url = new URL(request.url);

    // YouTube 字幕取得エンドポイント（GET でクエリパラメータを受ける）
    if (url.pathname === "/youtube-transcript") {
      return handleYouTubeTranscript(request, env);
    }

    // 既存の Anthropic API プロキシ（POST のみ）
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

/* ============================================================
 * YouTube 字幕取得エンドポイント（2026-07-25 追加）
 *
 * 用途: ブラウザからYouTube URLを受け取り、字幕テキストを返す
 * 認証: Cloudflare Worker が Cloudflare Secret に保存された
 *       リフレッシュトークンで自動的にアクセストークンを取得
 * 必要な Secret:
 *   - YOUTUBE_CLIENT_ID
 *   - YOUTUBE_CLIENT_SECRET
 *   - YOUTUBE_REFRESH_TOKEN
 * ============================================================ */

/** リフレッシュトークンを使ってアクセストークンを取得 */
async function getYouTubeAccessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`アクセストークン取得失敗: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

/** YouTube URL から video ID を抽出 */
function extractYouTubeId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,         // https://www.youtube.com/watch?v=VIDEO_ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,    // https://youtu.be/VIDEO_ID
    /\/shorts\/([a-zA-Z0-9_-]{11})/,     // https://www.youtube.com/shorts/VIDEO_ID
    /\/embed\/([a-zA-Z0-9_-]{11})/,      // https://www.youtube.com/embed/VIDEO_ID
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** YouTube URL から動画字幕を取得する */
async function handleYouTubeTranscript(request, env) {
  try {
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get("url");
    if (!videoUrl) {
      return jsonResponse({ error: "url パラメータが必要です" }, 400);
    }

    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) {
      return jsonResponse(
        { error: "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN のいずれかが未設定です" },
        500
      );
    }

    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) {
      return jsonResponse({ error: "YouTube URL から video ID を抽出できませんでした" }, 400);
    }

    // ① アクセストークンを取得（リフレッシュトークンから自動更新）
    const accessToken = await getYouTubeAccessToken(env);

    // ② 字幕トラック一覧を取得
    const captionsListUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`;
    const captionsRes = await fetch(captionsListUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const captionsData = await captionsRes.json();

    if (!captionsRes.ok) {
      return jsonResponse(
        {
          error: "YouTube captions.list API エラー",
          status: captionsRes.status,
          detail: captionsData.error?.message || JSON.stringify(captionsData).slice(0, 300),
        },
        captionsRes.status
      );
    }

    if (!captionsData.items || captionsData.items.length === 0) {
      return jsonResponse(
        {
          videoId,
          transcript: null,
          message: "字幕が見つかりませんでした。手動で内容を入力してください。",
        },
        404
      );
    }

    // 日本語字幕を優先、なければ最初の字幕を使用
    const jaCaption = captionsData.items.find(c => c.snippet.language === "ja" || c.snippet.language === "ja-JP");
    const caption = jaCaption || captionsData.items[0];

    // ③ 字幕テキストをダウンロード（format=text でプレーンなテキストを取得）
    const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${caption.id}?format=text`;
    const downloadRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!downloadRes.ok) {
      const errText = await downloadRes.text();
      return jsonResponse(
        {
          videoId,
          error: `字幕ダウンロード失敗 (${downloadRes.status})`,
          detail: errText.slice(0, 300),
        },
        downloadRes.status
      );
    }

    const transcript = await downloadRes.text();

    return jsonResponse({
      videoId,
      transcript,
      language: caption.snippet.language,
      captionId: caption.id,
      trackKind: caption.snippet.trackKind,
    });
  } catch (err) {
    return jsonResponse({ error: "Worker内部エラー", detail: String(err && err.message || err) }, 500);
  }
}