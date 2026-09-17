import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import * as apiKeysController from "../controllers/apiKeys.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();


function sessionOnly(req: Request, res: Response, next: NextFunction) {
  if (req.authMethod !== "session") {
    return res.status(403).json({ error: "session_required", message: "API key management requires a logged-in session" });
  }
  next();
}

router.use(requireAuth, sessionOnly);

router.get("/", apiKeysController.listApiKeys);
router.post("/", apiKeysController.createApiKey);
router.delete("/:id", apiKeysController.revokeApiKey);

export default router;
