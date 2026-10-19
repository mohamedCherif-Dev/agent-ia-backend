# Backend Agent IA Local (Node.js / TypeScript / Ollama / RAG)

Ce projet est une API REST de démonstration d'un Agent IA local capable de :
- Gérer des conversations persistantes par session (SQLite)[cite: 3, 4].
- Effectuer des recherches documentaires basées sur du RAG (Retrieval-Augmented Generation)[cite: 3, 4].
- Appeler des outils (Tools) de façon autonome : calculatrice, lecture de fichiers et requêtes SQL[cite: 3, 4].

## 🛠️ Stack Technique

- **Runtime** : Node.js (v20+)
- **Langage** : TypeScript
- **Framework Web** : Express.js
- **LLM & Embeddings** : Ollama (`llama3.2` et `nomic-embed-text`)
- **Base de Données** : SQLite (`better-sqlite3`)

---
Guide de Démarrage Rapide :


PrérequisAvoir Node.js installé (v20 ou plus récent). 
Avoir Ollama installé et démarré sur votre machine

Assurez-vous d'avoir récupéré les deux modèles requis : 

ollama pull llama3.2
ollama pull nomic-embed-text

À la racine du projet :

npm install

Vérifiez le fichier .env à la racine :

PORT=3000
OLLAMA_HOST=[http://127.0.0.1:11434](http://127.0.0.1:11434)
MODEL_CHAT=llama3.2
MODEL_EMBED=nomic-embed-text
DB_PATH=./data/database.sqlite
CORPUS_PATH=./corpus

En mode développement :

npm run dev

Le serveur sera disponible sur http://localhost:3000.

Sécurité & Bonnes Pratiques :


SQL : Seules les requêtes qui débutent par SELECT sont autorisées par le registre d'outils.   

Fichiers : L'accès aux fichiers du corpus utilise path.basename() afin d'éviter toute traversée de dossier (Path Traversal).   

Orchestration : La boucle d'exécution d'outils est limitée à 5 itérations maximum pour empêcher les boucles infinies


## 🏗️ Architecture Globale

Le projet respecte la décomposition en 5 blocs principaux[cite: 3] :

```text
[ Client HTTP ] ---> [ API Express / REST ]
                           |
                     [ Orchestrateur Agent ]
                      /        |        \
            [ RAG Retriever ]  |  [ Tools Registry ]
                   |           |          |
            [ SQLite BDD ] <---+---- [ Outils SQL / Fichiers / Math ]
                   ^
             [ Ollama Embed / Chat ]


###  Dernier coup d'œil sur la structure du projet

Voici à quoi ressemble ton projet complet prêt à être rendu ou présenté[cite: 3, 5] :

```text
agent-ia-backend/
├── corpus/
│   └── bienvenue.txt          # Corpus documentaire de démo[cite: 4, 5]
├── data/
│   └── database.sqlite        # Fichier BDD SQLite généré automatiquement[cite: 3, 5]
├── src/
│   ├── agent/
│   │   └── orchestrator.ts    # Boucle Agent + Gestion des sessions + RAG[cite: 3, 4]
│   ├── config/
│   │   └── env.ts             # Configuration centralisée (.env)[cite: 4, 5]
│   ├── db/
│   │   └── database.ts        # Schémas SQLite et données de démo (products)[cite: 3, 4]
│   ├── rag/
│   │   └── index.ts           # Chunking, Embeddings Ollama & Cosine Similarity[cite: 3, 4]
│   ├── routes/
│   │   ├── chat.ts            # POST /chat[cite: 5]
│   │   ├── documents.ts       # GET /documents[cite: 5]
│   │   ├── ingest.ts          # POST /ingest[cite: 5]
│   │   └── health.ts          # GET /health (dans app.ts)[cite: 5]
│   ├── tools/
│   │   └── index.ts           # Registre d'outils (Math, Fichiers, SQL)[cite: 3, 4]
│   └── app.ts                 # Serveur principal Express[cite: 3]
├── .env                       # Variables d'environnement[cite: 4, 5]
├── package.json               # Dépendances et scripts de lancement[cite: 5]
├── README.md                  # Documentation du projet[cite: 5, 6]
└── tsconfig.json              # Configuration TypeScript[cite: 5]