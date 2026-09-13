import { Router } from "express";
import * as domainsController from "../controllers/domains.controller";
import { requireAuth, requireScope } from "../middleware/auth";
import { checkTriggerRateLimit } from "../middleware/rateLimit";

const router = Router();

router.use(requireAuth);

router.post("/", requireScope("DOMAINS_WRITE"), domainsController.createDomain);
router.get("/", requireScope("DOMAINS_READ"), domainsController.listDomains);
router.get("/:id", requireScope("DOMAINS_READ"), domainsController.getDomain);
router.delete(
  "/:id",
  requireScope("DOMAINS_WRITE"),
  domainsController.deleteDomain,
);

router.post(
  "/:id/check",
  requireScope("CHECKS_TRIGGER"),
  checkTriggerRateLimit,
  domainsController.triggerCheck,
);
router.get(
  "/:id/checks",
  requireScope("DOMAINS_READ"),
  domainsController.listChecks,
);
router.get(
  "/:id/issues",
  requireScope("DOMAINS_READ"),
  domainsController.listIssues,
);
router.get(
  "/:id/history",
  requireScope("DOMAINS_READ"),
  domainsController.getHistory,
);
router.patch(
  "/:id/monitoring",
  requireScope("DOMAINS_WRITE"),
  domainsController.updateMonitoringConfig,
);

export default router;
