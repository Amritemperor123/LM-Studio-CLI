const els = {
  statusBadge: document.getElementById("status-badge"),
  sessionId: document.getElementById("session-id"),
  totalTokens: document.getElementById("total-tokens"),
  toolCallCount: document.getElementById("tool-call-count"),
  currentPhase: document.getElementById("current-phase"),
  currentPhasePill: document.getElementById("current-phase-pill"),
  phaseSubtitle: document.getElementById("phase-subtitle"),
  activeRun: document.getElementById("active-run"),
  trailContainer: document.getElementById("trail-container"),
  actionBody: document.getElementById("action-body"),
  actionSummary: document.getElementById("action-summary"),
  inputTokensVal: document.getElementById("input-tokens-val"),
  outputTokensVal: document.getElementById("output-tokens-val"),
  inputTokensBar: document.getElementById("input-tokens-bar"),
  outputTokensBar: document.getElementById("output-tokens-bar"),
  totalRounds: document.getElementById("total-rounds"),
  successRate: document.getElementById("success-rate"),
  avgDuration: document.getElementById("avg-duration"),
  approvedCount: document.getElementById("approved-count"),
  deniedCount: document.getElementById("denied-count"),
  activeModel: document.getElementById("active-model"),
  activeWorkspace: document.getElementById("active-workspace"),
  lastRequest: document.getElementById("last-request"),
  lastReply: document.getElementById("last-reply"),
  usageModel: document.getElementById("usage-model"),
  promptShare: document.getElementById("prompt-share"),
  completionShare: document.getElementById("completion-share"),
  clearTrail: document.getElementById("clear-trail"),
};

const state = {
  inputTokens: 0,
  outputTokens: 0,
  runs: 0,
  completedRuns: 0,
  durationMs: 0,
  toolCalls: 0,
  toolSuccesses: 0,
  toolFailures: 0,
  approvals: 0,
  denials: 0,
  activeRunId: null,
  actionRows: 0,
};

function connect() {
  const ws = new WebSocket(`ws://${window.location.host}`);

  ws.addEventListener("open", () => {
    els.statusBadge.innerHTML = '<span class="dot connected"></span>Connected';
  });

  ws.addEventListener("close", () => {
    els.statusBadge.innerHTML = '<span class="dot"></span>Disconnected';
    setTimeout(connect, 1500);
  });

  ws.addEventListener("message", (event) => {
    try {
      handleTelemetry(JSON.parse(event.data));
    } catch (error) {
      addTrailEntry("error", "Dashboard", `Could not parse telemetry event: ${error.message}`, new Date());
    }
  });
}

function handleTelemetry(payload) {
  if (payload.event === "DASHBOARD_HISTORY") {
    resetDashboard();
    for (const item of payload.data.events) {
      handleTelemetry(item);
    }
    return;
  }

  const { event, timestamp, data = {} } = payload;
  const time = timestamp ? new Date(timestamp) : new Date();

  switch (event) {
    case "SESSION_INIT":
      setConfig(data);
      addTrailEntry("system", "Session", "CLI session connected to the telemetry hub.", time);
      break;
    case "RUN_START":
      state.runs += 1;
      state.activeRunId = data.id;
      els.sessionId.textContent = shortId(data.id);
      els.activeRun.textContent = shortId(data.id);
      els.lastRequest.textContent = data.userRequest || "None";
      setConfig(data);
      setPhase("thinking", `Run ${shortId(data.id)} started`);
      addTrailEntry("system", "Run started", quote(data.userRequest), time);
      break;
    case "PHASE_CHANGE":
      setPhase(data.phase, data.round ? `Round ${data.round}` : "Run phase updated");
      addTrailEntry("phase", "Phase", humanize(data.phase), time);
      break;
    case "TOOL_CALL":
      state.toolCalls += 1;
      addTrailEntry("tool", data.tool || "Tool", describeRequest(data.request || data), time);
      updateActionSummary();
      break;
    case "TOOL_APPROVAL":
      if (data.approved) state.approvals += 1;
      else state.denials += 1;
      addTrailEntry(data.approved ? "result-ok" : "result-fail", "Approval", approvalText(data), time);
      break;
    case "TOOL_RESULT":
      if (data.ok) state.toolSuccesses += 1;
      else state.toolFailures += 1;
      addActionRow(data, time);
      addTrailEntry(data.ok ? "result-ok" : "result-fail", data.tool || "Tool result", resultText(data), time);
      break;
    case "USAGE_UPDATE":
      applyUsage(data);
      break;
    case "MODEL_REPLY":
      els.lastReply.textContent = data.reply || "None";
      addTrailEntry("reply", "Assistant reply", trim(data.reply, 180), time);
      break;
    case "MODEL_ERROR":
      addTrailEntry("error", "Model error", data.message || "Unknown model error", time);
      break;
    case "RUN_END":
      state.completedRuns += 1;
      state.durationMs += Number(data.durationMs) || 0;
      els.lastReply.textContent = data.reply || els.lastReply.textContent;
      setPhase(data.cancelled ? "cancelled" : "complete", `${data.executedTools || 0} tool calls in ${formatDuration(data.durationMs)}`);
      addTrailEntry(data.cancelled ? "result-fail" : "result-ok", "Run ended", data.cancelled ? "Cancelled" : `Completed in ${formatDuration(data.durationMs)}`, time);
      break;
    default:
      addTrailEntry("system", event, JSON.stringify(data), time);
  }

  updateStats();
}

function resetDashboard() {
  Object.assign(state, {
    inputTokens: 0,
    outputTokens: 0,
    runs: 0,
    completedRuns: 0,
    durationMs: 0,
    toolCalls: 0,
    toolSuccesses: 0,
    toolFailures: 0,
    approvals: 0,
    denials: 0,
    activeRunId: null,
    actionRows: 0,
  });
  els.trailContainer.innerHTML = "";
  els.actionBody.innerHTML = "";
  updateStats();
}

function setConfig(data) {
  if (data.model !== undefined) {
    els.activeModel.textContent = data.model || "Auto-select";
    els.usageModel.textContent = data.model || "Auto-select";
  }
  if (data.cwd) {
    els.activeWorkspace.textContent = data.cwd;
    els.activeWorkspace.title = data.cwd;
  }
}

function setPhase(phase = "idle", subtitle = "") {
  const label = humanize(phase);
  els.currentPhase.textContent = label;
  els.currentPhasePill.textContent = label;
  els.phaseSubtitle.textContent = subtitle;
}

function applyUsage(data) {
  const usage = data.usage || {};
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completion = usage.completion_tokens ?? usage.output_tokens ?? 0;

  state.inputTokens += Number(prompt) || 0;
  state.outputTokens += Number(completion) || 0;

  if (data.model) {
    els.usageModel.textContent = data.model;
  }
}

function addTrailEntry(kind, title, message, time) {
  removeTrailEmpty();
  const row = document.createElement("div");
  row.className = `event ${kind}`;
  row.innerHTML = `
    <div class="event-time mono">${escapeHtml(formatTime(time))}</div>
    <div>
      <div class="event-title"><span class="event-dot"></span>${escapeHtml(title)}</div>
      <div class="event-message">${escapeHtml(message || "")}</div>
    </div>
  `;
  els.trailContainer.prepend(row);
  trimChildren(els.trailContainer, 160);
}

function addActionRow(data, time) {
  const empty = document.getElementById("empty-action-row");
  if (empty) empty.remove();

  state.actionRows += 1;
  const row = document.createElement("tr");
  const detail = data.path || data.command || data.error?.message || trim(data.data, 120) || "N/A";
  row.innerHTML = `
    <td class="mono">${escapeHtml(data.tool || "unknown")}</td>
    <td class="details">${escapeHtml(detail)}</td>
    <td><span class="result ${data.ok ? "ok" : "fail"}">${data.ok ? "Success" : "Failed"}</span></td>
    <td class="mono subtle">${escapeHtml(formatTime(time))}</td>
  `;
  els.actionBody.prepend(row);
  trimChildren(els.actionBody, 120);
}

function updateStats() {
  const total = state.inputTokens + state.outputTokens;
  const toolResults = state.toolSuccesses + state.toolFailures;
  const successRate = toolResults > 0 ? Math.round((state.toolSuccesses / toolResults) * 100) : 0;
  const promptShare = total > 0 ? Math.round((state.inputTokens / total) * 100) : 0;
  const completionShare = total > 0 ? 100 - promptShare : 0;
  const maxTokens = Math.max(state.inputTokens, state.outputTokens, 1);

  els.totalTokens.textContent = formatNumber(total);
  els.inputTokensVal.textContent = formatNumber(state.inputTokens);
  els.outputTokensVal.textContent = formatNumber(state.outputTokens);
  els.inputTokensBar.style.width = `${(state.inputTokens / maxTokens) * 100}%`;
  els.outputTokensBar.style.width = `${(state.outputTokens / maxTokens) * 100}%`;
  els.promptShare.textContent = `${promptShare}%`;
  els.completionShare.textContent = `${completionShare}%`;
  els.totalRounds.textContent = formatNumber(state.runs);
  els.toolCallCount.textContent = formatNumber(state.toolCalls);
  els.successRate.textContent = `${successRate}%`;
  els.approvedCount.textContent = formatNumber(state.approvals);
  els.deniedCount.textContent = formatNumber(state.denials);
  els.avgDuration.textContent = state.completedRuns ? formatDuration(state.durationMs / state.completedRuns) : "0s";
  updateActionSummary();
}

function updateActionSummary() {
  const failures = state.toolFailures ? `${state.toolFailures} failed` : "no failures";
  els.actionSummary.textContent = `${state.toolCalls} requested, ${failures}`;
}

function removeTrailEmpty() {
  const empty = els.trailContainer.querySelector(".empty");
  if (empty) empty.remove();
}

function describeRequest(request) {
  if (request.command) return request.command;
  if (request.path) return request.path;
  if (request.query) return `query: ${request.query}`;
  return "Tool requested by model";
}

function resultText(data) {
  if (data.ok) return trim(data.data || "Completed successfully", 180);
  return trim(data.error?.message || "Tool failed", 180);
}

function approvalText(data) {
  if (data.automatic) return `${data.tool} approved automatically`;
  return `${data.tool} ${data.approved ? "approved" : "denied"} by user`;
}

function humanize(value = "") {
  return String(value).replace(/_/g, " ").trim() || "Idle";
}

function quote(value) {
  return value ? `"${value}"` : "No prompt text";
}

function trim(value, limit) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : "N/A";
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatDuration(ms = 0) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Math.round(Number(value) || 0));
}

function trimChildren(element, max) {
  while (element.children.length > max) {
    element.lastElementChild.remove();
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

els.clearTrail.addEventListener("click", () => {
  els.trailContainer.innerHTML = '<div class="empty">Trail cleared. New telemetry will appear here.</div>';
});

connect();
