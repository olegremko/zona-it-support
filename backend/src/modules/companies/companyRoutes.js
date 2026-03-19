import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';

const router = Router();

router.get('/', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  res.json({
    companies: [{
      id: req.auth.context.company_id,
      name: req.auth.context.company_name
    }]
  });
}));

export default router;
