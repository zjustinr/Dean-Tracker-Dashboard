import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pqNewsRouter from "./pq-news";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pqNewsRouter);

export default router;
