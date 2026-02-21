const express = require("express");
const Stripe = require("stripe");
const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/create-checkout-session", async (req, res) => {
  try {
    // you should pass user uid/email from frontend (must be logged in)
    const { uid, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7, // free for 7 days, auto renew on day 8
        metadata: { uid },    // link stripe to firebase user
      },
      success_url: `${process.env.CLIENT_URL}/chat?upgraded=1`,
      cancel_url: `${process.env.CLIENT_URL}/settings?canceled=1`,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

module.exports = router;