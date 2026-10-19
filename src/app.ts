import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { db, initDatabase } from './db/database';
import { Ollama } from 'ollama';

import chatRouter from './routes/chat';
import ingestRouter from './routes/ingest';
import documentsRouter from './routes/documents';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

initDatabase();

const ollama = new Ollama({ host: config.ollamaHost });

// Enregistrement des routes API (Conforme au contrat du cahier des charges)
app.use('/chat', chatRouter);
app.use('/ingest', ingestRouter);
app.use('/documents', documentsRouter);

// Endpoint /health (S1)
app.get('/health', async (req, res) => {
  let ollamaOk = false;
  let dbOk = false;

  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch (err) {
    dbOk = false;
  }

  try {
    await ollama.list();
    ollamaOk = true;
  } catch (err) {
    ollamaOk = false;
  }

  const globalStatus = ollamaOk && dbOk;

  res.status(globalStatus ? 200 : 503).json({
    status: globalStatus ? 'OK' : 'ERROR',
    services: {
      database: dbOk ? 'UP' : 'DOWN',
      ollama: ollamaOk ? 'UP' : 'DOWN',
    },
  });
});

app.listen(config.port, () => {
  console.log(`Serveur prêt sur http://localhost:${config.port}`);
});