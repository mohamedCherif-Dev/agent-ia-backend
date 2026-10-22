import { Ollama } from 'ollama';
import { randomUUID } from 'crypto';
import { config } from '../config/env';
import { dbErp } from '../db/database'; // Utilisation de l'instance ERP pour les sessions/historiques
import { toolDefinitions, executeTool } from '../tools';
import { getRelevantContext } from '../rag';

export interface ChatResponse {
  sessionId: string;
  response: string;
  toolsUsed: string[];
}

const ollama = new Ollama({ host: config.ollamaHost });

export async function processChat(userMessage: string, sessionId?: string, role: string = 'guest'): Promise<ChatResponse> {
  const currentSessionId: string = sessionId && sessionId.trim() !== '' ? sessionId : randomUUID();

  // Enregistrement / Vérification de la session sur l'ERP
  const session = dbErp.prepare('SELECT id FROM sessions WHERE id = ?').get(currentSessionId);
  if (!session) {
    dbErp.prepare('INSERT INTO sessions (id) VALUES (?)').run(currentSessionId);
  }

  // 1. Recherche RAG : récupérer les extraits pertinents
  const ragContexts = await getRelevantContext(userMessage);

  // 2. Définition des consignes selon le rôle RBAC
  let roleSystemPrompt = '';
  if (role === 'admin') {
    roleSystemPrompt = `Tu es connecté en tant qu'ADMINISTRATEUR. Tu as un accès complet aux 3 bases de données de l'entreprise (erp, crm, logs) et à tous les outils système.`;
  } else if (role === 'comptable') {
    roleSystemPrompt = `Tu es connecté en tant que COMPTABLE. Tu as accès aux bases "erp" (données financières, factures, commandes, paie) et "crm" (clients). Tu N'AS PAS accès à la base "logs".`;
  } else {
    // Guest par défaut
    roleSystemPrompt = `Tu es connecté en tant qu'INVITÉ (GUEST). Tu n'as AUCUN accès aux outils de bases de données SQL. N'utilise jamais les outils de base de données. Réponds uniquement via tes connaissances générales, la recherche Web ou les documents RAG.`;
  }

  // Description des 3 bases de données d'entreprise
  const systemSchemaDescription = `
Bases de données d'entreprise disponibles :
1. Base "erp" (Factures, Paie, Produits, Commandes, Salaires) :
   - payroll : id, employee_id, pay_period, base_salary, bonus, deductions
   - employees : id, first_name, last_name, email, department_id, salary
   - products : id, name, category_id, supplier_id, unit_price, stock_quantity
   - orders : id, client_id, employee_id, order_date, status
   - invoices : id, order_id, issue_date, due_date, amount, status

2. Base "crm" (Clients, Relations, Support) :
   - clients : id, company_name, contact_name, email, city, country
   - tickets : id, client_id, subject, status, priority

3. Base "logs" (Sécurité, Traces) :
   - users : id, username, role_id
   - audit_logs : id, user_id, action, timestamp

Pour interroger une base de données, utilise l'outil 'execute_multi_db_query' en spécifiant la clé "database" ('erp', 'crm' ou 'logs').
`;

  // 3. Préparation du prompt système et des consignes strictes
  const messages: any[] = [
    {
      role: 'system',
      content: `Tu es un assistant IA d'entreprise sécurisé.
${roleSystemPrompt}

${systemSchemaDescription}

Consignes de sélection des outils :
1. N'UTILISE AUCUN OUTIL pour :
   - Les salutations et la politesse ("Bonjour", "Comment vas-tu ?")
   - La culture générale ("Quelle est la capitale de la France ?", "Explique-moi la photosynthèse")
   - Les demandes de rédaction ou de synthèse basique
2. Utilise les outils UNIQUEMENT si la question requiert :
   - Des données de la base ERP, CRM ou Logs (outil: 'execute_multi_db_query')
   - Une recherche documentaire RAG (outil: 'read_corpus_file')
   - Un calcul mathématique (outil: 'calculate')
   - Une recherche d'actualité/météo en temps réel sur le Web (outil: 'web_search')

Consignes impératives pour les requêtes SQL :
1. N'invente AUCUNE colonne.
2. Pour les fiches de paie dans 'erp', calcule le salaire net ainsi : (p.base_salary + p.bonus - p.deductions) AS net_pay.
3. Dès que tu reçois les résultats d'un outil SQL, affiche-les TOUJOURS sous forme de tableau Markdown clair pour l'utilisateur.

Consignes générales :
1. Respecte strictement ton niveau d'habilitation (rôle actuel : ${role}).`
    }
  ];

  // Injection du contexte RAG si présent
  if (ragContexts.length > 0) {
    messages.push({
      role: 'system',
      content: `Contextes documentaires issus du corpus :\n${ragContexts.join('\n---\n')}`,
    });
  }

  // Historique de session
  const history = dbErp.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(currentSessionId) as { role: string; content: string }[];

  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: 'user', content: userMessage });

  dbErp.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(
    currentSessionId,
    'user',
    userMessage
  );

  const toolsUsed: string[] = [];
  let finalResponse = '';
  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    // FILTRAGE DES OUTILS : Si rôle 'guest', on retire les outils SQL de la liste
    let activeTools = toolDefinitions as any[];
    if (role === 'guest') {
      activeTools = toolDefinitions.filter(t => t.function.name !== 'execute_multi_db_query' && t.function.name !== 'execute_sql_query');
    }

    const response = await ollama.chat({
      model: config.modelChat,
      messages: messages,
      tools: activeTools,
    });

    // Garde-fou sécurité : Si un Guest tente d'appeler un outil SQL
    if (role === 'guest' && response.message.tool_calls) {
      const triedSql = response.message.tool_calls.some(c => c.function.name.includes('sql') || c.function.name.includes('db'));
      if (triedSql) {
        finalResponse = "Accès refusé : En tant qu'invité (Guest), vous n'avez pas l'autorisation d'interroger les bases de données d'entreprise.";
        break;
      }
    }

    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      messages.push(response.message);

      for (const call of response.message.tool_calls) {
        const toolName = call.function.name;
        const toolArgs = call.function.arguments as Record<string, any>;

        toolsUsed.push(toolName);
        
        const toolResult = await executeTool(toolName, toolArgs, role);

        messages.push({
          role: 'tool',
          content: toolResult,
        });
      }
    } else {
      finalResponse = response.message.content;
      break;
    }
  }

  if (!finalResponse) {
    finalResponse = "Désolé, je n'ai pas pu obtenir une réponse dans le nombre d'itérations imparti.";
  }

  dbErp.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(
    currentSessionId,
    'assistant',
    finalResponse
  );

  return {
    sessionId: currentSessionId,
    response: finalResponse,
    toolsUsed,
  };
}