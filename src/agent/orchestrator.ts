import { Ollama } from 'ollama';
import { randomUUID } from 'crypto';
import { config } from '../config/env';
import db from '../db/database';
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

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(currentSessionId);
  if (!session) {
    db.prepare('INSERT INTO sessions (id) VALUES (?)').run(currentSessionId);
  }

  // 1. Recherche RAG : récupérer les extraits pertinents
  const ragContexts = await getRelevantContext(userMessage);

  // 2. Définition des consignes selon le rôle RBAC
  let roleSystemPrompt = '';
  if (role === 'admin') {
    roleSystemPrompt = `Tu es connecté en tant qu'ADMINISTRATEUR. Tu as un accès complet à l'ensemble des 15 tables de la base de données ERP et à tous les outils.`;
  } else if (role === 'comptable') {
    roleSystemPrompt = `Tu es connecté en tant que COMPTABLE. Tu as accès aux données financières, factures, commandes, produits, salaires et clients (tables: invoices, orders, products, payroll, clients, employees, suppliers). Ne touche pas aux tables d'audit système ou de configuration technique.`;
  } else {
    // Guest par défaut
    roleSystemPrompt = `Tu es connecté en tant qu'INVITÉ (GUEST). Tu n'as AUCUN accès aux outils de base de données SQL. N'utilise jamais d'outil SQL. Réponds uniquement à partir de tes connaissances générales ou des documents du RAG fournis.`;
  }

  const systemSchemaDescription = `
Tables ERP disponibles et leur structure exacte :
- payroll : id, employee_id, pay_period, base_salary, bonus, deductions
- employees : id, first_name, last_name, email, department_id, position, hire_date
- clients : id, company_name, contact_name, email, phone, address
- orders : id, client_id, order_date, status, total_amount
- invoices : id, order_id, invoice_date, due_date, status, total_amount
- products : id, name, category_id, price, stock
`;

  // 3. Préparation du prompt système et des consignes strictes
  const messages: any[] = [
    {
      role: 'system',
      content: `Tu es un assistant IA d'entreprise sécurisé.
${roleSystemPrompt}

${systemSchemaDescription}

Consignes impératives pour les requêtes SQL :
1. Tu AS la capacité d'exécuter des requêtes SQL via l'outil 'execute_sql_query' si ton rôle le permet. Ne dis JAMAIS que tu n'as pas accès aux outils si tu peux les utiliser.
2. Pour afficher les fiches de paie et salaires, tu dois impérativement sélectionner TOUTES les colonnes nécessaires avec ce JOIN :
   SELECT e.first_name, e.last_name, p.pay_period, p.base_salary, p.bonus, p.deductions, (p.base_salary + p.bonus - p.deductions) AS net_pay FROM employees e JOIN payroll p ON e.id = p.employee_id
3. N'invente AUCUNE colonne qui n'existe pas dans la liste ci-dessus (ne cherche pas 'brut' ou 'salary', utilise 'base_salary' et 'net_pay').

Consignes générales :
1. N'utilise les outils QUE lorsque la question le nécessite explicitement.
2. Pour les questions d'ordre général ("qui es-tu ?", "bonjour"), réponds directement sans appeler d'outil.
3. Respecte strictement ton niveau d'habilitation (rôle : ${role}).`
    }
  ];

  // Si du contexte RAG est trouvé, on l'injecte
  if (ragContexts.length > 0) {
    messages.push({
      role: 'system',
      content: `Contextes documentaires issus du corpus :\n${ragContexts.join('\n---\n')}`,
    });
  }

  // Charger l'historique complet de la session
  const history = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(currentSessionId) as { role: string; content: string }[];

  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }

  // Ajouter le nouveau message utilisateur
  messages.push({ role: 'user', content: userMessage });

  // Enregistrer le message utilisateur en BDD
  db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(
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

  // BLOCAGE STRICT : Si le rôle est 'guest', on donne un tableau vide d'outils à Ollama
  const activeTools = role === 'guest' ? [] : (toolDefinitions as any);

  const response = await ollama.chat({
    model: config.modelChat,
    messages: messages,
    tools: activeTools, // Utilisation de la liste filtrée
  });
  if (role === 'guest' && response.message.tool_calls && response.message.tool_calls.length > 0) {
      finalResponse = "Accès refusé : En tant qu'invité (Guest), vous n'avez pas l'autorisation d'exécuter des outils de base de données ou des requêtes SQL.";
      break;
    }
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      messages.push(response.message);

      for (const call of response.message.tool_calls) {
        const toolName = call.function.name;
        const toolArgs = call.function.arguments as Record<string, any>;

        toolsUsed.push(toolName);
        
        // On passe le rôle à executeTool pour sécuriser l'accès aux données au niveau du backend
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

  db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(
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