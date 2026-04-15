const API_BASE = String(window.__RINNAI_API_BASE__ || "")
  .trim()
  .replace(/\/+$/, "");

const form = document.getElementById("check-form");
const productHelp = document.getElementById("check-product-help");
const cardCodesInput = document.getElementById("check-card-codes");
const submitButton = document.getElementById("check-submit");
const clearButton = document.getElementById("check-clear");
const copyUsedButton = document.getElementById("check-copy-used");
const copyUnusedButton = document.getElementById("check-copy-unused");
const resultTag = document.getElementById("check-result-tag");
const message = document.getElementById("check-message");
const summary = document.getElementById("check-summary");
const totalCount = document.getElementById("check-total-count");
const usedCount = document.getElementById("check-used-count");
const unusedCount = document.getElementById("check-unused-count");
const processingCount = document.getElementById("check-processing-count");
const invalidCount = document.getElementById("check-invalid-count");
const tableBody = document.getElementById("check-table-body");

const state = {
  latestItems: []
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setResultTag(text, tone) {
  resultTag.textContent = text;
  resultTag.className = `status-badge ${tone}`;
}

function parseCodes(rawValue) {
  return Array.from(
    new Set(
      String(rawValue || "")
        .split(/[\s,;，；]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    )
  );
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

function renderEmpty(text) {
  tableBody.innerHTML = `<tr><td colspan="4" class="table-empty">${escapeHtml(text)}</td></tr>`;
}

function updateSummary(summaryData) {
  totalCount.textContent = String(summaryData.total || 0);
  usedCount.textContent = String(summaryData.used || 0);
  unusedCount.textContent = String(summaryData.unused || 0);
  processingCount.textContent = String(summaryData.processing || 0);
  invalidCount.textContent = String(summaryData.invalid || 0);
  summary.classList.remove("hidden");
}

function updateCopyButtons() {
  copyUsedButton.disabled = !state.latestItems.some((item) => item.status_code === "used");
  copyUnusedButton.disabled = !state.latestItems.some((item) => item.status_code === "available");
}

function statusClass(statusCode) {
  if (statusCode === "used") return "used";
  if (statusCode === "available") return "available";
  if (statusCode === "processing" || statusCode === "manual_review") return "processing";
  return "invalid";
}

function renderItems(items) {
  state.latestItems = items;
  if (!items.length) {
    renderEmpty("暂无查询结果");
    updateCopyButtons();
    return;
  }

  tableBody.innerHTML = items
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.card_code)}</td>
        <td><span class="status-pill-inline ${statusClass(item.status_code)}">${escapeHtml(item.usage_status)}</span></td>
        <td>${escapeHtml(item.usage_email || "-")}</td>
        <td>${escapeHtml(item.recharge_at || "-")}</td>
      </tr>
    `)
    .join("");

  updateCopyButtons();
}

function resetPage() {
  cardCodesInput.value = "";
  state.latestItems = [];
  setResultTag("等待查询", "neutral");
  message.textContent = "输入卡密后开始查询。";
  productHelp.textContent = "一行一个卡密，或使用空格、逗号分隔。";
  summary.classList.add("hidden");
  totalCount.textContent = "0";
  usedCount.textContent = "0";
  unusedCount.textContent = "0";
  processingCount.textContent = "0";
  invalidCount.textContent = "0";
  renderEmpty("暂无查询结果");
  updateCopyButtons();
  submitButton.disabled = false;
}

async function runCheck(event) {
  event.preventDefault();
  const codes = parseCodes(cardCodesInput.value);
  if (!codes.length) {
    setResultTag("缺少内容", "warning");
    message.textContent = "请先输入卡密。";
    renderEmpty("请先输入卡密");
    return;
  }

  submitButton.disabled = true;
  setResultTag("查询中", "warning");
  message.textContent = "正在批量查询卡密。";

  try {
    const payload = await fetchJson("/api/cards/check", {
      method: "POST",
      body: {
        product_key: "plus",
        card_codes: codes.join("\n")
      }
    });

    renderItems(Array.isArray(payload.items) ? payload.items : []);
    updateSummary(payload.summary || {});
    setResultTag("查询完成", "success");
    message.textContent = `共查询 ${payload.summary?.total || 0} 个卡密。`;
  } catch (error) {
    summary.classList.add("hidden");
    state.latestItems = [];
    renderEmpty("查询失败");
    updateCopyButtons();
    setResultTag("查询失败", "error");
    message.textContent = error.message || "查询失败。";
  } finally {
    submitButton.disabled = false;
  }
}

async function copyByStatus(statusCode, emptyMessage, successMessage) {
  const text = state.latestItems
    .filter((item) => item.status_code === statusCode)
    .map((item) => item.card_code)
    .join("\n");

  if (!text) {
    message.textContent = emptyMessage;
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    message.textContent = successMessage;
  } catch {
    message.textContent = "复制失败，请手动复制。";
  }
}

form.addEventListener("submit", runCheck);
clearButton.addEventListener("click", resetPage);
copyUsedButton.addEventListener("click", () => copyByStatus("used", "暂无已使用卡密。", "已使用卡密已复制。"));
copyUnusedButton.addEventListener("click", () => copyByStatus("available", "暂无未使用卡密。", "未使用卡密已复制。"));

resetPage();
