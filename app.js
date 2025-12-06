
import { Telegraf, session } from 'telegraf';
import 'dotenv/config';

import { initializeDatabase, findUserById } from './db.js';
import { registerCommands, broadcastMessage } from './bot/commands.js';
import registerFlow from './flows/register.js';
import exchangeFlow from './flows/exchange.js';
import paymentMethodsFlow from './flows/payment-methods.js';

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

bot.use(session({
    defaultSession: () => ({ flow: null, step: null, broadcast_text: null }) // Añadimos broadcast_text a la sesión por defecto
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

// --- OYENTE DE FOTOS MODIFICADO ---
bot.on('photo', async (ctx) => {
    const isAdmin = ctx.from.id === ADMIN_ID;
    const broadcastText = ctx.session.broadcast_text;

    // Caso 1: Es el admin y tiene un mensaje de broadcast esperando en la sesión
    if (isAdmin && broadcastText) {
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        
        ctx.reply('🚀 Iniciando el envío masivo de imagen y texto...');
        const { successCount, errorCount } = await broadcastMessage(ctx, broadcastText, photoId);
        
        ctx.session.broadcast_text = null; // Limpiamos la sesión
        ctx.reply(`✅ Envío completado.\n\nExitosos: ${successCount}\nErrores: ${errorCount}`);

    // Caso 2: Es un comprobante de pago de un usuario normal
    } else if (ctx.session?.flow === 'exchange' && ctx.session?.step === 'payment') {
        exchangeFlow.handle(ctx);

    // Caso 3: Es cualquier otra foto sin contexto
    } else {
        ctx.reply("🖼️ He recibido una imagen, pero no estoy seguro de qué hacer con ella en este momento.");
    }
});


bot.on('text', (ctx) => {
    const text = ctx.message.text;
    // Si el admin está en medio de un broadcast, no activamos otros flujos
    if (ctx.from.id === ADMIN_ID && ctx.session.broadcast_text && !text.startsWith('/')) {
        ctx.reply('Estoy esperando una imagen para tu broadcast. Si cambiaste de opinión, usa /cancelbroadcast.');
        return;
    }

    if (ctx.session?.flow === 'register') {
        registerFlow.handle(ctx);
    } else if (ctx.session?.flow === 'exchange') {
        exchangeFlow.handle(ctx);
    } else if (ctx.session?.flow === 'payment_methods') {
        paymentMethodsFlow.handle(ctx);
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
