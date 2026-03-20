import { Router } from 'express';
import * as roomController from '../controllers/roomController.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.get('/', roomController.listRooms);
router.post('/', requireAuth, roomController.createRoom);
router.post('/:roomId/join', requireAuth, roomController.joinRoom);
router.post('/:roomId/start', requireAuth, roomController.startRoom);
export default router;
