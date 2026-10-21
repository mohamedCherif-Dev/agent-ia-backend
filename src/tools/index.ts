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
      description: 'Exécute une requête SQL SELECT sur l\'ERP de l\'entreprise. Tables disponibles : clients, orders, order_items, products, categories, suppliers, invoices, employees, departments, payroll, inventory_logs, audit_logs.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'La requête SQL SELECT. Exemple: "SELECT * FROM clients"',
          },
        },
        required: ['query'],
      },
    },
  },
];

// 2. Exécuteur centralisé des outils avec contrôle d'accès par rôle (RBAC)
export async function executeTool(name: string, args: Record<string, any>, role: string = 'guest'): Promise<string> {
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
        // Règle RBAC 1 : Les invités (guest) n'ont aucun accès aux outils de base de données
        if (role === 'guest') {
          return JSON.stringify({ error: 'Accès refusé : Le rôle "Guest" ne dispose pas des droits d\'accès à la base de données.' });
        }

        const queryTrimmed = String(args.query || '').trim();

        if (!queryTrimmed.toUpperCase().startsWith('SELECT')) {
          return JSON.stringify({ error: 'Sécurité : Seules les requêtes SELECT en lecture seule sont autorisées.' });
        }

        // Règle RBAC 2 : Filtrage par table pour le rôle 'comptable'
        if (role === 'comptable') {
          const upperQuery = queryTrimmed.toUpperCase();
          const forbiddenTables = ['AUDIT_LOGS', 'USERS', 'ROLES', 'DEPARTMENTS'];
          for (const table of forbiddenTables) {
            if (upperQuery.includes(table)) {
              return JSON.stringify({ error: `Accès refusé : Le rôle "Comptable" n'est pas autorisé à consulter la table "${table.toLowerCase()}".` });
            }
          }
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