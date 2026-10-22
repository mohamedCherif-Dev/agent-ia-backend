import { evaluate } from 'mathjs';
import fs from 'fs';
import path from 'path';
import { dbErp, dbCrm, dbLogs } from '../db/database'; // Import des 3 bases de données séparées
import { config } from '../config/env';
import axios from 'axios';

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
      description: 'Exécute une requête SQL SELECT sur l\'ERP de l\'entreprise.',
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
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Effectue une recherche sur Internet pour obtenir des informations récentes ou en temps réel.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Les mots-clés de la recherche Internet.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dummy_no_op',
      description: 'Outil factice neutre. À N\'UTILISER SOUS AUCUN PRÉTEXTE pour la conversation générale, la culture générale, la politesse ou les explications théoriques.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Raison facultative de l\'appel.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_multi_db_query',
      description: 'Exécute une requête SQL SELECT sur l une des 3 bases de données de l entreprise : "erp" (factures, paie, produits), "crm" (clients, tickets, prospects) ou "logs" (audit, connexions).',
      parameters: {
        type: 'object',
        properties: {
          database: {
            type: 'string',
            enum: ['erp', 'crm', 'logs'],
            description: 'La base de données cible à interroger.'
          },
          query: {
            type: 'string',
            description: 'La requête SQL SELECT.'
          }
        },
        required: ['database', 'query']
      }
    }
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
        if (role === 'guest') {
          return JSON.stringify({ error: 'Accès refusé : Le rôle "Guest" ne dispose pas des droits d\'accès à la base de données.' });
        }

        const queryTrimmed = String(args.query || '').trim();

        if (!queryTrimmed.toUpperCase().startsWith('SELECT')) {
          return JSON.stringify({ error: 'Sécurité : Seules les requêtes SELECT en lecture seule sont autorisées.' });
        }

        if (role === 'comptable') {
          const upperQuery = queryTrimmed.toUpperCase();
          const forbiddenTables = ['AUDIT_LOGS', 'USERS', 'ROLES', 'DEPARTMENTS'];
          for (const table of forbiddenTables) {
            if (upperQuery.includes(table)) {
              return JSON.stringify({ error: `Accès refusé : Le rôle "Comptable" n'est pas autorisé à consulter la table "${table.toLowerCase()}".` });
            }
          }
        }

        const rows = dbErp.prepare(queryTrimmed).all();
        return JSON.stringify({ rows });
      }

      case 'execute_multi_db_query': {
        if (role === 'guest') {
          return JSON.stringify({ error: 'Accès refusé : Le rôle Guest ne peut pas consulter les bases de données.' });
        }

        const targetDb = String(args.database || 'erp').toLowerCase();
        const queryTrimmed = String(args.query || '').trim();

        if (!queryTrimmed.toUpperCase().startsWith('SELECT')) {
          return JSON.stringify({ error: 'Sécurité : Seules les requêtes SELECT sont autorisées.' });
        }

        // Règle de sécurité : Le comptable n'a pas accès aux logs
        if (role === 'comptable' && targetDb === 'logs') {
          return JSON.stringify({ error: 'Accès refusé : Le rôle Comptable n\'a pas accès à la base de données de logs système.' });
        }

        let selectedDb = dbErp;
        if (targetDb === 'crm') selectedDb = dbCrm;
        else if (targetDb === 'logs') selectedDb = dbLogs;

        const rows = selectedDb.prepare(queryTrimmed).all();
        return JSON.stringify({ databaseUsed: targetDb, rows });
      }

      case 'web_search': {
        const query = String(args.query || '');
        try {
          const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
          const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          const cleanText = String(response.data)
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2500);

          return JSON.stringify({ query, snippet: cleanText });
        } catch (err: any) {
          return JSON.stringify({ error: `Erreur lors de la recherche Web : ${err.message}` });
        }
      }

      case 'dummy_no_op': {
        return JSON.stringify({
          status: 'ignored',
          message: 'Cet outil est un test neutre et ne produit aucun résultat.'
        });
      }

      default:
        return JSON.stringify({ error: `Outil '${name}' inconnu.` });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erreur lors de l'exécution de l'outil";
    return JSON.stringify({ error: message });
  }
}