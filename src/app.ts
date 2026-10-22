import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { dbErp } from './db/database'; // Importation de la BDD ERP principale
import { Ollama } from 'ollama';

import chatRouter from './routes/chat';
import sessionsRouter from './routes/sessions';
import ingestRouter from './routes/ingest';
import documentsRouter from './routes/documents';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const ollama = new Ollama({ host: config.ollamaHost });

// Enregistrement propre des routes API
app.use('/chat', chatRouter);
app.use('/sessions', sessionsRouter);
app.use('/ingest', ingestRouter);
app.use('/documents', documentsRouter);

// Endpoint /health
app.get('/health', async (req, res) => {
  let ollamaOk = false;
  let dbOk = false;

  try {
    dbErp.prepare('SELECT 1').get();
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