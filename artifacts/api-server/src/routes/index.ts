import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import profilesRouter from "./profiles";
import serverRouter from "./server";
import speedtestRouter from "./speedtest";
import clusterRouter from "./cluster";
import monitoringRouter from "./monitoring";
import routingRouter from "./routing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(profilesRouter);
router.use(serverRouter);
router.use(speedtestRouter);
router.use(clusterRouter);
router.use(monitoringRouter);
router.use(routingRouter);

export default router;
