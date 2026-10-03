import {Redis} from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
// const connection = new IORedis();


redisConnection.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redisConnection.on("connect", () => {
  logger.info("Redis connected");
});
