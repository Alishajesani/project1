const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function getFirebaseCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    return admin.credential.cert(serviceAccount);
  }

  const localKeyPath = path.join(__dirname, "..", "serviceAccountKey.json");
  if (fs.existsSync(localKeyPath)) {
    return admin.credential.cert(require(localKeyPath));
  }

  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getFirebaseCredential(),
  });
}

async function requireFirebaseAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { requireFirebaseAuth };
