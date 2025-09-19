import { getClient } from "./whatsappClient.js";

async function listChats() {
  try {
    const client = getClient();
    const chats = await client.getChats();

    console.log("📋 All chats (groups + private):");
    chats.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name || c.id.user} ${c.isGroup ? "(Group)" : "(Private)"}`);
    });
  } catch (err) {
    console.error("❌ Error fetching chats:", err);
  }
}

listChats();
