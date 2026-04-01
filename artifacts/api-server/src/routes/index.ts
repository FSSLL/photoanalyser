import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzePhotoRouter from "./ai/analyze-photo";
import modelConfigRouter from "./ai/model-config";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", modelConfigRouter);
router.use("/ai", analyzePhotoRouter);

export default router;
