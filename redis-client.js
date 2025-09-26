
import { createClient } from 'redis';
import 'dotenv/config';

// Se conecta usando la URL de tu archivo .env o una por defecto
const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));

// Nos aseguramos de que el cliente esté conectado
// La función se autoejecuta para establecer la conexión al iniciar el bot.
(async () => {
    if (!client.isOpen) {
        await client.connect();
    }
})();

console.log('Redis client is ready.');

export default client;
