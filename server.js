import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import messageRoutes from "./routes/messages.js";
import startScheduler from "./scheduler.js";
import { initWhatsapp } from "./whatsappClient.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true, limit: "150mb" }));

// Routes
app.use("/api/messages", messageRoutes);

// MongoDB connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");

    // Init WhatsApp
    const client = initWhatsapp();

    // Start scheduler only after WA client is ready
    client.on("ready", () => {
      console.log("🤖 WhatsApp client ready, starting scheduler...");
      startScheduler();
    });

    // Handle disconnects gracefully
    client.on("disconnected", (reason) => {
      console.error("⚠️ WhatsApp client disconnected:", reason);
    });

    // Start server
    app.listen(process.env.PORT, () =>
      console.log(`🚀 Server running on port ${process.env.PORT}`)
    );
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Catch unexpected errors
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});
