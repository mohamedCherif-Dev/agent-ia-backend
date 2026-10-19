import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  ollamaHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  modelChat: process.env.MODEL_CHAT || 'llama3.2',
  modelEmbed: process.env.MODEL_EMBED || 'nomic-embed-text',
  dbPath: path.resolve(process.env.DB_PATH || './data/database.sqlite'),
  corpusPath: path.resolve(process.env.CORPUS_PATH || './corpus'),
};