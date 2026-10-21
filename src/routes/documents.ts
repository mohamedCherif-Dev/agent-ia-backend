import { Router } from 'express';
import db from '../db/database'; // Import direct par défaut

const router = Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT file_path FROM rag_chunks').all();
    const documents = rows.map((r: any) => r.file_path);
    return res.json({ documents });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur récupération documents';
    return res.status(500).json({ error: msg });
  }
});

export default router;