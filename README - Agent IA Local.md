# 🤖 Agent IA Local (RAG, Tools & Multimodal Architecture)

Un agent d'intelligence artificielle autonome et local construit avec **Node.js**, **TypeScript**, **Express**, **SQLite** et **Ollama**. Ce projet fournit un système complet de traitement du langage naturel capable d'exécuter des outils en boucle fermée, d'effectuer de la recherche documentaire augmentée (RAG) et de gérer des sessions de conversation persistantes, le tout exposé via une API REST et une interface Web dédiée.

---

## 📋 Table des matières

- [Fonctionnalités principales](#-fonctionnalités-principales)  
- [Architecture du système](#-architecture-du-système)  
- [Prérequis](#-prérequis)  
- [Installation et démarrage rapide](#-installation-et-démarrage-rapide)  
- [Structure du projet](#-structure-du-projet)  
- [Documentation de l'API REST](#-documentation-de-lapi-rest)  
- [Outils intégrés & RAG](#-outils-intégrés--rag)  
- [Sécurité et garde-fous](#-sécurité-et-garde-fous)  
- [Scénarios de validation & Démonstration](#-scénarios-de-validation--démonstration)

---

## ✨ Fonctionnalités principales

* **LLM & Embeddings Locaux :** Intégration d'Ollama (`llama3.2` pour la génération/chat et `nomic-embed-text` pour la vectorisation).  
* **Orchestrateur & Boucle d'Outils (Tool Loop) :** Capacité d'exécution itérative d'outils (limite fixée à 5 itérations maximum).  
* **Pipeline RAG Complète :** Découpage en *chunks*, génération d'embeddings vectoriels, stockage local dans SQLite et recherche par similarité cosinus.  
* **Système d'Outils Sécurisés (Tool Registry) :**  
  * Évaluation d'expressions mathématiques (via `mathjs`).  
  * Inspection et lecture restreinte des fichiers du corpus.  
  * Exécution de requêtes SQL en lecture seule (`SELECT` uniquement).  
* **Persistance SQLite :** Gestion complète des sessions utilisateur, de l'historique de conversation et des données métier de démonstration.  
* **Interface Web Unifiée :** Dashboard minimaliste avec gestion de sessions, rendu Markdown/code et panneau d'ingestion RAG.

---

## 🏗️ Architecture du système

Le projet respecte une architecture modulaire à 5 blocs distincts :

```
┌────────────────────────────────────────────────────────┐
│               Client Web / Client HTTP                 │
└──────────────────────────┬─────────────────────────────┘
                           │ (HTTP REST)
┌──────────────────────────▼─────────────────────────────┐
│                   API REST Express                     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                 Orchestrator Agent                     │
│  (Gestion prompt, historique, boucle d'outils, RAG)    │
└────────┬────────────────────┬────────────────────┬─────┘
         │                    │                    │
┌────────▼─────────┐ ┌────────▼──────────┐ ┌───────▼──────────┐
│   Ollama Chat    │ │   RAG Retriever   │ │   Tool Registry  │
│  (llama3.2)      │ │ & Ollama Embed    │ │ (Math, Files,SQL)│
└──────────────────┘ └────────┬──────────┘ └───────┬──────────┘
                              │                    │
                     ┌────────▼────────────────────▼──────────┐
                     │            Base SQLite                 │
                     │ (Sessions, Chunks RAG, Produits)       │
                     └────────────────────────────────────────┘
```

&nbsp;

---

## ⚙️ Prérequis

* **Node.js** v20.0.0 ou supérieur.  
* **npm** ou **yarn**.  
* **Ollama** installé et exécuté localement (sur GPU ou CPU).  
* Modèles Ollama téléchargés :

```sh
ollama pull llama3.2
ollama pull nomic-embed-text
```

---

## 🚀 Installation et démarrage rapide

1. **Cloner le dépôt Git :**

```sh
git clone https://github.com/mohamedCherif-Dev/agent-ia-backend.git
cd agent-ia-backend
```

2. **Installer les dépendances :**

```sh
npm install
```

3. **Configurer les variables d'environnement :** Copiez le fichier exemple `.env.example` en `.env` (ajustez si besoin) :

```sh
cp .env.example .env
```

   *Contenu type de `.env` :*

   ```env

   PORT=3000

   OLLAMA_BASE_URL=http://localhost:11434

   OLLAMA_CHAT_MODEL=llama3.2

   OLLAMA_EMBED_MODEL=nomic-embed-text

   DATABASE_PATH=./data/database.sqlite

   CORPUS_PATH=./data/corpus

   ```

4. **Initialiser la base de données et les données de démo :**

```sh
npm run seed
```

5. **Lancer le serveur en mode développement :**

```sh
npm run dev
```

6. **Accéder à l'interface :** Ouvrez votre navigateur web sur `http://localhost:3000`.

---

## 📂 Structure du projet

```
agent-ia-backend/
├── data/                  # Fichiers BDD SQLite et corpus documentaire
│   ├── corpus/            # Fichiers texte/markdown à indexer par le RAG
│   └── database.sqlite    # Base de données locale
├── public/                # Interface web (HTML/CSS/JS)
│   └── index.html
├── src/
│   ├── agent/             # Orchestrateur et gestion de la boucle d'agent
│   │   ├── orchestrator.ts
│   │   └── prompt.ts
│   ├── db/                # Initialisation et schémas SQLite
│   │   └── database.ts
│   ├── rag/               # Chunking, embeddings et recherch de similarité
│   │   ├── chunker.ts
│   │   └── vectorStore.ts
│   ├── routes/            # Routes d'API REST
│   │   ├── chat.ts
│   │   ├── health.ts
│   │   ├── ingest.ts
│   │   └── sessions.ts
│   ├── tools/             # Registre et implémentation des outils
│   │   ├── registry.ts
│   │   ├── mathTool.ts
│   │   ├── fileTool.ts
│   │   └── sqlTool.ts
│   └── app.ts             # Point d'entrée de l'application Express
├── .env.example
├── tsconfig.json
└── package.json
```

&nbsp;

---

## 📑 Documentation de l'API REST

| Méthode | Route | Description | Exemple de Body |
| :---- | :---- | :---- | :---- |
| **GET** | `/health` | Vérifie l'état de santé du serveur, de la BDD et d'Ollama. | *Aucun* |
| **POST** | `/chat` | Envoie un message à l'agent (session automatique si non fournie). | `{"message": "Calcul 12 * 4", "sessionId": "sess_1"}` |
| **POST** | `/ingest` | Découpe, vectorise et stocke un fichier du corpus. | `{"filename": "bienvenue.txt"}` |
| **GET** | `/documents` | Renvoie la liste des documents indexés dans le système RAG. | *Aucun* |
| **DELETE** | `/sessions/:id` | Supprime une session et tout son historique de la BDD. | *Aucun* |

&nbsp;

---

## 🛠️ Outils intégrés & RAG

### 1\. Registre d'outils (Tools)

L'agent évalue la demande utilisateur et peut décider d'appeler un ou plusieurs outils :

* **`calculator`** : Résolution rigoureuse d'expressions mathématiques via `mathjs`.  
* **`list_corpus_files`** : Liste tous les fichiers lisibles dans le dossier `data/corpus/`.  
* **`read_corpus_file`** : Lit le contenu textuel d'un fichier du corpus.  
* **`query_db`** : Exécute des requêtes de lecture en base SQLite.

### 2\. Pipeline RAG (Retrieval-Augmented Generation)

* **Chunking** : Découpage par fenêtres de texte avec chevauchement (*overlap*).  
* **Embeddings** : Vectorisation via le modèle `nomic-embed-text`.  
* **Similarité** : Calcul de similarité cosinus pour extraire les $k$ passages les plus pertinents et enrichir le contexte d'Ollama.

---

## 🔒 Sécurité et garde-fous

* **Sécurité SQL** : Le Tool SQL rejette strictement toutes les requêtes qui ne commencent pas par un mot-clé `SELECT` (interdiction de `DROP`, `INSERT`, `UPDATE`, `DELETE`).  
* **Protection Traversal Path** : L'outil d'accès aux fichiers filtre les chemins (`path.basename`) afin d'interdire l'accès hors du répertoire `data/corpus/`.  
* **Bornage de la boucle d'outils** : L'orchestrateur plafonne le nombre d'appels d'outils successifs à **5 itérations max** pour prévenir les boucles infinies.

---

## ✅ Scénarios de validation & Démonstration

Pour vérifier la conformité du système lors d'une démonstration :

1. **S1 \- Vérification Santé :** Interroger `/health` pour s'assurer que SQLite et Ollama répondent.  
2. **S2 \- Chat simple :** Poser une question ouverte et vérifier la réponse avec création de `sessionId`.  
3. **S3 \- Outil Calcul :** Demander un calcul complexe (`"Calcule 250 * 48 / 12"`) et observer l'activation de `mathjs`.  
4. **S4 \- Outil SQL :** Demander `"Liste tous les produits en stock"` pour vérifier la requête `SELECT` automatique.  
5. **S5 \- Ingestion RAG :** Déposer un fichier dans `data/corpus/`, appeler `/ingest`, puis poser une question sur son contenu.  
6. **S6 \- Nettoyage :** Supprimer la session via l'interface web (bouton ❌ avec confirmation) et vérifier son effacement via `DELETE /sessions/:id`.