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
import searchRouter from "./search";
import notificationsRouter, { seedNotifications } from "./notifications";
import checklistCommentsRouter from "./checklist-comments";
import assetsRouter from "./assets";
import assetLifecycleRouter from "./asset-lifecycle";
import assetAuditsRouter from "./asset-audits";
import assetFinanceRouter from "./asset-finance";
import assetFinanceControlsRouter from "./asset-finance-controls";
import assetLicensesRouter from "./asset-licenses";
import assetDashboardRouter from "./asset-dashboard";
import dataArchiveRouter from "./data-archive";
import itsmRouter from "./itsm";
import itsmSetupRouter from "./itsm-setup";
import complianceRouter from "./compliance";
import { authRouter as auditorAuthRouter, router as auditorRouter, auditorFence } from "./auditor";
import { seedAssetAndItsmModules, seedExtendedItsmData } from "./seed-modules";
import docsExportRouter from "./docs-export";
import { requireAuth, requireAdmin } from "./auth";
import centralAuthRouter, { centralSessionGuard } from "./central-auth";
import { assetRbac } from "../lib/rbac";

const router: IRouter = Router();

router.use(centralAuthRouter);
router.use(centralSessionGuard);   // re-validates Ashika Portal sessions (live role / disabled user)
router.use(authRouter);
router.use(auditorAuthRouter);   // auditor portal sign-in (public)
router.use(healthRouter);

// Seed on startup (idempotent)
seedBusinessUnits().catch(console.error);
seedKpiData().catch(console.error);
seedNotifications().catch(console.error);
seedAssetAndItsmModules().catch(console.error);
seedExtendedItsmData().catch(console.error);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/masters" && req.method === "GET") return next();
  if (req.path === "/config" && req.method === "GET") return next();
  if (req.path === "/business-units" && req.method === "GET") return next();
  requireAuth(req, res, next);
});

// Auditor sessions (external auditors) reach only the auditor portal API
router.use(auditorFence);

// IT Asset Management: module-level RBAC (read / write per module; local roles or Ashika Portal permissions)
router.use(assetRbac);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    // Only these paths require admin privileges for write operations
    const adminOnlyPrefixes = [
      "/admin/", "/masters", "/roles", "/user-roles", "/settings", "/data-archive", "/notification-rules",
      "/business-units", "/audit-logs",
      // ITSM writes are governed by module permissions (lib/rbac.ts), not base role Admin
    ];
    const isAdminOnly = adminOnlyPrefixes.some(p =>
      req.path === p || req.path.startsWith(p + "/") || req.path.startsWith(p)
    );
    if (isAdminOnly) return requireAdmin(req, res, next);
    // All other write operations: require auth only (already checked above)
  }
  next();
});

// Edit forms send back the whole record. Drop server-owned fields and turn ISO strings for
// timestamp columns (…At) into Date objects, otherwise drizzle fails with "toISOString is not a function".
router.use((req: Request, _res: Response, next: NextFunction) => {
  if ((req.method === "PATCH" || req.method === "PUT") && req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    for (const k of ["id", "createdAt", "updatedAt"]) delete req.body[k];
    for (const [k, v] of Object.entries(req.body)) {
      if (/At$/.test(k) && typeof v === "string") req.body[k] = v.trim() === "" ? null : new Date(v);
    }
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
router.use(searchRouter);
router.use(notificationsRouter);
router.use(checklistCommentsRouter);
router.use(assetLifecycleRouter);
router.use(assetAuditsRouter);
router.use(assetFinanceRouter);
router.use(assetFinanceControlsRouter);
router.use(assetLicensesRouter);
router.use(assetDashboardRouter);
router.use(dataArchiveRouter);
router.use(assetsRouter);
router.use(itsmSetupRouter);
router.use(complianceRouter);
router.use(auditorRouter);
router.use(itsmRouter);
router.use(docsExportRouter);

export default router;
