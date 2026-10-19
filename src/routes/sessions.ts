import { Router } from 'express';
import { db } from '../db/database';

const router = Router();

router.delete('/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    
    if (info.changes === 0) {
      return res.status(404).json({ error: "Session introuvable." });
    }
    
    return res.json({ message: `Session ${sessionId} supprimée avec succès.` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur suppression session';
    return res.status(500).json({ error: msg });
  }
});

export default router;