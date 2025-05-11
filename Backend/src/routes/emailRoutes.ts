import { Router } from "express";
import { sendTestEmail } from "../controllers/emailController";

const router = Router();

router.post("/send-test", sendTestEmail);

export default router;
