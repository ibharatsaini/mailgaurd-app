import { Router } from "express";
import authRoutes from "./auth.routes";
import domainsRoutes from "./domains.routes";
import apiKeysRoutes from "./apiKeys.routes";
import webhooksRoutes from "./webhooks.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/domains", domainsRoutes);
router.use("/api-keys", apiKeysRoutes);
router.use("/webhooks", webhooksRoutes);

export default router;
