import fs from 'fs';
import path from 'path';
import { Ollama } from 'ollama';
import { config } from '../config/env';
import db from '../db/database'; 

// @ts-ignore
const PDFParser = require('pdf2json');

const ollama = new Ollama({ host: config.ollamaHost });

// Fonction robuste pour extraire le texte d'un PDF avec pdf2json
function parsePdfBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // 1 : active le mode texte brut text-only
    const pdfParser = new (PDFParser as any)(null, 1);
    
    pdfParser.on("pdfParser_dataError", (err: any) => reject(err.parserError));
    pdfParser.on("pdfParser_dataReady", () => {
      try {
        const rawText = pdfParser.getRawTextContent();
        resolve(rawText || '');
      } catch (e) {
        reject(e);
      }
    });
    
    pdfParser.parseBuffer(buffer);
  });
}

// Calcul de similarité cosinus entre deux vecteurs
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return normA && normB ? dotProduct / (normA * normB) : 0;
}

// Découpe un texte en morceaux (chunks)
function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

// Indexation d'un fichier du corpus (POST /ingest) - Support TXT, MD et PDF
export async function ingestFile(filename: string): Promise<{ chunksIndexed: number }> {
  const filePath = path.isAbsolute(filename) ? filename : path.join(config.corpusPath, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Le fichier '${filename}' n'existe pas dans le corpus.`);
  }

  let content = '';
  const ext = path.extname(filename).toLowerCase();

  // Extraction du texte selon le format du fichier
  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    content = await parsePdfBuffer(dataBuffer);
  } else {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  if (!content || content.trim().length === 0) {
    throw new Error(`Le fichier '${filename}' est vide ou illisible.`);
  }

  const chunks = chunkText(content);

  // Supprimer les anciens chunks du même fichier si ré-indexé
  db.prepare('DELETE FROM rag_chunks WHERE file_path = ?').run(filename);

  let indexedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];

    // Génération de l'embedding via Ollama
    const embedResponse = await ollama.embed({
      model: config.modelEmbed,
      input: chunkContent,
    });

    const embedding = embedResponse.embeddings[0];

    db.prepare('INSERT INTO rag_chunks (file_path, chunk_index, content, embedding) VALUES (?, ?, ?, ?)').run(
      filename,
      i,
      chunkContent,
      JSON.stringify(embedding)
    );

    indexedCount++;
  }

  return { chunksIndexed: indexedCount };
}

// Recherche des contextes RAG les plus proches pour le chat
export async function getRelevantContext(query: string, topK: number = 3): Promise<string[]> {
  const rows = db.prepare('SELECT content, embedding FROM rag_chunks').all() as {
    content: string;
    embedding: string;
  }[];

  if (rows.length === 0) return [];

  // Embedding de la question utilisateur
  const queryEmbed = await ollama.embed({
    model: config.modelEmbed,
    input: query,
  });

  const queryVector = queryEmbed.embeddings[0];

  const scored = rows.map((row) => {
    const vector = JSON.parse(row.embedding) as number[];
    return {
      content: row.content,
      score: cosineSimilarity(queryVector, vector),
    };
  });

  // Trier par similarité décroissante
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((item) => item.content);
}