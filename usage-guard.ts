/**
 * 第二の脳 — 使用量ガード（Usage Guard）
 *
 * テストフェーズ（自分のみ利用）向けのクライアント側実装。
 * 将来、複数人が使う段階になったら、この仕組みはサーバー側
 * （Claude APIとの間に立つ簡易プロキシ）に移植すること。
 * クライアント側だけの制限は、悪意あるユーザーには回避されうるため。
 */

// ===== モデルごとの料金（USD / 100万トークン）=====
// 最新の正確な数値は https://claude.com/pricing で必ず確認すること
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

// ===== 予算設定（ここを自分の許容額に合わせて調整）=====
export interface BudgetConfig {
  dailyLimitJPY: number;
  weeklyLimitJPY: number;
  monthlyLimitJPY: number;
  usdToJpy: number; // 概算為替レート。厳密さは不要、安全側に少し高めに設定推奨
}

export const DEFAULT_BUDGET: BudgetConfig = {
  dailyLimitJPY: 200,
  weeklyLimitJPY: 800,
  monthlyLimitJPY: 1000,
  usdToJpy: 160,
};

// ===== 使用ログの型 =====
interface UsageEntry {
  timestamp: string; // ISO
  model: string;
  inputTokens: number;
  outputTokens: number;
  costJPY: number;
}

const STORAGE_KEY = "second-brain-usage-log";

function loadLog(): UsageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLog(log: UsageEntry[]) {
  // 肥大化を防ぐため直近90日分だけ保持
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const trimmed = log.filter(e => new Date(e.timestamp).getTime() > cutoff);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function calcCostJPY(model: string, inputTokens: number, outputTokens: number, usdToJpy: number): number {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-5"];
  const usd = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return usd * usdToJpy;
}

/** API呼び出し「後」に、実際のusageを記録する */
export function recordUsage(model: string, inputTokens: number, outputTokens: number, budget = DEFAULT_BUDGET) {
  const log = loadLog();
  log.push({
    timestamp: new Date().toISOString(),
    model,
    inputTokens,
    outputTokens,
    costJPY: calcCostJPY(model, inputTokens, outputTokens, budget.usdToJpy),
  });
  saveLog(log);
}

function sumSince(log: UsageEntry[], sinceMs: number): number {
  const cutoff = Date.now() - sinceMs;
  return log
    .filter(e => new Date(e.timestamp).getTime() > cutoff)
    .reduce((sum, e) => sum + e.costJPY, 0);
}

export interface SpendSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

export function getSpendSummary(): SpendSummary {
  const log = loadLog();
  return {
    today: sumSince(log, 24 * 60 * 60 * 1000),
    thisWeek: sumSince(log, 7 * 24 * 60 * 60 * 1000),
    thisMonth: sumSince(log, 30 * 24 * 60 * 60 * 1000),
  };
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  summary: SpendSummary;
}

/**
 * API呼び出し「前」に必ずこれを呼び、allowedがfalseなら送信しない。
 * UIはreasonをそのままユーザーに表示する。
 */
export function checkBudget(budget = DEFAULT_BUDGET): BudgetCheckResult {
  const summary = getSpendSummary();

  if (summary.today >= budget.dailyLimitJPY) {
    return { allowed: false, reason: `本日の上限（¥${budget.dailyLimitJPY}）に達しました。明日また使えます。`, summary };
  }
  if (summary.thisWeek >= budget.weeklyLimitJPY) {
    return { allowed: false, reason: `今週の上限（¥${budget.weeklyLimitJPY}）に達しました。`, summary };
  }
  if (summary.thisMonth >= budget.monthlyLimitJPY) {
    return { allowed: false, reason: `今月の上限（¥${budget.monthlyLimitJPY}）に達しました。設定画面から上限を見直せます。`, summary };
  }
  return { allowed: true, summary };
}

// ===== 使用イメージ =====
//
// // ①送信前に必ずチェック
// const check = checkBudget();
// if (!check.allowed) {
//   showErrorToUser(check.reason);
//   return; // ここでAPI呼び出し自体を止める
// }
//
// // ②実際にAPIを呼ぶ
// const response = await fetch("https://api.anthropic.com/v1/messages", { ... });
// const data = await response.json();
//
// // ③呼び出し後、実際の使用量を記録（レスポンスのusageフィールドを使う）
// recordUsage("claude-sonnet-5", data.usage.input_tokens, data.usage.output_tokens);
//
// // ④設定画面等でいつでも確認できる
// const summary = getSpendSummary();
// console.log(`今月: ¥${summary.thisMonth.toFixed(1)} / 上限 ¥${DEFAULT_BUDGET.monthlyLimitJPY}`);
