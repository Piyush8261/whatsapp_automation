// whatsappClient.js
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

let client;
let isReady = false;
let qrCodeData = null;
let initializing = false;
let ioInstance = null; // socket.io reference

// initialize WhatsApp client
export function initWhatsapp(io) {
  if (client || initializing) return client; // prevent multiple clients
  initializing = true;
  ioInstance = io; // save socket.io instance

  client = new Client({
    authStrategy: new LocalAuth({ clientId: "user-session" }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  // 🔑 QR handler
  client.on("qr", (qr) => {
    qrCodeData = qr;
    isReady = false;

    // Debug helpers
    const codes = [...qr].map((c) => c.charCodeAt(0));
    console.log("📲 New QR generated! Scan this in terminal OR via frontend");
    console.log("QR Code Data:", qr);
    console.log("length:", qr.length);

    // emit via socket.io if frontend is connected
    if (ioInstance) {
      ioInstance.emit("qr", { qr, length: qr.length, codes });
    }

    // terminal QR
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    isReady = true;
    qrCodeData = null;
    console.log("✅ WhatsApp client is ready!");
    if (ioInstance) ioInstance.emit("ready");
  });

  client.on("authenticated", () => {
    console.log("🔑 WhatsApp authentication successful!");
  });

  client.on("auth_failure", (msg) => {
    console.error("❌ Authentication failed:", msg);
    isReady = false;
    if (ioInstance) ioInstance.emit("auth_failure", msg);
  });

  client.on("disconnected", async (reason) => {
  console.warn("⚠️ WhatsApp client disconnected:", reason);
  isReady = false;
  qrCodeData = null;

  try {
    if (client) {
      await client.destroy();  // ✅ properly release puppeteer + file handles
    }
  } catch (err) {
    console.error("⚠️ Error during destroy:", err.message);
  }

  client = null;
  initializing = false;

  if (ioInstance) ioInstance.emit("disconnected", reason);

  console.log("🔄 Reinitializing WhatsApp client in 5s...");
  setTimeout(() => initWhatsapp(ioInstance), 5000); // retry after delay
});


  client.initialize().finally(() => {
    initializing = false;
  });

  return client;
}

// return client safely
export function getClient() {
  if (!client) throw new Error("WhatsApp client not initialized yet!");
  return client;
}

// expose status to frontend (poll or socket)
export function getWhatsappStatus() {
  const qr = isReady ? null : qrCodeData;

  return {
    ready: isReady,
    qr, // QR string (or null if ready)
    qrLength: qr ? qr.length : 0,
    qrCodes: qr ? [...qr].map((c) => c.charCodeAt(0)) : [],
  };
}
