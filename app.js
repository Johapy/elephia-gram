
import { Telegraf, session } from 'telegraf';
import 'dotenv/config';

import { initializeDatabase, findUserById } from './db.js';
import { registerCommands, broadcastMessage } from './bot/commands.js';
import registerFlow from './flows/register.js';
import exchangeFlow from './flows/exchange.js';
import paymentMethodsFlow from './flows/payment-methods.js';
import { mainKeyboard } from './bot/keyboards.js';


const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

bot.use(session({
    defaultSession: () => ({ flow: null, step: null, broadcast_text: null })
}));

registerCommands(bot);

bot.hears('👤 Registrarme', (ctx) => registerFlow.start(ctx));
bot.hears('💹 Realizar Cambio', async (ctx) => {
    if (!(await findUserById(ctx.from.id))) {
        return ctx.reply('Debes registrarte primero.');
    }
    exchangeFlow.start(ctx);
});
bot.hears('💳 Mis Métodos de Pago', async (ctx) => {
    if (!(await findUserById(ctx.from.id))) {
        return ctx.reply('Debes registrarte primero.');
    }
    paymentMethodsFlow.start(ctx);
});

bot.on('photo', async (ctx) => {
    const isAdmin = ctx.from.id === ADMIN_ID;
    const broadcastText = ctx.session.broadcast_text;

    if (isAdmin && broadcastText) {
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        ctx.reply('🚀 Iniciando el envío masivo de imagen y texto...');
        const { successCount, errorCount } = await broadcastMessage(ctx, broadcastText, photoId);
        ctx.session.broadcast_text = null;
        ctx.reply(`✅ Envío completado.\n\nExitosos: ${successCount}\nErrores: ${errorCount}`);
    } else if (ctx.session?.flow === 'exchange' && ctx.session?.step === 'payment') {
        exchangeFlow.handle(ctx);
    } else {
        ctx.reply("🖼️ He recibido una imagen, pero no estoy seguro de qué hacer con ella en este momento.");
    }
});

// --- CORRECCIÓN EN EL MANEJADOR DE TEXTO ---
bot.on('text', (ctx) => {
    const text = ctx.message.text;

    // 1. PRIORIDAD: Admin Broadcast
    if (ctx.from.id === ADMIN_ID && ctx.session.broadcast_text && !text.startsWith('/')) {
        ctx.reply('Estoy esperando una imagen para tu broadcast. Si cambiaste de opinión, usa /cancelbroadcast.');
        return; // Salimos para no procesar más
    }

    // 2. PRIORIDAD: Flujos Activos (Lo más importante para tu problema)
    if (ctx.session?.flow) {
        if (ctx.session.flow === 'register') {
            registerFlow.handle(ctx);
            return; // ¡Importante! Salimos aquí para que no envíe el mensaje de bienvenida
        } else if (ctx.session.flow === 'exchange') {
            exchangeFlow.handle(ctx);
            return;
        } else if (ctx.session.flow === 'payment_methods') {
            paymentMethodsFlow.handle(ctx);
            return;
        }
    }

    // 3. PRIORIDAD: Mensajes Generales (Solo si no hay flujo activo)
    // Definimos el mensaje de bienvenida reutilizable
    const welcomeMsg = `🌟 **Bienvenido a Mueve Exchange** 🌟\n\n` +
        `¡Hola! Soy tu asistente para operaciones de cambio de divisas.\n\n` +
        `📝 **Cómo usar el bot:**\n` +
        `• Escribe **'exchange'** para iniciar una operación de cambio de bolívares\n` +
        `• Escribe **'historial'** para consultar tu historial de transacciones\n` +
        `• Escribe **'help'** para obtener ayuda adicional\n\n` +
        `Siguenos:\n` +
        `- ❇️ Facebook: @MueveCA\n` +
        `- ❇️ Instagram: @Mueve.app\n` +
        `- 📞 Whatsapp (Soporte): 0412-1283027\n` +
        `¡Estoy aquí para ayudarte con tus operaciones! 💱`;

    if (text.toLowerCase() === 'hola') {
        ctx.reply(welcomeMsg, mainKeyboard);
    } else {
        // Verificamos que no sea un botón del menú principal antes de enviar el mensaje de ayuda
        if (!['👤 Registrarme', '💹 Realizar Cambio', 'ℹ️ Ayuda', '💳 Mis Métodos de Pago', '📜 Mi Historial'].includes(text)) {
            ctx.reply(welcomeMsg, mainKeyboard);
        }
    }
});

async function startBot() {
    await initializeDatabase();
    bot.launch(() => {
        console.log('Bot started successfully!');
    });
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
