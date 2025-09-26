
import { Markup } from 'telegraf';
import { findUserById, getTransactionHistory, getAllUserIds } from '../db.js';
import { getBTC } from '../services/dolar-service.js';

// ID del administrador para comandos especiales
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// --- Manejador para /start ---
const startCommand = async (ctx) => {
    const userId = ctx.from.id;
    const isRegistered = await findUserById(userId);
    let welcomeMessage;
    let keyboard;

    if (isRegistered) {
        welcomeMessage = `¡Hola de nuevo, ${ctx.from.first_name}! 👋 ¿Qué deseas hacer hoy?`;
        keyboard = Markup.keyboard([
            ['💹 Realizar Cambio', '📜 Mi Historial'],
            ['💳 Mis Métodos de Pago', 'ℹ️ Ayuda']
        ]).resize();
    } else {
        welcomeMessage = '¡Hola! 👋 Soy tu asistente de exchange. Para comenzar, por favor, regístrate.';
        keyboard = Markup.keyboard([
            ['👤 Registrarme', 'ℹ️ Ayuda']
        ]).resize();
    }
    ctx.reply(welcomeMessage, keyboard);
};

const tazaCommand = async (ctx) => {
    const taza = await getBTC();
    ctx.reply(`¡Hola! nuestra taza es: ${taza}`);
};

// --- Manejador para /historial y su botón ---
const historyCommand = async (ctx) => {
    const userId = ctx.from.id;
    if (!(await findUserById(userId))) {
        return ctx.reply('Debes registrarte para poder ver tu historial.');
    }
    const history = await getTransactionHistory(userId);
    if (history.length === 0) {
        return ctx.reply('📂 No tienes ninguna operación en tu historial todavía.');
    }
    let message = '📜 **Tu Historial de Operaciones Recientes:**\n\n';
    history.forEach(tx => {
        const date = new Date(tx.created_at).toLocaleString('es-ES');
        const icon = tx.transaction_type === 'Comprar' ? '📈' : '📉';
        message += `------------------------------------\n`;
        message += `${icon} **Tipo:** ${tx.transaction_type}\n`;
        message += `💰 **Monto:** $${tx.total_usd}\n`;
        message += `🔵 **Estado:** ${tx.status}\n`;
        message += `📅 **Fecha:** ${date}\n`;
    });
    ctx.replyWithHTML(message);
};

// --- Manejador para /broadcast (Admin) ---
const broadcastCommand = async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ No tienes permiso para usar este comando.');
    }
    const message = ctx.message.text.slice('/broadcast'.length).trim();
    if (!message) {
        return ctx.reply('Por favor, escribe el mensaje. Ejemplo: `/broadcast ¡Hola!`');
    }
    
    ctx.reply('🚀 Iniciando el envío masivo...');
    const userIds = await getAllUserIds();
    let successCount = 0;
    let errorCount = 0;
    for (const id of userIds) {
        try {
            await ctx.telegram.sendMessage(id, message);
            successCount++;
        } catch (error) {
            console.error(`Error enviando mensaje a ${id}:`, error.description);
            errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    ctx.reply(`✅ Envío completado.\n\nExitosos: ${successCount}\nErrores: ${errorCount}`);
};

// --- Manejador para /help y su botón ---
const helpCommand = (ctx) => ctx.reply('Usa los botones del menú para interactuar conmigo y realizar tus operaciones.');


// --- Función principal para registrar todos los comandos ---
export function registerCommands(bot) {
    bot.start(startCommand);
    
    bot.command('historial', historyCommand);
    bot.hears('📜 Mi Historial', historyCommand);

    bot.command('help', helpCommand);
    bot.hears('ℹ️ Ayuda', helpCommand);

    bot.command('taza', tazaCommand);
    bot.hears('ℹ️ taza', tazaCommand);

    bot.command('broadcast', broadcastCommand);
}
