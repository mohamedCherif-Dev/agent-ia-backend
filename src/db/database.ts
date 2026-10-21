import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

// Activation des clés étrangères pour l'intégrité relationnelle
db.pragma('foreign_keys = ON');

// Création de toutes les tables nécessaires (ERP, RAG, Sessions, Messages)
db.exec(`
  -- 1. Départements
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT
  );

  -- 2. Employés
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

  -- 3. Rôles utilisateurs
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
  );

  -- 4. Utilisateurs de l'application
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role_id INTEGER,
    FOREIGN KEY (role_id) REFERENCES roles(id)
  );

  -- 5. Fournisseurs
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT
  );

  -- 6. Catégories de produits
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
  );

  -- 7. Produits
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

  -- 8. Clients
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    city TEXT,
    country TEXT
  );

  -- 9. Commandes
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    employee_id INTEGER,
    order_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('Pending', 'Shipped', 'Delivered', 'Cancelled')) DEFAULT 'Pending',
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  -- 10. Lignes de commande
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- 11. Factures
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    amount REAL NOT NULL,
    status TEXT CHECK(status IN ('Unpaid', 'Paid', 'Overdue')) DEFAULT 'Unpaid',
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  -- 12. Journaux de stock / Mouvements
  CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    change_amount INTEGER NOT NULL,
    reason TEXT,
    log_date TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- 13. Salaires & Paie
  CREATE TABLE IF NOT EXISTS payroll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    pay_period TEXT,
    base_salary REAL,
    bonus REAL,
    deductions REAL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  -- 14. Logs d'audit système
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    timestamp TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 15. Table des chunks RAG / Documents
  CREATE TABLE IF NOT EXISTS rag_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT,
    chunk_index INTEGER,
    content TEXT NOT NULL,
    embedding TEXT
  );
  -- 16. Table des sessions de chat
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT
  );

  -- 17. Table des messages de chat
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    content TEXT,
    timestamp TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

// Insertion de données de démonstration si les tables sont vides
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  console.log('🌱 Injection des données de démonstration...');
  db.exec(`
    INSERT INTO roles (name, description) VALUES ('admin', 'Accès complet');
    INSERT INTO roles (name, description) VALUES ('comptable', 'Accès finances');
    INSERT INTO roles (name, description) VALUES ('guest', 'Accès restreint');

    INSERT INTO users (username, password, role_id) VALUES ('admin_user', 'admin123', 1);
    INSERT INTO users (username, password, role_id) VALUES ('compta_user', 'compta123', 2);
    INSERT INTO users (username, password, role_id) VALUES ('guest_user', 'guest123', 3);

    INSERT INTO departments (name, location) VALUES ('Direction', 'Paris');
    INSERT INTO departments (name, location) VALUES ('Comptabilité', 'Lyon');
    INSERT INTO departments (name, location) VALUES ('Ventes', 'Marseille');

    INSERT INTO employees (first_name, last_name, email, department_id, hire_date, salary) VALUES ('Alice', 'Martin', 'alice@entreprise.com', 1, '2021-03-15', 55000);
    INSERT INTO employees (first_name, last_name, email, department_id, hire_date, salary) VALUES ('Bob', 'Dupont', 'bob@entreprise.com', 2, '2022-06-01', 42000);

    INSERT INTO suppliers (company_name, contact_name, phone, email) VALUES ('TechGlobal', 'David Tech', '0102030405', 'contact@techglobal.com');
    INSERT INTO categories (name, description) VALUES ('Matériel Informatique', 'Ordinateurs et accessoires');
    INSERT INTO products (name, category_id, supplier_id, unit_price, stock_quantity) VALUES ('PC Portable Pro 15"', 1, 1, 1200.00, 15);
    
    INSERT INTO clients (company_name, contact_name, email, city, country) VALUES ('Alpha Corp', 'Jean Alpha', 'jean@alphacorp.com', 'Paris', 'France');
    INSERT INTO orders (client_id, employee_id, order_date, status) VALUES (1, 2, '2026-02-10', 'Delivered');
    INSERT INTO invoices (order_id, issue_date, due_date, amount, status) VALUES (1, '2026-02-11', '2026-03-11', 2400.00, 'Paid');
  `);
  console.log('✅ Données insérées avec succès.');
}

export function initDatabase() {
  return db;
}

export default db;