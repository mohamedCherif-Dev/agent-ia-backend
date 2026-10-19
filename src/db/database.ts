import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT,
      chunk_index INTEGER,
      content TEXT,
      embedding TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT,
      price REAL,
      stock INTEGER
    )
  `);

  const count = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare('INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)');
    insert.run('PC Gamer', 'Informatique', 1299.99, 10);
    insert.run('Redraong 74', 'Accessoires', 89.90, 45);
    insert.run('Écran Oled 27 pouces 240Hz', 'Écrans', 249.50, 15);
    insert.run('g503 x', 'Accessoires', 39.99, 80);
  }
}