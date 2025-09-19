// worker/puppeteer-worker.js
import { Worker } from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Job from "../models/Job.js";
import SendLog from "../models/SendLog.js";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

dotenv.config();

const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(baseMs) { return baseMs + Math.floor((Math.random() - 0.5) * Math.min(800, baseMs)); }

// Try to detect main UI to confirm login
async function ensureLoggedIn(page) {
  const selectors = ['div[data-testid="chat-list"]', '#pane-side', 'div[role="grid"]'];
  for (const s of selectors) {
    try {
      await page.waitForSelector(s, { timeout: 8000 });
      return true;
    } catch (e) { /* continue */ }
  }
  return false;
}

async function openChatByName(page, chatName) {
  // multiple fallback selectors for the search box (WA changes often)
  const searchSelectors = [
    'div[contenteditable="true"][data-tab="3"]',
    'div[contenteditable="true"][data-testid="chat-list-search"]',
    'div[role="textbox"][title="Search input textbox"]'
  ];

  let sel = null;
  for (const s of searchSelectors) {
    try {
      await page.waitForSelector(s, { timeout: 4000 });
      sel = s;
      break;
    } catch (e) {}
  }
  if (!sel) throw new Error("Search box not found");

  await page.click(sel);
  // clear existing
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');

  await page.type(sel, chatName, { delay: 100 });
  await sleep(1200);

  // try direct title match
  const titleSelector = `span[title="${chatName}"]`;
  try {
    await page.waitForSelector(titleSelector, { timeout: 5000 });
    await page.click(titleSelector);
    await sleep(600);
    return;
  } catch (e) {
    // fallback: click first result
    const firstResult = 'div[role="option"]';
    try {
      await page.waitForSelector(firstResult, { timeout: 3000 });
      await page.click(firstResult);
      await sleep(600);
      return;
    } catch (err) {
      throw new Error("Chat not found: " + chatName);
    }
  }
}

async function sendMessageInOpenChat(page, message) {
  const inputSelectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
    'div[role="textbox"][title="Type a message"]'
  ];
  let sel = null;
  for (const s of inputSelectors) {
    try {
      await page.waitForSelector(s, { timeout: 5000 });
      sel = s;
      break;
    } catch (e) {}
  }
  if (!sel) throw new Error("Message input not found");

  await page.click(sel);
  const lines = message.split("\n");
  for (let i=0; i<lines.length; i++) {
    if (i > 0) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
    await page.type(sel, lines[i], { delay: 20 });
  }
  await page.keyboard.press('Enter');
  await sleep(800);
}

async function processJob(jobData) {
  const { jobId } = jobData;
  console.log("Processing job:", jobId);

  await mongoose.connect(process.env.MONGO_URI, {});
  const jobDoc = await Job.findById(jobId);
  if (!jobDoc) throw new Error("Job not found: " + jobId);
  if (jobDoc.status === "canceled") {
    console.log("Job canceled, skipping:", jobId);
    return;
  }

  jobDoc.status = "running";
  await jobDoc.save();

  const userDataDir = process.env.USER_DATA_DIR || path.resolve("./profile");
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false, // recommended; set to true carefully
    userDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2", timeout: 0 });

    let loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) {
      console.log("Please scan the QR in the opened browser to link your phone. Waiting up to 2 minutes...");
      await page.waitForTimeout(120000);
      loggedIn = await ensureLoggedIn(page);
      if (!loggedIn) throw new Error("Not logged in (QR not scanned)");
    }

    // send message to each target
    for (const target of jobDoc.targets) {
      let status = "sent";
      let error = null;

      try {
        await openChatByName(page, target);
        await sendMessageInOpenChat(page, jobDoc.message);
        jobDoc.attempts += 1;
        await jobDoc.save();
        console.log(`Sent to ${target}`);
      } catch (err) {
        status = "failed";
        error = err.message;
        console.error(`Failed to send to ${target}:`, err.message);
        jobDoc.attempts += 1;
        jobDoc.lastError = `${target}: ${err.message}`;
        await jobDoc.save();
      }

      // write log
      await SendLog.create({
        jobId: jobDoc._id,
        target,
        status,
        error
      });

      // delay between recipients with jitter
      const baseDelay = jobDoc.delayBetweenRecipientsMs || parseInt(process.env.DEFAULT_DELAY_MS || "2500");
      const d = jitter(baseDelay);
      console.log(`Sleeping ${d}ms before next target`);
      await sleep(d);
    }

    jobDoc.status = "completed";
    await jobDoc.save();
    console.log("Job completed:", jobDoc._id.toString());
  } catch (err) {
    console.error("Worker error:", err);
    jobDoc.status = "failed";
    jobDoc.lastError = err.message;
    await jobDoc.save();
    throw err;
  } finally {
    await browser.close().catch(() => {});
    await mongoose.disconnect();
  }
}

const worker = new Worker("wa-jobs", async job => {
  return processJob(job.data);
}, { connection: new IORedis(redisConnection) });

worker.on("completed", (j) => console.log("Bull job completed:", j.id));
worker.on("failed", (j, err) => console.error("Bull job failed:", j?.id, err?.message));

console.log("Puppeteer worker started and listening for jobs...");
