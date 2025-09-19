// routes/jobs.js
import express from "express";
import Job from "../models/Job.js";
import SendLog from "../models/SendLog.js";
import { jobQueue } from "../queue/queue.js";

const router = express.Router();

// Create a scheduled job
router.post("/", async (req, res) => {
  try {
    const { targets, message, scheduleAt, delayBetweenRecipientsMs } = req.body;
    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: "targets (array) required" });
    }
    if (!message) return res.status(400).json({ error: "message required" });
    if (!scheduleAt) return res.status(400).json({ error: "scheduleAt required" });

    const jobDoc = await Job.create({
      targets,
      message,
      scheduleAt: new Date(scheduleAt),
      delayBetweenRecipientsMs: delayBetweenRecipientsMs ?? parseInt(process.env.DEFAULT_DELAY_MS || "2500")
    });

    // schedule in Bull - delay until scheduleAt
    const delayMs = Math.max(0, new Date(scheduleAt).getTime() - Date.now());
    const bullJob = await jobQueue.add("send", { jobId: jobDoc._id.toString() }, {
      delay: delayMs,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false
    });

    // store bull job id in meta for later cancelation / debugging
    jobDoc.meta = jobDoc.meta || {};
    jobDoc.meta.bullJobId = bullJob.id;
    await jobDoc.save();

    res.json({ job: jobDoc });
  } catch (err) {
    console.error("Create job error:", err);
    res.status(500).json({ error: err.message });
  }
});

// List recent jobs
router.get("/", async (req, res) => {
  const jobs = await Job.find().sort({ createdAt: -1 }).limit(200);
  res.json(jobs);
});

// Get single job + send logs
router.get("/:id", async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "not found" });
  const logs = await SendLog.find({ jobId: job._id }).sort({ timestamp: 1 });
  res.json({ job, logs });
});

// Cancel a scheduled job
router.delete("/:id", async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "not found" });
  job.status = "canceled";
  await job.save();

  // remove from bull queue if still present
  try {
    const bullId = job.meta?.bullJobId;
    if (bullId) {
      const bj = await jobQueue.getJob(bullId);
      if (bj) await bj.remove();
    }
  } catch (err) {
    console.warn("Failed to remove bull job:", err.message);
  }

  res.json({ ok: true, job });
});

export default router;
