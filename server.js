import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/nightdesk/reply", async (req, res) => {
  try {
    const { message = "", intent = "leasing", watchStatus = "on" } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        reply: "OPENAI_API_KEY not set in Railway Variables."
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `You are Night Desk AI for property managers.
Intent: ${intent}
Watch status: ${watchStatus}
Be professional and concise.`
          },
          {
            role: "user",
            content: message
          }
        ],
        max_output_tokens: 250
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      return res.status(500).json({
        reply: "OpenAI request failed. Check logs."
      });
    }

    const reply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "No response returned.";

    res.json({ reply });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ reply: "Server crashed internally." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Night Desk running on port", PORT);
});
