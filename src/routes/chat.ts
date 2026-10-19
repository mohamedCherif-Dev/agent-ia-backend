import { Router } from 'express';
import { processChat } from '../agent/orchestrator';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Le champ 'message' est obligatoire." });
    }

    const result = await processChat(message, sessionId);
    return res.json(result);
  } catch (error: any) {
    console.error('Erreur Chat:', error);
    return res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

export default router;