import Database from 'better-sqlite3';
import path from 'path';

// 1. Emplacements des 3 bases de données
const erpPath = path.resolve(process.cwd(), 'erp.sqlite');
const crmPath = path.resolve(process.cwd(), 'crm.sqlite');
const logsPath = path.resolve(process.cwd(), 'logs.sqlite');

export const dbErp = new Database(erpPath);
export const dbCrm = new Database(crmPath);
export const dbLogs = new Database(logsPath);

// Activation des clés étrangères
dbErp.pragma('foreign_keys = ON');
dbCrm.pragma('foreign_keys = ON');
dbLogs.pragma('foreign_keys = ON');

// 2. Initialisation des tables par base
// --- A. BDD ERP (Produits, Commandes, Factures, Paie, RAG, Sessions) ---
dbErp.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department_id INTEGER,
    hire_date TEXT,
    salary REAL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER,
    supplier_id INTEGER,
    unit_price REAL NOT NULL,
    stock_quantity INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    employee_id INTEGER,
    order_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('Pending', 'Shipped', 'Delivered', 'Cancelled')) DEFAULT 'Pending'
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    amount REAL NOT NULL,
    status TEXT CHECK(status IN ('Unpaid', 'Paid', 'Overdue')) DEFAULT 'Unpaid'
  );

  CREATE TABLE IF NOT EXISTS payroll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    pay_period TEXT,
    base_salary REAL,
    bonus REAL,
    deductions REAL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS rag_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT,
    chunk_index INTEGER,
    content TEXT NOT NULL,
    embedding TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    content TEXT,
    timestamp TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

// --- B. BDD CRM (Clients, Support, Prospects) ---
dbCrm.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    city TEXT,
    country TEXT
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    subject TEXT NOT NULL,
    status TEXT CHECK(status IN ('Open', 'In_Progress', 'Resolved')) DEFAULT 'Open',
    priority TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );
`);

// --- C. BDD LOGS (Sécurité, Rôles, Utilisateurs, Traces d'audit) ---
dbLogs.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    timestamp TEXT
  );
`);

// 3. Injection automatique des données de démonstration dans chaque base
const deptCount = dbErp.prepare('SELECT COUNT(*) as count FROM departments').get() as { count: number };
if (deptCount.count === 0) {
  console.log('🌱 Seed ERP...');
  dbErp.exec(`
    INSERT INTO departments (name, location) VALUES ('Direction', 'Paris'), ('Comptabilité', 'Lyon');
    INSERT INTO employees (first_name, last_name, email, department_id, hire_date, salary) 
    VALUES ('Alice', 'Martin', 'alice@entreprise.com', 1, '2021-03-15', 55000),
           ('Bob', 'Dupont', 'bob@entreprise.com', 2, '2022-06-01', 42000);
    INSERT INTO payroll (employee_id, pay_period, base_salary, bonus, deductions) 
    VALUES (1, '2026-01', 3500, 500, 200), (2, '2026-01', 2800, 150, 100);
  `);
}

const clientCount = dbCrm.prepare('SELECT COUNT(*) as count FROM clients').get() as { count: number };
if (clientCount.count === 0) {
  console.log('🌱 Seed CRM...');
  dbCrm.exec(`
    INSERT INTO clients (company_name, contact_name, email, city, country) 
    VALUES ('Alpha Corp', 'Jean Alpha', 'jean@alphacorp.com', 'Paris', 'France');
    INSERT INTO tickets (client_id, subject, status, priority) 
    VALUES (1, 'Problème de connexion VPN', 'Open', 'High');
  `);
}

const roleCount = dbLogs.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number };
if (roleCount.count === 0) {
  console.log('🌱 Seed Logs & Security...');
  dbLogs.exec(`
    INSERT INTO roles (name, description) VALUES ('admin', 'Accès complet'), ('comptable', 'Accès finances');
    INSERT INTO users (username, password, role_id) VALUES ('admin_user', 'admin123', 1);
    INSERT INTO audit_logs (user_id, action, timestamp) VALUES (1, 'System initialized', datetime('now'));
  `);
}

// Export par défaut (compatible avec l'ERP pour les sessions/RAG)
export default dbErp;