import cron from "node-cron";
import ScheduledMessage from "./models/ScheduledMessage.js";
import { getClient } from "./whatsappClient.js";
import pkg from "whatsapp-web.js";

const { MessageMedia } = pkg;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function startScheduler() {
  cron.schedule("*/30 * * * * *", async () => {
    console.log("⏳ Checking for scheduled messages...");

    const client = getClient();

    // ✅ Skip if client not ready/connected
    if (!client || !client.info || !client.info.wid) {
      console.log("⚠️ WhatsApp client not connected, skipping this run.");
      return;
    }

    let chats;
    try {
      chats = await client.getChats();
    } catch (err) {
      console.error("❌ Could not fetch chats (maybe disconnected):", err.message);
      return;
    }

    while (true) {
      // ✅ Atomically fetch & lock one message
      const msg = await ScheduledMessage.findOneAndUpdate(
        { scheduleTime: { $lte: new Date() }, sent: false },
        { $set: { sent: true } },   // mark as sent immediately
        { new: true }               // return updated doc
      );

      if (!msg) break; // no pending messages left

      try {
        const groups = Array.isArray(msg.group) ? msg.group : [msg.group];
        const delayMs = msg.delay ? msg.delay * 1000 : 5000;

        for (const groupName of groups) {
          const targetGroup = chats.find(
            (c) => c.isGroup && c.name === groupName
          );

          if (!targetGroup) {
            console.log(`⚠️ Group "${groupName}" not found`);
            continue;
          }

          if (msg.mediaPath) {
            const media = MessageMedia.fromFilePath(msg.mediaPath);
            await client.sendMessage(targetGroup.id._serialized, media, {
              caption: msg.text || "",
            });
            console.log(`📤 Sent media to "${groupName}"`);
          } else if (msg.text) {
            await client.sendMessage(targetGroup.id._serialized, msg.text);
            console.log(`📤 Sent text to "${groupName}": ${msg.text}`);
          }

          await sleep(delayMs);
        }

        console.log(`✅ Message sent (ID: ${msg._id})`);
      } catch (err) {
        console.error("❌ Send error:", err.message);
      }
    }
  });
}

export default startScheduler;
