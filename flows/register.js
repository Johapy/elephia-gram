
import { Markup, session } from 'telegraf';
import { addUser } from '../db.js';
import { mainKeyboard } from '../bot/keyboards.js';

const registerFlow = {
    start: (ctx) => {
        ctx.session.flow = 'register';
        ctx.session.step = 'name';
        ctx.reply('👋 ¡Hola! Por favor, escribe tu nombre completo:');
    },
    handle: async (ctx) => {
        switch (ctx.session.step) {
            case 'name':
                ctx.session.name = ctx.message.text;
                ctx.session.step = 'email';
                ctx.reply('📧 ¡Excelente! Ahora, ingresa tu correo electrónico.');
                break;
            case 'email':
                ctx.session.email = ctx.message.text;
                ctx.session.step = 'phone';
                ctx.reply('📱 ¡Ya casi terminamos! Ingresa tu número de teléfono.');
                break;
            case 'phone':
                ctx.session.phone = ctx.message.text;
                
                const userData = {
                    telegram_id: ctx.from.id,
                    username: ctx.from.username || 'N/A',
                    first_name: ctx.from.first_name,
                    last_name: ctx.from.last_name || 'N/A',
                    email: ctx.session.email,
                    phone: ctx.session.phone
                };

                // Guardamos el usuario en la base de datos MySQL
                await addUser(userData);

                // Limpiamos la sesión
                ctx.session = null;
                ctx.reply('✅ ¡Registro completado! 🎉 Gracias por unirte.', mainKeyboard);
                break;
        }
    }
};

export default registerFlow;
