
import { Markup } from 'telegraf';
import { findUserById, getTransactionHistory, getAllUserIds } from '../db.js';
import { mainKeyboard, unegisteredKeyboard } from './keyboards.js';

const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// --- FUNCIÓN DE BROADCAST MEJORADA ---
// Ahora acepta un photoId opcional. Si se le pasa, envía una foto con caption.
// Si no, envía solo texto.
export async function broadcastMessage(ctx, text, photoId = null) {
    const userIds = await getAllUserIds();
    let successCount = 0;
    let errorCount = 0;

    // Usamos un bucle for...of para poder usar await dentro y no saturar la API
    for (const id of userIds) {
        try {
            if (photoId) {
                // Si hay photoId, usamos el método sendPhoto
                await ctx.telegram.sendPhoto(id, photoId, { caption: text, parse_mode: 'Markdown' });
            } else {
                // Si no, usamos el método de siempre
                await ctx.telegram.sendMessage(id, text, { parse_mode: 'Markdown' });
            }
            successCount++;
        } catch (error) {
            // Este error suele ocurrir si un usuario bloqueó al bot.
            console.error(`Error enviando mensaje a ${id}:`, error.description);
            errorCount++;
        }
        // Pequeña pausa para evitar ser marcado como spam por Telegram
        await new Promise(resolve => setTimeout(resolve, 100)); 
    }
    
    // Devolvemos el resultado para que el comando original pueda notificar al admin
    return { successCount, errorCount };
}


// --- Comandos ---
const startCommand = async (ctx) => {
    const isRegistered = await findUserById(ctx.from.id);
    if (isRegistered) {
        ctx.reply(`¡Hola de nuevo, ${ctx.from.first_name}! 👋`, mainKeyboard);
    } else {
        ctx.reply('¡Hola! 👋 Soy tu asistente de exchange. Para comenzar, por favor, regístrate.', unegisteredKeyboard);
    }
};

const historyCommand = async (ctx) => {
    // ... (lógica del historial sin cambios)
};

const helpCommand = (ctx) => ctx.reply('Usa los botones del menú para interactuar.');

// Este es el comando para broadcast de SOLO TEXTO
const textBroadcastCommand = async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ No tienes permiso para usar este comando.');
    }
    const message = ctx.message.text.slice('/broadcast'.length).trim();
    if (!message) {
        return ctx.reply('Por favor, escribe el mensaje. Ejemplo: `/broadcast ¡Hola a todos!`');
    }
    
    ctx.reply('🚀 Iniciando el envío masivo de texto...');
    const { successCount, errorCount } = await broadcastMessage(ctx, message); // No pasamos photoId
    ctx.reply(`✅ Envío completado.\n\nExitosos: ${successCount}\nErrores: ${errorCount}`);
};

export function registerCommands(bot) {
    bot.start(startCommand);
    
    bot.command('historial', historyCommand);
    bot.hears('📜 Mi Historial', historyCommand);

    bot.command('help', helpCommand);
    bot.hears('ℹ️ Ayuda', helpCommand);

    bot.command('broadcast', textBroadcastCommand); // El /broadcast de texto sigue funcionando
}
