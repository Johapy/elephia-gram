
import { Markup } from 'telegraf';
import { findUserById, getTransactionHistory, getAllUserIds } from '../db.js';
import { mainKeyboard, unegisteredKeyboard } from './keyboards.js';

const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// ... (función broadcastMessage sin cambios)
export async function broadcastMessage(ctx, text, photoId = null) {
    const userIds = await getAllUserIds();
    let successCount = 0;
    let errorCount = 0;
    for (const id of userIds) {
        try {
            if (photoId) {
                await ctx.telegram.sendPhoto(id, photoId, { caption: text, parse_mode: 'Markdown' });
            } else {
                await ctx.telegram.sendMessage(id, text, { parse_mode: 'Markdown' });
            }
            successCount++;
        } catch (error) {
            console.error(`Error enviando mensaje a ${id}:`, error.description);
            errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { successCount, errorCount };
}

// --- COMANDO /broadcast MODIFICADO ---
const textBroadcastCommand = async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ No tienes permiso para usar este comando.');
    }
    const message = ctx.message.text.slice('/broadcast'.length).trim();
    if (!message) {
        return ctx.reply('Por favor, escribe el mensaje a enviar. Si quieres adjuntar una imagen, envíala después de este comando.');
    }
    
    // Guardamos el texto en la sesión del admin
    ctx.session.broadcast_text = message;

    // Le pedimos al admin el siguiente paso
    ctx.reply(
        `✅ Tu mensaje de broadcast ha sido guardado.\n\n` +
        `Ahora, por favor, envíame la imagen que quieres adjuntar.\n\n` +
        `Si quieres enviarlo sin imagen, usa el comando /sendbroadcast.\n` +
        `Para cancelar, usa /cancelbroadcast.`
    );
};

// --- NUEVO COMANDO /sendbroadcast ---
// Para enviar el mensaje de texto que ya está en la sesión
const sendBroadcastCommand = async (ctx) => {
    if (ctx.from.id !== ADMIN_ID || !ctx.session.broadcast_text) {
        return; // No hace nada si no es admin o no hay mensaje guardado
    }
    
    ctx.reply('🚀 Iniciando el envío masivo de solo texto...');
    const { successCount, errorCount } = await broadcastMessage(ctx, ctx.session.broadcast_text);
    ctx.session.broadcast_text = null; // Limpiamos la sesión
    ctx.reply(`✅ Envío completado.\n\nExitosos: ${successCount}\nErrores: ${errorCount}`);
};

// --- NUEVO COMANDO /cancelbroadcast ---
const cancelBroadcastCommand = (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return;
    }
    ctx.session.broadcast_text = null; // Limpiamos la sesión
    ctx.reply('✅ El envío del broadcast ha sido cancelado.');
};


// ... (resto de comandos sin cambios)
const startCommand = async (ctx) => {
    const isRegistered = await findUserById(ctx.from.id);
    if (isRegistered) {
        ctx.reply(`¡Hola de nuevo, ${ctx.from.first_name}! 👋`, mainKeyboard);
    } else {
        ctx.reply('¡Hola! 👋 Soy tu asistente de exchange. Para comenzar, por favor, regístrate.', unegisteredKeyboard);
    }
};
const handleHistory = async (ctx) => {
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

    // Usamos parse_mode 'Markdown' para que los asteriscos se conviertan en negrita.
    ctx.replyWithHTML(message);
};


const helpCommand = (ctx) => ctx.reply('Usa los botones del menú para interactuar.');

export function registerCommands(bot) {
    bot.command('broadcast', textBroadcastCommand);
    bot.command('sendbroadcast', sendBroadcastCommand);
    bot.command('cancelbroadcast', cancelBroadcastCommand);

    bot.start(startCommand);
    bot.command('historial', handleHistory);
    bot.hears('📜 Mi Historial', handleHistory);
    bot.command('help', helpCommand);
    bot.hears('ℹ️ Ayuda', helpCommand);
}
