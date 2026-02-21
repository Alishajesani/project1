async function chatOllama(messages, model = "gemma3:4b") {
    const resp = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });
  
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ollama error ${resp.status}: ${text}`);
    }
  
    const data = await resp.json();
    return data?.message?.content ?? "";
  }
  
  module.exports = { chatOllama };