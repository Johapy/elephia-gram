
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
        
        // ... (tablas users y payment_methods sin cambios)
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
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS payment_methods (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_telegram_id BIGINT NOT NULL,
                method_type ENUM('PayPal', 'Zinli', 'PagoMovil') NOT NULL,
                nickname VARCHAR(100) NOT NULL,
                account_details VARCHAR(255), 
                pm_identity_card VARCHAR(20),
                pm_phone_number VARCHAR(20),
                pm_bank_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            )
        `);

        // --- TABLA transactions MODIFICADA ---
        await connection.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_telegram_id BIGINT NOT NULL,
                
                -- Columna para vincular el método de pago usado en esta transacción
                destination_payment_method_id INT, 

                transaction_type ENUM('Comprar', 'Vender') NOT NULL,
                amount_usd DECIMAL(10, 2) NOT NULL,
                commission_usd DECIMAL(10, 2) NOT NULL,
                total_usd DECIMAL(10, 2) NOT NULL,
                rate_bs DECIMAL(10, 2) NOT NULL,
                total_bs DECIMAL(10, 2) NOT NULL,
                payment_reference VARCHAR(255),
                status ENUM('Pendiente', 'Completada', 'Fallida') DEFAULT 'Pendiente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id),
                FOREIGN KEY (destination_payment_method_id) REFERENCES payment_methods(id)
            )
        `);
        console.log('`transactions` table is ready.');
        
        connection.release();
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// ... (funciones de usuario y payment_methods sin cambios)

// --- FUNCIÓN createTransaction MODIFICADA ---
export async function createTransaction(transactionData) {
    const {
        user_telegram_id,
        destination_payment_method_id, // <-- Nuevo dato
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
        (user_telegram_id, destination_payment_method_id, transaction_type, amount_usd, commission_usd, total_usd, rate_bs, total_bs, payment_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    try {
        // Añadimos el nuevo ID a la lista de parámetros
        await pool.query(query, [user_telegram_id, destination_payment_method_id, transaction_type, amount_usd, commission_usd, total_usd, rate_bs, total_bs, payment_reference]);
        console.log(`New transaction recorded for user ${user_telegram_id}`);
    } catch (error) {
        console.error('Error creating transaction:', error);
    }
}
// ... (resto de funciones de db.js)
