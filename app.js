
import { Telegraf, session } from 'telegraf';
import 'dotenv/config';

import { initializeDatabase, findUserById } from './db.js';
import { registerCommands } from './bot/commands.js';
import registerFlow from './flows/register.js';
import exchangeFlow from './flows/exchange.js';
import paymentMethodsFlow from './flows/payment-methods.js'; // <-- 1. IMPORTAR EL NUEVO FLUJO
import { mainKeyboard } from './bot/keyboards.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Middlewares
bot.use(session({
    defaultSession: () => ({ flow: null, step: null })
}));

// 2. Comandos
registerCommands(bot);

// 3. 'hears' para iniciar flujos
bot.hears('👤 Registrarme', async (ctx) => {
    if (await findUserById(ctx.from.id)) {
        return ctx.reply('Ya estás registrado.');
    }
    registerFlow.start(ctx)
});

bot.hears('💹 Realizar Cambio', async (ctx) => {
    if (!(await findUserById(ctx.from.id))) {
        return ctx.reply('Debes registrarte para poder ver tu historial, escribe /start para iniciar tu registro!');
    }
    exchangeFlow.start(ctx);
});

// --- 2. NUEVO 'hears' PARA EL FLUJO DE MÉTODOS DE PAGO ---
bot.hears('💳 Mis Métodos de Pago', async (ctx) => {
    if (!(await findUserById(ctx.from.id))) {
        return ctx.reply('Debes registrarte para poder ver tu historial, escribe /start para iniciar tu registro!');
    }
    paymentMethodsFlow.start(ctx);
});


// 4. Manejadores generales para flujos activos
bot.on('text', (ctx) => {
    const text = ctx.message.text;
    if (text === 'hola') {
        ctx.reply(
            `🌟 **Bienvenido a Mueve Exchange** 🌟\n\n` +
            `¡Hola! Soy tu asistente para operaciones de cambio de divisas.\n\n` +
            `📝 **Cómo usar el bot:**\n` +
            `• Escribe **'exchange'** para iniciar una operación de cambio de bolívares\n` +
            `• Escribe **'historial'** para consultar tu historial de transacciones\n` +
            `• Escribe **'help'** para obtener ayuda adicional\n\n` +
            `` +
            `Siguenos:\n` +
            `- ❇️ Facebook: @MueveCA\n` +
            `- ❇️ Instagram: @Mueve.app\n` +
            `- 📞 Whatsapp (Soporte): 0412-1283027\n` +
            `¡Estoy aquí para ayudarte con tus operaciones! 💱`, mainKeyboard
        );
        return;
    }

    if (ctx.session?.flow === 'register') {
        registerFlow.handle(ctx);
    } else if (ctx.session?.flow === 'exchange') {
        exchangeFlow.handle(ctx);
    } else if (ctx.session?.flow === 'payment_methods') { // <-- 3. AÑADIR CONDICIÓN PARA EL NUEVO FLUJO
        paymentMethodsFlow.handle(ctx);
    } 
    else {
        if (!['👤 Registrarme', '💹 Realizar Cambio', 'ℹ️ Ayuda', '💳 Mis Métodos de Pago', '📜 Mi Historial'].includes(text)) {
            ctx.reply(
                `🌟 **Bienvenido a Mueve Exchange** 🌟\n\n` +
                `¡Hola! Soy tu asistente para operaciones de cambio de divisas.\n\n` +
                `📝 **Cómo usar el bot:**\n` +
                `• Escribe **'exchange'** para iniciar una operación de cambio de bolívares\n` +
                `• Escribe **'historial'** para consultar tu historial de transacciones\n` +
                `• Escribe **'help'** para obtener ayuda adicional\n\n` +
                `` +
                `Siguenos:\n` +
                `- ❇️ Facebook: @MueveCA\n` +
                `- ❇️ Instagram: @Mueve.app\n` +
                `- 📞 Whatsapp (Soporte): 0412-1283027\n` +
                `¡Estoy aquí para ayudarte con tus operaciones! 💱`, mainKeyboard
            );
        }
    }
});

bot.on('photo', (ctx) => {
    if (ctx.session?.flow === 'exchange' && ctx.session?.step === 'payment') {
        exchangeFlow.handle(ctx);
    } else {
        ctx.reply("🖼️ He recibido una imagen, pero no estoy seguro de qué hacer con ella.");
    }
});


// 5. Iniciar el bot
async function startBot() {
    await initializeDatabase();
    bot.launch(() => {
        console.log('Bot started successfully!');
    });
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
