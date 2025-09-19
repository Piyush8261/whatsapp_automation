// queue/queue.js
import { Queue, QueueScheduler } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379
});

export const jobQueue = new Queue("wa-jobs", { connection });
export const jobQueueScheduler = new QueueScheduler("wa-jobs", { connection });
