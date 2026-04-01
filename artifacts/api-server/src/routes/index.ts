import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzePhotoRouter from "./ai/analyze-photo";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", analyzePhotoRouter);

export default router;
