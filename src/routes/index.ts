import { Router } from "express";
import authRoutes from "./auth.routes";
import domainsRoutes from "./domains.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/domains", domainsRoutes);

export default router;
