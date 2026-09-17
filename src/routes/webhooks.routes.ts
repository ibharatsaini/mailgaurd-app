import { Router } from "express";
import * as webhooksController from "../controllers/webhooks.controller";
import { requireAuth, requireScope } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", requireScope("WEBHOOKS_MANAGE"), webhooksController.listWebhooks);
router.post("/", requireScope("WEBHOOKS_MANAGE"), webhooksController.createWebhook);
router.delete("/:id", requireScope("WEBHOOKS_MANAGE"), webhooksController.deleteWebhook);
router.get("/:id/deliveries", requireScope("WEBHOOKS_MANAGE"), webhooksController.listDeliveries);

export default router;
