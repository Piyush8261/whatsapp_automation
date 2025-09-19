import express from "express";
import ScheduledMessage from "../models/ScheduledMessage.js";
import { getClient, getWhatsappStatus } from "../whatsappClient.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// -------------------- Ensure uploads folder exists --------------------
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// -------------------- MULTER STORAGE --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // save files in /uploads folder
  },
  filename: (req, file, cb) => {
    // Unique filename: media-<timestamp>.<ext>
    cb(
      null,
      "media-" + Date.now() + path.extname(file.originalname)
    );
  }
});

const upload = multer({ storage });

// -------------------- API ROUTES --------------------

// ✅ WhatsApp Status (for frontend to check if QR needed or client ready)
router.get("/status", (req, res) => {
  try {
    const status = getWhatsappStatus(); // { isReady, qrCodeData }
    res.json(status);
    //console.log("✅ Status fetched:", status);
  } catch (err) {
    console.error("❌ Status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Schedule message (with optional media)
router.post("/schedule", upload.single("media"), async (req, res) => {
  try {
    const { text, group, scheduleTime, delay } = req.body;

    // Convert IST → UTC
    const istDate = new Date(scheduleTime);
    const utcDate = new Date(
      istDate.getTime() - 5.5 * 60 * 60 * 1000
    );

    const msg = new ScheduledMessage({
      text,
      group: Array.isArray(group) ? group : [group], // multi-groups
      scheduleTime: utcDate,
      delay: Number(delay) || 5, // seconds
      mediaPath: req.file ? req.file.path : null, // file path if uploaded
    });

    await msg.save();

    res.json({
      success: true,
      msg: "Message scheduled",
      data: msg
    });
  } catch (err) {
    console.error("❌ Schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch WhatsApp chats (groups + individuals)
router.get("/chats", async (req, res) => {
  try {
    const client = getClient();
    const chats = await client.getChats();

    const chatList = chats.map((c) => ({
      id: c.id._serialized,
      name: c.name || c.id.user,
      isGroup: c.isGroup,
    }));

    res.json(chatList);
  } catch (err) {
    console.error("❌ Chats fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
