import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
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
