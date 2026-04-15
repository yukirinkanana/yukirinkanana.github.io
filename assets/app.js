const PRODUCT_KEY = "plus";
const PRODUCT_LABEL = "Plus";

const API_BASE = String(window.__RINNAI_API_BASE__ || "")
  .trim()
  .replace(/\/+$/, "");

const form = document.getElementById("workflow-form");
const cardCodeInput = document.getElementById("card-code");
const verifyCardButton = document.getElementById("verify-card-button");
const cardStatusBadge = document.getElementById("card-status-badge");
const cardStatusText = document.getElementById("card-status-text");
const tokenInput = document.getElementById("token");
const tokenPrevButton = document.getElementById("token-prev-button");
const tokenNextButton = document.getElementById("token-next-button");
const reviewPrevButton = document.getElementById("review-prev-button");
const clearButton = document.getElementById("clear-button");
const startButton = document.getElementById("start-button");
const restartWorkflowButton = document.getElementById("restart-workflow-button");
const accountPreview = document.getElementById("account-preview");
const tokenStatusBadge = document.getElementById("token-status-badge");
const accountEmail = document.getElementById("account-email");
const accountMeta = document.getElementById("account-meta");
const resultTag = document.getElementById("result-tag");
const resultStageLine = document.getElementById("result-stage-line");
const reviewInlineSummary = document.getElementById("review-inline-summary");
const resultValueCard = document.getElementById("result-value-card");
const resultValueEmail = document.getElementById("result-value-email");
const resultValueAccount = document.getElementById("result-value-account");
const resultValueState = document.getElementById("result-value-state");
const resultLog = document.getElementById("result-log");
const tokenOpenLink = document.getElementById("token-open-link");
const stepPanels = Array.from(document.querySelectorAll(".panel-block"));
const stepIndicators = Array.from(document.querySelectorAll(".step-chip"));

const state = {
  verifiedCard: null,
  verifiedToken: null,
  currentStep: 1,
  workflowId: "",
  pollTimer: 0
};

const TOKEN_PAGE_URL = (() => {
  const bytes = [104, 116, 116, 112, 115, 58, 47, 47, 99, 104, 97, 116, 103, 112, 116, 46, 99, 111, 109, 47, 97, 112, 105, 47, 97, 117, 116, 104, 47, 115, 101, 115, 115, 105, 111, 110];
  return String.fromCharCode(...bytes);
})();

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeCardCode(value) {
  return String(value || "").replace(/\s+/g, "").trim().toUpperCase();
}

function getPrimaryAccount(tokenObject) {
  if (tokenObject.account && typeof tokenObject.account === "object" && !Array.isArray(tokenObject.account)) {
    return tokenObject.account;
  }

  if (tokenObject.accounts && typeof tokenObject.accounts === "object" && !Array.isArray(tokenObject.accounts)) {
    const firstKey = Object.keys(tokenObject.accounts)[0];
    const wrapper = firstKey ? tokenObject.accounts[firstKey] : null;
    if (wrapper && typeof wrapper.account === "object" && !Array.isArray(wrapper.account)) {
      return wrapper.account;
    }
    if (wrapper && typeof wrapper === "object" && !Array.isArray(wrapper)) {
      return wrapper;
    }
  }

  return null;
}

function extractTokenDetails(tokenObject) {
  const account = getPrimaryAccount(tokenObject) || {};
  return {
    email: pickString(
      tokenObject.user?.email,
      tokenObject.user?.account?.email,
      account.email,
      tokenObject.user?.name,
      account.name
    ),
    accountId: pickString(
      account.id,
      account.app_user_id,
      account.appUserId,
      account.account_id,
      tokenObject.id,
      tokenObject.app_user_id,
      tokenObject.appUserId,
      tokenObject.account_id
    ),
    structure: pickString(account.structure, tokenObject.structure),
    planType: pickString(account.planType, account.plan_type, tokenObject.planType, tokenObject.plan_type)
  };
}

function parseTokenSnapshot(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return { ok: false, error: "请先粘贴完整的 Token JSON。" };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Token JSON 必须是对象。" };
    }

    const details = extractTokenDetails(parsed);
    if (!details.email) {
      return { ok: false, error: "Token JSON 缺少可识别账号信息。" };
    }

    const structure = String(details.structure || "").trim().toLowerCase();
    const planType = String(details.planType || "").trim().toLowerCase();
    if (planType === "team" || structure === "workspace" || structure === "team") {
      return { ok: false, error: "当前只支持个人账号。" };
    }

    return { ok: true, raw, details };
  } catch {
    return { ok: false, error: "Token JSON 解析失败，请确认内容完整。" };
  }
}

function setBadge(element, text, tone) {
  element.textContent = text;
  element.className = `${element.id === "result-tag" ? "status-badge" : "mini-badge"} ${tone}`;
}

function setCardStatus(text, tone, detail) {
  setBadge(cardStatusBadge, text, tone);
  cardStatusText.textContent = detail;
}

function setTokenStatus(text, tone, primary, secondary) {
  setBadge(tokenStatusBadge, text, tone);
  accountEmail.textContent = primary;
  accountMeta.textContent = secondary;
  accountPreview.classList.remove("hidden");
}

function setResultStatus(text, tone, detail) {
  setBadge(resultTag, text, tone);
  resultStageLine.textContent = detail;
}

function renderResultLog(lines) {
  const items = Array.isArray(lines) ? lines.filter(Boolean) : [];
  resultLog.innerHTML = items.length
    ? items.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
    : "<p>暂无处理信息。</p>";
}

function canEnterStep(step) {
  if (step <= 1) return true;
  if (step === 2) return Boolean(state.verifiedCard);
  if (step === 3) return Boolean(state.verifiedCard && state.verifiedToken);
  return true;
}

function goToStep(step) {
  const nextStep = Math.max(1, Math.min(4, Number(step || 1)));
  if (!canEnterStep(nextStep)) return;
  state.currentStep = nextStep;

  stepPanels.forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.step) === nextStep);
  });

  stepIndicators.forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.step);
    indicator.classList.toggle("is-active", indicatorStep === nextStep);
    indicator.classList.toggle("is-complete", indicatorStep < nextStep);
  });
}

function renderReview() {
  if (!state.verifiedCard || !state.verifiedToken) {
    reviewInlineSummary.innerHTML = "";
    return;
  }

  const details = state.verifiedToken.details;
  const summaryItems = [
    ["卡密", state.verifiedCard.code],
    ["邮箱", details.email]
  ];
  if (details.accountId) {
    summaryItems.push(["Account ID", details.accountId]);
  }

  reviewInlineSummary.innerHTML = summaryItems
    .map(([title, value]) => `<article class="summary-item"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

async function fetchJson(pathname, options = {}) {
  const url = API_BASE ? `${API_BASE}${pathname}` : pathname;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

function updateButtons() {
  tokenNextButton.disabled = !state.verifiedToken;
  startButton.disabled = !(state.verifiedCard && state.verifiedToken) || Boolean(state.workflowId);
}

if (tokenOpenLink) {
  tokenOpenLink.href = TOKEN_PAGE_URL;
}

function resetTokenState() {
  state.verifiedToken = null;
  accountPreview.classList.add("hidden");
  setBadge(tokenStatusBadge, "未识别", "neutral");
  tokenInput.disabled = !state.verifiedCard;
  updateButtons();
}

function resetAll() {
  window.clearTimeout(state.pollTimer);
  state.pollTimer = 0;
  state.verifiedCard = null;
  state.verifiedToken = null;
  state.workflowId = "";
  cardCodeInput.value = "";
  tokenInput.value = "";
  tokenInput.disabled = true;
  accountPreview.classList.add("hidden");
  reviewInlineSummary.innerHTML = "";
  setCardStatus("未验证", "neutral", "请输入卡密后点击验证。");
  setResultStatus("等待操作", "neutral", "先验证卡密，再粘贴 Token。");
  renderResultLog(["提交后这里会显示处理进度。"]);
  resultValueCard.textContent = "-";
  resultValueEmail.textContent = "-";
  resultValueAccount.textContent = "-";
  resultValueState.textContent = "-";
  restartWorkflowButton.classList.add("hidden");
  goToStep(1);
  updateButtons();
}

async function verifyCard() {
  const code = normalizeCardCode(cardCodeInput.value);
  if (!code) {
    setCardStatus("缺少卡密", "warning", "请输入卡密。");
    return;
  }

  verifyCardButton.disabled = true;
  setCardStatus("校验中", "warning", "正在验证卡密。");

  try {
    const payload = await fetchJson("/api/cards/verify", {
      method: "POST",
      body: {
        product_key: PRODUCT_KEY,
        code
      }
    });

    state.verifiedCard = payload.card;
    tokenInput.disabled = false;
    resetTokenState();
    setCardStatus("验证通过", "success", "卡密可用，可以继续下一步。");
    goToStep(2);
  } catch (error) {
    state.verifiedCard = null;
    resetTokenState();
    setCardStatus("验证失败", "error", error.message || "卡密验证失败。");
  } finally {
    verifyCardButton.disabled = false;
    updateButtons();
  }
}

function handleTokenInput() {
  const parsed = parseTokenSnapshot(tokenInput.value);
  if (!parsed.ok) {
    setTokenStatus("未识别", "neutral", "未识别到账号", parsed.error);
    state.verifiedToken = null;
    updateButtons();
    return;
  }

  state.verifiedToken = parsed;
  const infoLines = [];
  if (parsed.details.accountId) {
    infoLines.push(`Account ID: ${parsed.details.accountId}`);
  }
  infoLines.push(`空间类型: ${parsed.details.structure || "personal"}`);
  infoLines.push(`套餐状态: ${parsed.details.planType || "free"}`);
  setTokenStatus(
    "已识别",
    "success",
    parsed.details.email,
    infoLines.join("\n")
  );
  renderReview();
  updateButtons();
}

async function startWorkflow(event) {
  event.preventDefault();
  if (!state.verifiedCard || !state.verifiedToken) {
    return;
  }

  startButton.disabled = true;
  setResultStatus("已提交", "warning", "请求已经提交，正在处理。");
  renderResultLog(["请求已经提交。"]);
  goToStep(4);

  try {
    const payload = await fetchJson("/api/workflow/start", {
      method: "POST",
      body: {
        product_key: PRODUCT_KEY,
        card_code: state.verifiedCard.code,
        token_snapshot: state.verifiedToken.raw
      }
    });

    state.workflowId = payload.job?.id || "";
    resultValueCard.textContent = state.verifiedCard.code;
    resultValueEmail.textContent = state.verifiedToken.details.email;
    resultValueAccount.textContent = state.verifiedToken.details.accountId;
    resultValueState.textContent = payload.job?.summary?.state_text || "处理中";
    pollWorkflow();
  } catch (error) {
    state.workflowId = "";
    setResultStatus("提交失败", "error", error.message || "无法提交充值请求。");
    resultValueState.textContent = "提交失败";
    renderResultLog([error.message || "无法提交充值请求。"]);
    restartWorkflowButton.classList.remove("hidden");
    updateButtons();
  }
}

async function pollWorkflow() {
  if (!state.workflowId) {
    return;
  }

  try {
    const payload = await fetchJson(`/api/workflow/status?id=${encodeURIComponent(state.workflowId)}`);
    const job = payload.job || {};

    if (job.status === "finished" && job.result) {
      const result = job.result;
      const receipt = result.receipt || {};
      setResultStatus(receipt.status_text || (result.ok ? "充值成功" : "充值失败"), result.ok ? "success" : "error", receipt.status_text || "");
      resultValueCard.textContent = result.workflow?.card_code || state.verifiedCard?.code || "-";
      resultValueEmail.textContent = receipt.account_email || state.verifiedToken?.details.email || "-";
      resultValueAccount.textContent = receipt.account_id || state.verifiedToken?.details.accountId || "-";
      resultValueState.textContent = receipt.status_text || "-";
      renderResultLog(result.log_lines || []);
      restartWorkflowButton.classList.remove("hidden");
      state.workflowId = "";
      updateButtons();
      return;
    }

    resultValueState.textContent = job.summary?.state_text || "处理中";
    setResultStatus("处理中", "warning", job.message || "后台正在处理。");
    state.pollTimer = window.setTimeout(pollWorkflow, 1500);
  } catch (error) {
    setResultStatus("查询失败", "error", error.message || "状态查询失败。");
    renderResultLog([error.message || "状态查询失败。"]);
    restartWorkflowButton.classList.remove("hidden");
    state.workflowId = "";
    updateButtons();
  }
}

stepIndicators.forEach((item) => {
  item.addEventListener("click", () => goToStep(Number(item.dataset.step)));
});

verifyCardButton.addEventListener("click", verifyCard);
tokenInput.addEventListener("input", handleTokenInput);
tokenPrevButton.addEventListener("click", () => goToStep(1));
tokenNextButton.addEventListener("click", () => {
  if (!state.verifiedToken) return;
  renderReview();
  goToStep(3);
});
reviewPrevButton.addEventListener("click", () => goToStep(2));
clearButton.addEventListener("click", resetAll);
restartWorkflowButton.addEventListener("click", resetAll);
form.addEventListener("submit", startWorkflow);

resetAll();
