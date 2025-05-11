import { Router } from 'express';
import { sendTestEmail } from '../controllers/notificationController';
import { isAuthenticated } from '../middlewares/auth';

const router = Router();

router.get('/test', isAuthenticated, sendTestEmail);

export default router;  // Exportación default
