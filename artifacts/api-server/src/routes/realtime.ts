import { Router, type IRouter } from "express";
import { GetRealtimeTicketResponse } from "@workspace/api-zod";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import { createTicket } from "../lib/wsTickets";

const router: IRouter = Router();

router.get("/realtime/ticket", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);
  const ticket = createTicket(userId);
  res.json(GetRealtimeTicketResponse.parse({ ticket }));
});

export default router;
