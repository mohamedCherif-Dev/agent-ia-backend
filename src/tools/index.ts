import { evaluate } from 'mathjs';
import fs from 'fs';
import path from 'path';
import db from '../db/database'; // Import direct par défaut
import { config } from '../config/env';

// 1. Déclaration des schémas d'outils pour Ollama
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Évalue une expression mathématique arithmétique simple (ex: 25 * 4 + 10).',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: "L'expression mathématique à évaluer.",
          },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_corpus_files',
      description: 'Liste tous les fichiers disponibles dans le dossier du corpus documentaire.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_corpus_file',
      description: "Lit le contenu d'un fichier texte du corpus documentaire.",
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Le nom du fichier à lire (ex: "bienvenue.txt").',
          },
        },
        required: ['filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_sql_query',
      description: 'Exécute une requête SQL SELECT sur la table "products". Colonnes disponibles : id, name, category, price, stock.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'La requête SQL SELECT. Exemple: "SELECT * FROM products"',
          },
        },
        required: ['query'],
      },
    },
  },
];

// 2. Exécuteur centralisé des outils
export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case 'calculate': {
        const expr = String(args.expression || '');
        const result = evaluate(expr);
        return JSON.stringify({ result });
      }

      case 'list_corpus_files': {
        if (!fs.existsSync(config.corpusPath)) {
          fs.mkdirSync(config.corpusPath, { recursive: true });
        }
        const files = fs.readdirSync(config.corpusPath);
        return JSON.stringify({ files });
      }

      case 'read_corpus_file': {
        const rawFilename = String(args.filename || '');
        const safeFilename = path.basename(rawFilename);
        const filePath = path.join(config.corpusPath, safeFilename);

        if (!fs.existsSync(filePath)) {
          return JSON.stringify({ error: `Fichier '${safeFilename}' introuvable.` });
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.stringify({ content });
      }

      case 'execute_sql_query': {
        const queryTrimmed = String(args.query || '').trim();

        if (!queryTrimmed.toUpperCase().startsWith('SELECT')) {
          return JSON.stringify({ error: 'Sécurité : Seules les requêtes SELECT en lecture seule sont autorisées.' });
        }

        // Exécution de la requête sur SQLite
        const rows = db.prepare(queryTrimmed).all();
        return JSON.stringify({ rows });
      }

      default:
        return JSON.stringify({ error: `Outil '${name}' inconnu.` });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erreur lors de l'exécution SQL";
    return JSON.stringify({ error: message });
  }
}