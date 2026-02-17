const express = require("express");
const path = require("path");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

// Serve your HTML/CSS/JS from the repo root
app.use(express.static(__dirname));

// OpenAI client uses Railway env var
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Chat endpoint your frontend will call
app.post("/chat", async (req, res) => {
  try {
    const message = (req.body?.message || "").toString();

    if (!message.trim()) {
      return res.status(400).json({ error: "Missing message" });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Night Desk, an after-hours messaging concierge for small landlords/property managers. Be concise, helpful, and professional. Ask 1 short clarifying question if needed.",
        },
        { role: "user", content: message },
      ],
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: "Chat failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Listening on", PORT));
