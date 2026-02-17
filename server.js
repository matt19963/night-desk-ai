import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Serve your Night Desk website files (index.html, style.css, script.js)
app.use(express.static(__dirname));

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ✅ AI endpoint used by your frontend chat box
app.post("/api/nightdesk/reply", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const intent = String(req.body?.intent || "leasing");
    const watchStatus = String(req.body?.watchStatus || "on");

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ reply: "OPENAI_API_KEY missing in Railway Variables." });
    }

    const system = `
You are Night Desk AI for small landlords and property managers.
Intent: ${intent}
Watch status: ${watchStatus}

Rules:
- Be concise, professional, helpful.
- Ask 1–3 clarifying questions if needed.
- Do NOT invent pricing or confirm tours unless explicitly provided.
- If emergency maintenance is mentioned (fire, gas, major leak), instruct them to call 911 and the on-call building number.
`.trim();

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: message }
        ],
        max_output_tokens: 250
      })
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({ reply: "OpenAI request failed. Check Railway logs." });
    }

    const reply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "No reply returned.";

    return res.json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ reply: "Server error." });
  }
});

// ✅ Make / always serve the actual website, not a text message
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ If user refreshes on a route, still load the site (optional, but helpful)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Night Desk running on port", PORT);
});
