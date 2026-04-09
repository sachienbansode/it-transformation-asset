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
import businessUnitsRouter, { seedBusinessUnits } from "./business-units";
import csvRouter from "./csv-routes";
import auditRouter from "./audit-logs";
import reportsRouter from "./reports";
import kpisRouter, { seedKpiData } from "./kpis";
import kpiPersonsRouter from "./kpi-persons";
import rolesRouter from "./roles";
import storageRouter from "./storage";
import { requireAuth, requireAdmin } from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);

// Seed on startup (idempotent)
seedBusinessUnits().catch(console.error);
seedKpiData().catch(console.error);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/masters" && req.method === "GET") return next();
  if (req.path === "/config" && req.method === "GET") return next();
  if (req.path === "/business-units" && req.method === "GET") return next();
  requireAuth(req, res, next);
});

router.use((req: Request, res: Response, next: NextFunction) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    // KPI endpoints and profile are accessible to authenticated non-admin users
    const kpiPaths = ["/kpi-sets", "/kpi-persons", "/kpi-users", "/kpi-years"];
    const isKpiPath = kpiPaths.some(p => req.path === p || req.path.startsWith(p + "/"));
    const isProfilePath = req.path === "/auth/profile" || req.path === "/auth/profile/photo";
    const isStoragePath = req.path.startsWith("/storage/");
    if (isKpiPath || isProfilePath || isStoragePath) return next();
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
router.use(businessUnitsRouter);
router.use(csvRouter);
router.use(auditRouter);
router.use(reportsRouter);
router.use(kpisRouter);
router.use(kpiPersonsRouter);
router.use(rolesRouter);
router.use(storageRouter);

export default router;
