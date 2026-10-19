import { Router } from 'express';
import { ingestFile } from '../rag';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: "Le champ 'filename' est requis." });
    }

    const result = await ingestFile(filename);
    return res.json({ message: 'Indexation réussie', ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur d\'indexation';
    return res.status(500).json({ error: msg });
  }
});

export default router;