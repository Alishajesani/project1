const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.chat = async (req, res) => {
  try {
    console.log("KEY loaded?", !!process.env.OPENAI_API_KEY);

    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI agent. Be concise, ask clarifying questions when needed, and give structured answers.",
        },
        ...messages,
      ],
      temperature: 0.6,
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    return res.json({ reply });
} catch (err) {
    console.error("=== OPENAI ERROR START ===");
    console.error("status:", err?.status);
    console.error("message:", err?.message);
    console.error("data:", err?.response?.data);
    console.error("=== OPENAI ERROR END ===");
    return res.status(500).json({ error: "AI chat failed" });
}
  
};
