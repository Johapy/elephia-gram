
import mysql from 'mysql2/promise';
import 'dotenv/config';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        console.log('Successfully connected to the database.');

        // ... (tabla users sin cambios)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                username VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // --- TABLA payment_methods MODIFICADA ---
        await connection.query(`
            CREATE TABLE IF NOT EXISTS payment_methods (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_telegram_id BIGINT NOT NULL,
                method_type ENUM('PayPal', 'Zinli', 'PagoMovil') NOT NULL,
                nickname VARCHAR(100) NOT NULL,
                
                -- Campo para PayPal (email) o Zinli (email/teléfono)
                account_details VARCHAR(255), 
                
                -- Campos específicos para Pago Móvil (pueden ser nulos)
                pm_identity_card VARCHAR(20),
                pm_phone_number VARCHAR(20),
                pm_bank_name VARCHAR(100),

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            )
        `);
        console.log('`payment_methods` table is ready.');

        // ... (tabla transactions sin cambios)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_telegram_id BIGINT NOT NULL,
                transaction_type ENUM('Comprar', 'Vender') NOT NULL,
                amount_usd DECIMAL(10, 2) NOT NULL,
                commission_usd DECIMAL(10, 2) NOT NULL,
                total_usd DECIMAL(10, 2) NOT NULL,
                rate_bs DECIMAL(10, 2) NOT NULL,
                total_bs DECIMAL(10, 2) NOT NULL,
                payment_reference VARCHAR(255),
                status ENUM('Pendiente', 'Completada', 'Fallida') DEFAULT 'Pendiente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id)
            )
        `);
        
        connection.release();
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// ... (funciones de usuario sin cambios)
export async function addUser(userData) {
    const { telegram_id, username, first_name, last_name, email, phone } = userData;
    const query = `
        INSERT INTO users (telegram_id, username, first_name, last_name, email, phone)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        username = VALUES(username), first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), phone = VALUES(phone);
    `;
    try {
        await pool.query(query, [telegram_id, username, first_name, last_name, email, phone]);
    } catch (error) {
        console.error('Error adding/updating user:', error);
    }
}
export async function findUserById(userId) {
    const query = 'SELECT telegram_id FROM users WHERE telegram_id = ? LIMIT 1;';
    try {
        const [rows] = await pool.query(query, [userId]);
        return rows.length > 0;
    } catch (error) {
        console.error('Error finding user by ID:', error);
        return false;
    }
}
export async function getAllUserIds() {
    const query = 'SELECT telegram_id FROM users;';
    try {
        const [rows] = await pool.query(query);
        return rows.map(row => row.telegram_id);
    } catch (error) {
        console.error('Error fetching user IDs:', error);
        return [];
    }
}


// --- FUNCIONES DE MÉTODOS DE PAGO MODIFICADAS ---
export async function getPaymentMethodsForUser(userId) {
    // Seleccionamos todas las columnas para poder mostrar los detalles correctos
    const query = 'SELECT * FROM payment_methods WHERE user_telegram_id = ?;';
    try {
        const [rows] = await pool.query(query, [userId]);
        return rows;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return [];
    }
}

export async function addPaymentMethod(userId, data) {
    const { method_type, nickname, account_details, pm_identity_card, pm_phone_number, pm_bank_name } = data;
    const query = `
        INSERT INTO payment_methods 
        (user_telegram_id, method_type, nickname, account_details, pm_identity_card, pm_phone_number, pm_bank_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    try {
        await pool.query(query, [userId, method_type, nickname, account_details, pm_identity_card, pm_phone_number, pm_bank_name]);
        console.log(`New payment method added for user ${userId}`);
    } catch (error) {
        console.error('Error adding payment method:', error);
    }
}

// ... (funciones de transacciones sin cambios)
export async function createTransaction(transactionData) {
    const {
        user_telegram_id,
        transaction_type,
        amount_usd,
        commission_usd,
        total_usd,
        rate_bs,
        total_bs,
        payment_reference
    } = transactionData;

    const query = `
        INSERT INTO transactions 
        (user_telegram_id, transaction_type, amount_usd, commission_usd, total_usd, rate_bs, total_bs, payment_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    try {
        await pool.query(query, [user_telegram_id, transaction_type, amount_usd, commission_usd, total_usd, rate_bs, total_bs, payment_reference]);
    } catch (error) {
        console.error('Error creating transaction:', error);
    }
}
export async function getTransactionHistory(userId) {
    const query = `
        SELECT transaction_type, total_usd, status, created_at 
        FROM transactions 
        WHERE user_telegram_id = ? 
        ORDER BY created_at DESC 
        LIMIT 10;
    `;
    try {
        const [rows] = await pool.query(query, [userId]);
        return rows;
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        return [];
    }
}
