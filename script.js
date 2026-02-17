// SECTION: Types & State (MVVM-style)

/**
 * ViewModel: holds app-wide state for screens, watch status, and active intent.
 */
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

// Simple ID helper
let messageIdCounter = 1;

// SECTION: Network Layer (real backend + mock fallback)

/**
 * Network layer for Night Desk.
 *
 * - In production, this uses fetch() with your real backend URL and NEVER
 *   exposes the OpenAI API key in the client.
 * - The key must be stored as an environment variable on the backend
 *   (e.g. OPENAI_API_KEY) and used only server-side.
 */
const NightDeskService = {
  // Backend base URL placeholder. Replace this with your deployed backend.
  // Example: "https://nightdesk.yourdomain.com"
  backendBaseUrl: "http://localhost:3000", // TODO: change for production

  /**
   * Call the real backend /api/nightdesk/reply endpoint.
   * Returns { reply: string }.
   */
  async callBackend(message, intent, watchStatus) {
    const url = `${this.backendBaseUrl}/api/nightdesk/reply`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, intent, watchStatus }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Backend error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.reply || "";
  },
  // Backend base URL placeholder for your real deployment.
  // In your SwiftUI app, you might inject this via configuration.
  // Example (Swift):
  //   let baseURL = URL(string: "https://your-backend.example.com")!
  //   let replyURL = baseURL.appendingPathComponent("/api/nightdesk/reply")
  //
  // On the backend, you would read the AI API key from an env var, e.g.:
  //   const openaiApiKey = process.env.OPENAI_API_KEY;
  //   const client = new OpenAI({ apiKey: openaiApiKey });
  // and then call the Responses API from there.

    // (Conceptual example kept for SwiftUI wiring reference)
  // async function callBackend(message, intent, watchStatus) {
  //   const res = await fetch(`${backendBaseUrl}/api/nightdesk/reply`, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ message, intent, watchStatus })
  //   });
  //   return res.json();
  // }


  /**
   * Mock reply generator that simulates OpenAI behavior with property rules.
   * Used as a fallback if the real backend is unreachable.
   */
  getMockReply(userText, context) {
    const lower = userText.toLowerCase();
    const lines = [];

    // Base tone
    lines.push(
      "Thanks for reaching out to Night Desk. I can help with leasing, maintenance, or landlord questions."
    );

    // Photo policy
    if (lower.includes("photo") || lower.includes("picture") || lower.includes("photos")) {
      lines.push(
        "For photos, I can share our standard floorplan images for the building."
      );
      lines.push(
        "If you prefer, I can also help you schedule an in-person tour—once you confirm a date and time that works for you."
      );
    }

    // Emergency maintenance rules
    if (lower.includes("leak") || lower.includes("fire") || lower.includes("gas")) {
      lines.push(
        "If this is an urgent safety issue (fire, gas, major leak), please contact emergency services first and then call the on-call building number immediately."
      );
    }

    // Intent-specific framing
    if (context.intent === "leasing") {
      lines.push(
        "To make sure I give you accurate leasing details, I have a few quick questions."
      );
      lines.push(
        "1) Are you looking for a studio, 1-bedroom, 2-bedroom, or larger?"
      );
      lines.push("2) What move-in timeframe are you targeting?");
      lines.push("3) Do you have a preferred budget range per month?");
    } else if (context.intent === "maintenance") {
      lines.push("Let me gather the basics so we can route this correctly.");
      lines.push("1) What unit are you in?");
      lines.push("2) What is the maintenance issue in a sentence or two?");
      lines.push("3) Is anyone home right now, and do you have pet(s) inside?");
    } else if (context.intent === "landlord") {
      lines.push("I can help log a note for the landlord team.");
      lines.push("1) Are you a current tenant or a prospective tenant?");
      lines.push("2) What unit or property is this regarding?");
      lines.push("3) Is this time-sensitive for today, this week, or flexible?");
    }

    // Guardrails on pricing and tours
    lines.push(
      "I won’t quote pricing or confirm a tour time unless it’s already documented in your building’s settings."
    );

    return lines.join("\n\n");
  },

  /**
   * Streams a reply character-by-character using a callback.
   * If useBackend is true, it first fetches the full reply from the backend,
   * then streams it locally for a "typing" effect.
   * @param {string} textOrMessage - If useBackend=false, this is the full text.
   * @param {(chunk: string, done: boolean) => void} onChunk
   * @param {object} [options]
   * @param {boolean} [options.useBackend]
   * @param {string} [options.intent]
   * @param {string} [options.watchStatus]
   */
  async streamReply(textOrMessage, onChunk, options = {}) {
    const { useBackend = false, intent, watchStatus } = options;

    let fullText = textOrMessage;

    if (useBackend) {
      try {
        fullText = await this.callBackend(textOrMessage, intent, watchStatus);
      } catch (err) {
        console.error("Backend call failed, falling back to mock:", err);
        fullText = this.getMockReply(textOrMessage, { intent, watchStatus });
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
    return {
      time: formatTime(new Date()),
      modeLabel: "Local time",
    };
  }

  // Simulated time: offset by +7 hours for overnight watch demo.
  const simulated = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {
    time: formatTime(simulated),
    modeLabel: "Simulated watch window",
  };
}

function applyWatchStatus() {
  const pill = document.getElementById("statusPill");
  const label = pill.querySelector(".nd-status-label");
  const dot = pill.querySelector(".nd-status-dot");

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
  timeEl.textContent = time;
  modeEl.textContent = modeLabel;
}

function switchScreen(screen) {
  NightDeskState.currentScreen = screen;
  document.querySelectorAll(".nd-screen").forEach((node) => {
    node.classList.toggle("nd-screen--active", node.id === `screen-${screen}`);
  });
  document.querySelectorAll(".nd-nav-item").forEach((btn) => {
    btn.classList.toggle(
      "nd-nav-item--active",
      btn.dataset.screen === screen
    );
  });
}

function setIntent(intent) {
  NightDeskState.activeIntent = intent;
  document.querySelectorAll(".nd-chip").forEach((chip) => {
    chip.classList.toggle(
      "nd-chip--selected",
      chip.dataset.intent === intent
    );
  });
}

// SECTION: Chat Rendering

function appendMessage({ from, text, timestamp, streamingId }) {
  const log = document.getElementById("chatLog");
  const msgId = streamingId || `m-${messageIdCounter++}`;

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
  const node = log.querySelector(`[data-id="${id}"] .nd-chat-bubble`);
  if (node) {
    node.textContent = newText;
    log.scrollTop = log.scrollHeight;
  }
}

// SECTION: Ledger Extraction (simulated)

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

  // Naive pattern-based extraction just for demo purposes
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
      : "As soon as Night Desk comes back online";

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
  handoffParts.push("");
  handoffParts.push("AI guardrails:");
  handoffParts.push(
    "• Do not claim a tour is scheduled without explicit tenant confirmation."
  );
  handoffParts.push(
    "• Do not promise pricing beyond rates configured for this property."
  );
  handoffParts.push(
    "• For emergency maintenance, direct to building emergency line + 911 as appropriate."
  );

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
  container.querySelector('[data-field="contact"]').textContent =
    extraction.contact;
  container.querySelector('[data-field="unit"]').textContent = extraction.unit;
  container.querySelector('[data-field="intent"]').textContent =
    extraction.intent;
  container.querySelector('[data-field="urgency"]').textContent =
    extraction.urgency;
  container.querySelector('[data-field="followup"]').textContent =
    extraction.followup;

  const handoffArea = document.getElementById("handoffSummary");
  handoffArea.value = extraction.handoff;

  NightDeskState.ledger = {
    contact: extraction.contact,
    unit: extraction.unit,
    intent: extraction.intent,
    urgency: extraction.urgency,
    followup: extraction.followup,
  };
  NightDeskState.handoffSummary = extraction.handoff;
}

// SECTION: Share Sheet Modal

function openShareModal() {
  const modal = document.getElementById("shareModal");
  const shareText = document.getElementById("shareText");
  shareText.value = NightDeskState.handoffSummary ||
    "No Morning Handoff has been generated yet.";
  modal.classList.add("nd-modal-backdrop--visible");
  modal.setAttribute("aria-hidden", "false");
}

function closeShareModal() {
  const modal = document.getElementById("shareModal");
  modal.classList.remove("nd-modal-backdrop--visible");
  modal.setAttribute("aria-hidden", "true");
}

async function copyShareText() {
  const shareText = document.getElementById("shareText");
  try {
    await navigator.clipboard.writeText(shareText.value);
  } catch {
    // Fallback: select text for manual copy
    shareText.select();
  }
}

// SECTION: Event Handlers & Initialization

function initNav() {
  document.querySelectorAll(".nd-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchScreen(btn.dataset.screen);
    });
  });
}

function initTimeToggle() {
  const toggle = document.getElementById("timeModeToggle");
  const options = toggle.querySelectorAll(".nd-toggle-option");
  options.forEach((opt) => {
    opt.addEventListener("click", () => {
      NightDeskState.timeMode = opt.dataset.mode;
      options.forEach((o) =>
        o.classList.toggle("nd-toggle-option--active", o === opt)
      );
      applyTimeMetrics();
    });
  });

  // Keep time updated every 30s in whichever mode is selected
  applyTimeMetrics();
  setInterval(applyTimeMetrics, 30000);
}

function initStatusCycler() {
  const btn = document.getElementById("cycleStatusBtn");
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
    chip.addEventListener("click", () => {
      setIntent(chip.dataset.intent);
    });
  });
  setIntent(NightDeskState.activeIntent);
}

function initChat() {
  const form = document.getElementById("chatComposer");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const timestamp = formatTime(new Date());
    const userMessage = {
      id: `u-${messageIdCounter++}`,
      from: "user",
      text,
      timestamp,
    };
    NightDeskState.messages.push(userMessage);
    appendMessage(userMessage);

    input.value = "";
    input.focus();

    // Call backend + stream-style reply (with mock fallback)
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
    NightDeskService.streamReply(text, (chunk, done) => {
      currentText += chunk;
      updateStreamingBubble(id, currentText || "…");
      if (done) {
        sendBtn.disabled = false;
        // Save final message into state
        NightDeskState.messages.push({
          id,
          from: "agent",
          text: currentText,
          timestamp: formatTime(new Date()),
        });
      }
    }, { useBackend: true, intent, watchStatus });
  });

  // Seed with a system greeting
  appendMessage({
    from: "agent",
    text: "Night Desk is online. How can I help with your leasing or tenant question tonight?",
    timestamp: formatTime(new Date()),
  });
}

function initLedger() {
  const genBtn = document.getElementById("generateHandoffBtn");
  const openShare = document.getElementById("openHandoffShare");

  genBtn.addEventListener("click", () => {
    const extraction = simulateExtractionFromMessages();
    applyLedgerToDom(extraction);
  });

  openShare.addEventListener("click", () => {
    openShareModal();
  });
}

function initModal() {
  const closeBtns = [
    document.getElementById("closeShareModal"),
    document.getElementById("closeShareModalPrimary"),
  ];
  const backdrop = document.getElementById("shareModal");

  closeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      closeShareModal();
    });
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeShareModal();
  });

  const copyBtn = document.getElementById("copyShareText");
  copyBtn.addEventListener("click", copyShareText);
}

// SECTION: Boot

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initTimeToggle();
  initStatusCycler();
  initIntentChips();
  initChat();
  initLedger();
  initModal();
});
