// ================================
// Night Desk — script.js (FULL)
// Paste this entire file into public/script.js
// ================================

// SECTION: Types & State (MVVM-style)
const NightDeskState = {
  currentScreen: "dashboard", // "dashboard" | "chat" | "ledger"
  timeMode: "local", // "local" | "simulated"
  watchStatus: "on", // "on" | "late" | "off"
  activeIntent: "leasing", // "leasing" | "maintenance" | "landlord"
  messages: [], // { id, from: "user"|"agent", text, timestamp }
  ledger: {
    contact: "—",
    unit: "—",
    intent: "—",
    urgency: "—",
    followup: "—",
  },
  handoffSummary: "",
};

let messageIdCounter = 1;

// SECTION: Network Layer (real backend + mock fallback)
const NightDeskService = {
  // ✅ YOUR RAILWAY BACKEND URL (no trailing slash)
  railwayBaseUrl: "https://nodejs-production-268bf.up.railway.app",

  // If the UI is being served from the same origin (recommended), use relative calls.
  // If you're hosting UI somewhere else, it will call the Railway URL.
  getBaseUrl() {
    const origin = window.location.origin;
    // If you're already on the Railway domain, don't hardcode; use same-origin.
    if (origin.includes("up.railway.app")) return "";
    // Otherwise call the Railway backend directly.
    return this.railwayBaseUrl;
  },

  async callBackend(message, intent, watchStatus) {
    const base = this.getBaseUrl();
    const url = `${base}/api/nightdesk/reply`;

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, intent, watchStatus }),
      });
    } catch (err) {
      throw new Error("Network error reaching Night Desk server.");
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      throw new Error("Server did not return valid JSON.");
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.reply || `Server error (HTTP ${res.status}).`);
    }

    const reply = data?.reply;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("No reply returned from server.");
    }
    return reply;
  },

  // Mock fallback (used if server fails)
  getMockReply(userText, context) {
    const lower = userText.toLowerCase();
    const lines = [];

    lines.push("Thanks for reaching out to Night Desk.");

    if (lower.includes("photo") || lower.includes("picture") || lower.includes("photos")) {
      lines.push("I can share standard floorplan images and help schedule a tour.");
    }

    if (lower.includes("leak") || lower.includes("fire") || lower.includes("gas")) {
      lines.push("If this is urgent (fire, gas, major leak), call 911 and the building’s on-call line.");
    }

    if (context.intent === "leasing") {
      lines.push("To help quickly:");
      lines.push("1) What size unit are you looking for?");
      lines.push("2) What move-in timeframe?");
      lines.push("3) Any budget range?");
    } else if (context.intent === "maintenance") {
      lines.push("To route correctly:");
      lines.push("1) What unit number?");
      lines.push("2) What issue is happening?");
      lines.push("3) Is anyone home right now?");
    } else if (context.intent === "landlord") {
      lines.push("To log this for the owner:");
      lines.push("1) Tenant or prospective?");
      lines.push("2) Which unit/property?");
      lines.push("3) How urgent is it?");
    }

    lines.push("Note: I won’t confirm tours or pricing unless it’s documented for this property.");

    return lines.join("\n\n");
  },

  // Stream typing effect
  async streamReply(userMessage, onChunk, options = {}) {
    const { useBackend = true, intent, watchStatus } = options;

    let fullText = userMessage;

    if (useBackend) {
      try {
        fullText = await this.callBackend(userMessage, intent, watchStatus);
      } catch (err) {
        console.error("Backend failed; using fallback:", err);
        fullText =
          "⚠️ Night Desk AI is unavailable right now.\n" +
          `Reason: ${err?.message || "Unknown error"}\n\n` +
          this.getMockReply(userMessage, { intent, watchStatus });
      }
    }

    const chars = Array.from(fullText);
    let index = 0;

    const step = () => {
      if (index >= chars.length) {
        onChunk("", true);
        return;
      }
      const batchSize = 3;
      const slice = chars.slice(index, index + batchSize).join("");
      index += batchSize;
      onChunk(slice, false);
      setTimeout(step, 15);
    };

    step();
  },
};

// SECTION: View Helpers
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getCurrentTimeLabel() {
  if (NightDeskState.timeMode === "local") {
    return { time: formatTime(new Date()), modeLabel: "Local time" };
  }
  const simulated = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { time: formatTime(simulated), modeLabel: "Simulated watch window" };
}

function applyWatchStatus() {
  const pill = document.getElementById("statusPill");
  if (!pill) return;

  const label = pill.querySelector(".nd-status-label");
  const dot = pill.querySelector(".nd-status-dot");
  if (!label || !dot) return;

  pill.dataset.state = NightDeskState.watchStatus;

  if (NightDeskState.watchStatus === "on") {
    label.textContent = "On Watch";
    dot.style.background = "var(--nd-color-status-on)";
    dot.style.boxShadow = "0 0 12px rgba(34, 197, 94, 0.7)";
  } else if (NightDeskState.watchStatus === "late") {
    label.textContent = "Late Watch";
    dot.style.background = "var(--nd-color-status-late)";
    dot.style.boxShadow = "0 0 12px rgba(250, 204, 21, 0.7)";
  } else {
    label.textContent = "Off Duty";
    dot.style.background = "var(--nd-color-status-off)";
    dot.style.boxShadow = "0 0 0 rgba(0,0,0,0)";
  }
}

function applyTimeMetrics() {
  const { time, modeLabel } = getCurrentTimeLabel();
  const timeEl = document.getElementById("metricTime");
  const modeEl = document.getElementById("metricTimeMode");
  if (timeEl) timeEl.textContent = time;
  if (modeEl) modeEl.textContent = modeLabel;
}

function switchScreen(screen) {
  NightDeskState.currentScreen = screen;
  document.querySelectorAll(".nd-screen").forEach((node) => {
    node.classList.toggle("nd-screen--active", node.id === `screen-${screen}`);
  });
  document.querySelectorAll(".nd-nav-item").forEach((btn) => {
    btn.classList.toggle("nd-nav-item--active", btn.dataset.screen === screen);
  });
}

function setIntent(intent) {
  NightDeskState.activeIntent = intent;
  document.querySelectorAll(".nd-chip").forEach((chip) => {
    chip.classList.toggle("nd-chip--selected", chip.dataset.intent === intent);
  });
}

// SECTION: Chat Rendering
function appendMessage({ from, text, timestamp, streamingId }) {
  const log = document.getElementById("chatLog");
  const msgId = streamingId || `m-${messageIdCounter++}`;

  if (!log) return { id: msgId, bubble: null };

  const wrapper = document.createElement("div");
  wrapper.className = `nd-chat-message nd-chat-message--${from}`;
  wrapper.dataset.id = msgId;

  const bubble = document.createElement("div");
  bubble.className = `nd-chat-bubble nd-chat-bubble--${from}`;
  bubble.textContent = text;

  const meta = document.createElement("div");
  meta.className = "nd-chat-meta";
  const timeSpan = document.createElement("span");
  timeSpan.textContent = timestamp || formatTime(new Date());
  const fromSpan = document.createElement("span");
  fromSpan.textContent = from === "user" ? "You" : "Night Desk AI";
  meta.appendChild(timeSpan);
  meta.appendChild(fromSpan);

  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);
  log.appendChild(wrapper);
  log.scrollTop = log.scrollHeight;

  return { id: msgId, bubble };
}

function updateStreamingBubble(id, newText) {
  const log = document.getElementById("chatLog");
  if (!log) return;
  const node = log.querySelector(`[data-id="${id}"] .nd-chat-bubble`);
  if (node) {
    node.textContent = newText;
    log.scrollTop = log.scrollHeight;
  }
}

// SECTION: Ledger Extraction (demo)
function simulateExtractionFromMessages() {
  const messages = NightDeskState.messages;
  if (!messages.length) {
    return {
      contact: "—",
      unit: "—",
      intent: "—",
      urgency: "—",
      followup: "—",
      handoff: "No chat transcript available yet.",
    };
  }

  const lastUser = [...messages].reverse().find((m) => m.from === "user");
  const body = lastUser ? lastUser.text : "";

  let contact = "—";
  const emailMatch = body.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/);
  const phoneMatch = body.match(/(\+?\d[\d\s-]{6,}\d)/);
  if (emailMatch) contact = emailMatch[0];
  else if (phoneMatch) contact = phoneMatch[0];

  let unit = "—";
  const unitMatch = body.match(/(unit|apt|apartment)\s+([A-Za-z0-9-]+)/i);
  if (unitMatch) unit = unitMatch[2];

  let urgency = "Flexible";
  if (/asap|urgent|tonight|today/i.test(body)) urgency = "Same-day if possible";
  else if (/this week|next few days/i.test(body)) urgency = "This week";

  let intentLabel = "Leasing";
  if (NightDeskState.activeIntent === "maintenance") intentLabel = "Maintenance";
  if (NightDeskState.activeIntent === "landlord") intentLabel = "Landlord";

  const followup =
    NightDeskState.watchStatus === "off"
      ? "Batch for morning review"
      : NightDeskState.watchStatus === "late"
      ? "Within the hour"
      : "Immediate";

  const handoffParts = [];
  handoffParts.push("Night Desk · Morning Handoff");
  handoffParts.push("--------------------------------");
  handoffParts.push(`Intent: ${intentLabel}`);
  handoffParts.push(`Contact: ${contact}`);
  handoffParts.push(`Unit / floorplan: ${unit}`);
  handoffParts.push(`Urgency: ${urgency}`);
  handoffParts.push(`Preferred follow-up: ${followup}`);
  handoffParts.push("");
  handoffParts.push("Latest tenant message:");
  handoffParts.push(lastUser ? lastUser.text : "—");

  return {
    contact,
    unit,
    intent: intentLabel,
    urgency,
    followup,
    handoff: handoffParts.join("\n"),
  };
}

function applyLedgerToDom(extraction) {
  const container = document.getElementById("ledgerDetails");
  if (container) {
    const c = container.querySelector('[data-field="contact"]');
    const u = container.querySelector('[data-field="unit"]');
    const i = container.querySelector('[data-field="intent"]');
    const ur = container.querySelector('[data-field="urgency"]');
    const f = container.querySelector('[data-field="followup"]');
    if (c) c.textContent = extraction.contact;
    if (u) u.textContent = extraction.unit;
    if (i) i.textContent = extraction.intent;
    if (ur) ur.textContent = extraction.urgency;
    if (f) f.textContent = extraction.followup;
  }

  const handoffArea = document.getElementById("handoffSummary");
  if (handoffArea) handoffArea.value = extraction.handoff;

  NightDeskState.ledger = {
    contact: extraction.contact,
    unit: extraction.unit,
    intent: extraction.intent,
    urgency: extraction.urgency,
    followup: extraction.followup,
  };
  NightDeskState.handoffSummary = extraction.handoff;
}

// Modal helpers (optional)
function openShareModal() {
  const modal = document.getElementById("shareModal");
  const shareText = document.getElementById("shareText");
  if (!modal || !shareText) return;
  shareText.value = NightDeskState.handoffSummary || "No handoff generated yet.";
  modal.classList.add("nd-modal-backdrop--visible");
  modal.setAttribute("aria-hidden", "false");
}
function closeShareModal() {
  const modal = document.getElementById("shareModal");
  if (!modal) return;
  modal.classList.remove("nd-modal-backdrop--visible");
  modal.setAttribute("aria-hidden", "true");
}
async function copyShareText() {
  const shareText = document.getElementById("shareText");
  if (!shareText) return;
  try {
    await navigator.clipboard.writeText(shareText.value);
  } catch {
    shareText.select();
  }
}

// Initialization
function initNav() {
  document.querySelectorAll(".nd-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.screen));
  });
}
function initTimeToggle() {
  const toggle = document.getElementById("timeModeToggle");
  if (!toggle) return;
  const options = toggle.querySelectorAll(".nd-toggle-option");
  options.forEach((opt) => {
    opt.addEventListener("click", () => {
      NightDeskState.timeMode = opt.dataset.mode;
      options.forEach((o) => o.classList.toggle("nd-toggle-option--active", o === opt));
      applyTimeMetrics();
    });
  });
  applyTimeMetrics();
  setInterval(applyTimeMetrics, 30000);
}
function initStatusCycler() {
  const btn = document.getElementById("cycleStatusBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (NightDeskState.watchStatus === "on") NightDeskState.watchStatus = "late";
    else if (NightDeskState.watchStatus === "late") NightDeskState.watchStatus = "off";
    else NightDeskState.watchStatus = "on";
    applyWatchStatus();
  });
  applyWatchStatus();
}
function initIntentChips() {
  document.querySelectorAll(".nd-chip").forEach((chip) => {
    chip.addEventListener("click", () => setIntent(chip.dataset.intent));
  });
  setIntent(NightDeskState.activeIntent);
}
function initChat() {
  const form = document.getElementById("chatComposer");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  if (!form || !input || !sendBtn) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    const userMessage = {
      id: `u-${messageIdCounter++}`,
      from: "user",
      text,
      timestamp: formatTime(new Date()),
    };
    NightDeskState.messages.push(userMessage);
    appendMessage(userMessage);

    input.value = "";
    input.focus();

    sendBtn.disabled = true;

    const intent = NightDeskState.activeIntent;
    const watchStatus = NightDeskState.watchStatus;

    const { id } = appendMessage({
      from: "agent",
      text: "…",
      timestamp: formatTime(new Date()),
      streamingId: `s-${messageIdCounter++}`,
    });

    let currentText = "";

    NightDeskService.streamReply(
      text,
      (chunk, done) => {
        currentText += chunk;
        updateStreamingBubble(id, currentText || "…");
        if (done) {
          sendBtn.disabled = false;
          NightDeskState.messages.push({
            id,
            from: "agent",
            text: currentText,
            timestamp: formatTime(new Date()),
          });
        }
      },
      { useBackend: true, intent, watchStatus }
    );
  });

  appendMessage({
    from: "agent",
    text: "Night Desk is online. How can I help tonight?",
    timestamp: formatTime(new Date()),
  });
}
function initLedger() {
  const genBtn = document.getElementById("generateHandoffBtn");
  const openShare = document.getElementById("openHandoffShare");
  if (genBtn) {
    genBtn.addEventListener("click", () => {
      const extraction = simulateExtractionFromMessages();
      applyLedgerToDom(extraction);
    });
  }
  if (openShare) openShare.addEventListener("click", openShareModal);
}
function initModal() {
  const closeA = document.getElementById("closeShareModal");
  const closeB = document.getElementById("closeShareModalPrimary");
  const backdrop = document.getElementById("shareModal");
  const copyBtn = document.getElementById("copyShareText");

  if (closeA) closeA.addEventListener("click", closeShareModal);
  if (closeB) closeB.addEventListener("click", closeShareModal);
  if (copyBtn) copyBtn.addEventListener("click", copyShareText);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeShareModal();
    });
  }
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initTimeToggle();
  initStatusCycler();
  initIntentChips();
  initChat();
  initLedger();
  initModal();
});
