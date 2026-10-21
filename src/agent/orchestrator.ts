import { Ollama } from 'ollama';
import { randomUUID } from 'crypto';
import { config } from '../config/env';
import  db from '../db/database';
import { toolDefinitions, executeTool } from '../tools';
import { getRelevantContext } from '../rag';

export interface ChatResponse {
  sessionId: string;
  response: string;
  toolsUsed: string[];
}

const ollama = new Ollama({ host: config.ollamaHost });

export async function processChat(userMessage: string, sessionId?: string): Promise<ChatResponse> {
  const currentSessionId: string = sessionId && sessionId.trim() !== '' ? sessionId : randomUUID();

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(currentSessionId);
  if (!session) {
    db.prepare('INSERT INTO sessions (id) VALUES (?)').run(currentSessionId);
  }

  // 1. Recherche RAG : récupérer les extraits pertinents
  const ragContexts = await getRelevantContext(userMessage);

  // 2. Préparation du prompt système et des consignes strictes
  const messages: any[] = [
    {
      role: 'system',
      content: `Tu es un assistant IA local polyvalent.
Consignes :
1. N'utilise les outils QUE lorsque la question le nécessite explicitement (calculs, recherche BDD, consultation de fichiers).
2. Pour les questions d'ordre général ("qui es-tu ?", "bonjour"), réponds directement sans appeler d'outil.
3. La seule table SQL disponible dans la BDD est "products" (id, name, category, price, stock). Ne cherche jamais d'autres tables.`
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

    const response = await ollama.chat({
      model: config.modelChat,
      messages: messages,
      tools: toolDefinitions as any,
    });

    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      messages.push(response.message);

      for (const call of response.message.tool_calls) {
        const toolName = call.function.name;
        const toolArgs = call.function.arguments as Record<string, any>;

        toolsUsed.push(toolName);
        const toolResult = await executeTool(toolName, toolArgs);

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