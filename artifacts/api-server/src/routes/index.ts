import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import realtimeRouter from "./realtime";
import usersRouter from "./users";
import mediaRouter from "./media";
import liveRouter from "./live";
import messagingRouter from "./messaging";
import chatRouter from "./chat";
import shareRouter from "./share";
import stripeRouter from "./stripe";
import adminRouter from "./admin";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(realtimeRouter);
router.use(usersRouter);
router.use(mediaRouter);
router.use(liveRouter);
router.use(messagingRouter);
router.use(chatRouter);
router.use(shareRouter);
router.use(stripeRouter);
router.use(adminRouter);
router.use(notificationsRouter);

export default router;
