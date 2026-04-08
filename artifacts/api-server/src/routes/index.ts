import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import checklistRouter from "./checklist";
import roadmapRouter from "./roadmap";
import applicationsRouter from "./applications";
import retirementsRouter from "./retirements";
import aibomRouter from "./aibom";
import sbomRouter from "./sbom";
import dashboardRouter from "./dashboard";
import mastersRouter from "./masters";
import adminRouter from "./admin";
import authRouter from "./auth";
import { requireAuth, requireAdmin } from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/masters" && req.method === "GET") return next();
  requireAuth(req, res, next);
});

router.use((req: Request, res: Response, next: NextFunction) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    return requireAdmin(req, res, next);
  }
  next();
});

router.use(dashboardRouter);
router.use(checklistRouter);
router.use(roadmapRouter);
router.use(applicationsRouter);
router.use(retirementsRouter);
router.use(aibomRouter);
router.use(sbomRouter);
router.use(mastersRouter);
router.use(adminRouter);

export default router;
