exports.submitContact = (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }
    console.log("📩 New Contact Message:", { name, email, message });
    res.status(200).json({ success: true, message: "Message received successfully 🚀" });
  };
  