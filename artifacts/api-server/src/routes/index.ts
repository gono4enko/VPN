import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import profilesRouter from "./profiles";
import serverRouter from "./server";
import speedtestRouter from "./speedtest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(profilesRouter);
router.use(serverRouter);
router.use(speedtestRouter);

export default router;
