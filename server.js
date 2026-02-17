/* global process */
import OpenAI from "openai";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // For parsing application/json
app.use(limiter); // Apply the rate limiting middleware to all requests

// Basic health check endpoint
app.get("/api/nightdesk/health", (req, res) => {
  res.json({ status: "ok", message: "Night Desk backend is running." });
});

// Initialize OpenAI client
let openaiClient;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log("OpenAI client initialized with API key.");
} else {
  console.warn("OPENAI_API_KEY is not set. AI replies will not function.");
}

// Main AI reply endpoint
app.post("/api/nightdesk/reply", async (req, res) => {
  if (!openaiClient) {
    return res.status(500).json({ error: "AI service not configured. Please set OPENAI_API_KEY." });
  }

  const { message, intent, watchStatus } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message content is required." });
  }

  console.log(`Received message: "${message}" (Intent: ${intent}, Watch Status: ${watchStatus})`);

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini as a good, cost-effective choice
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text:
                "You are Night Desk, a professional, calm property management assistant. " +
                "Always ask 2–4 qualifying questions when needed, but do not ask for personal identifiable information. " +
                "Never claim you scheduled a tour unless explicitly confirmed by a human. " +
                "Never promise specific pricing or availability unless you have confirmed data (which you do not). " +
                "For true emergencies (e.g., fire, flood, active crime), direct the user to call emergency services (911/local equivalent) and the building emergency line immediately. " +
                "If the user asks for photos, respond with policy-based options (e.g., 'We can provide standard floorplan images, or schedule an in-person tour if photos are restricted for security.')." +
                `Current context: User intent is "${intent}", Building status is "${watchStatus}".`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.7, // Adjust creativity
      stream: false, // For now, we'll get the full response then send it
    });

    const replyText = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
    console.log("AI Reply:", replyText);

    // Simulate streaming by sending chunks
    res.write(JSON.stringify({ type: "start" }));
    const words = replyText.split(" ");
    for (let i = 0; i < words.length; i++) {
        // To support streaming, we send parts of the reply.
        // In a real streaming scenario, you'd get these chunks directly from OpenAI.
        res.write(JSON.stringify({ type: "chunk", content: words[i] + (i < words.length - 1 ? " " : "") }));
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for effect
    }
    res.end(JSON.stringify({ type: "end" }));

  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    // Check if it's an OpenAI error with a message
    const errorMessage = error.response && error.response.data && error.response.data.error
                         ? error.response.data.error.message
                         : "An unexpected error occurred with the AI service.";
    res.status(500).json({ error: errorMessage });
  }
});

app.listen(PORT, () => {
  console.log(`Night Desk backend running on http://localhost:${PORT}`);
  console.log(`Health check at http://localhost:${PORT}/api/nightdesk/health`);
});
