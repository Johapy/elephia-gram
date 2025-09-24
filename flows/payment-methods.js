
import { Markup } from 'telegraf';
import { addPaymentMethod, getPaymentMethodsForUser } from '../db.js';
import { mainKeyboard, cancelKeyboard } from '../bot/keyboards.js';

const paymentMethodsFlow = {
    start: (ctx) => {
        ctx.session.flow = 'payment_methods';
        ctx.session.step = 'menu';
        showMenu(ctx);
    },

    handle: async (ctx) => {
        const text = ctx.message.text;
        const step = ctx.session.step;

        if (text === '⬅️ Cancelar') {
            ctx.session.flow = null;
            ctx.session.step = null;
            ctx.session.paymentData = null;
            ctx.reply('Operación cancelada. Volviendo al menú principal.', mainKeyboard);
            return;
        }

        switch (step) {
            case 'menu':
                if (text === '➕ Añadir Nuevo Método') {
                    ctx.session.step = 'add_method_type';
                    ctx.reply('Selecciona el tipo de método de pago que deseas añadir:', Markup.keyboard([
                        ['PayPal', 'Zinli', 'Pago Móvil'],
                        ['⬅️ Cancelar']
                    ]).resize());
                } else if (text === '⬅️ Volver al Menú Principal') {
                    ctx.session.flow = null;
                    ctx.reply('Volviendo al menú principal.', mainKeyboard);
                }
                break;

            case 'add_method_type':
                handleMethodTypeSelection(ctx);
                break;
            case 'add_nickname':
                ctx.session.paymentData.nickname = text;
                askForDetails(ctx);
                break;
            case 'add_details_paypal_zinli':
                ctx.session.paymentData.account_details = text;
                await savePaymentMethod(ctx);
                break;
            case 'add_details_pm_identity':
                ctx.session.paymentData.pm_identity_card = text;
                ctx.session.step = 'add_details_pm_phone';
                ctx.reply('Ahora, ingresa el número de teléfono afiliado al Pago Móvil:');
                break;
            case 'add_details_pm_phone':
                ctx.session.paymentData.pm_phone_number = text;
                ctx.session.step = 'add_details_pm_bank';
                ctx.reply('Finalmente, escribe el nombre de tu banco:');
                break;
            case 'add_details_pm_bank':
                ctx.session.paymentData.pm_bank_name = text;
                await savePaymentMethod(ctx);
                break;
        }
    }
};

async function showMenu(ctx) {
    const userId = ctx.from.id;
    const methods = await getPaymentMethodsForUser(userId);
    let message = '💳 **Gestión de Métodos de Pago**\n\n';
    if (methods.length === 0) {
        message += 'Aún no tienes ningún método de pago guardado.';
    } else {
        message += 'Tus métodos de pago guardados:\n';
        methods.forEach(method => {
            message += `\n- **${method.nickname}** (${method.method_type})`;
        });
    }
    ctx.replyWithHTML(message, Markup.keyboard([
        ['➕ Añadir Nuevo Método'],
        ['⬅️ Volver al Menú Principal']
    ]).resize());
}

function handleMethodTypeSelection(ctx) {
    const selection = ctx.message.text;
    let methodType;

    // --- LA CORRECCIÓN ESTÁ AQUÍ ---
    // Mapeamos la entrada del usuario al valor ENUM correcto de la BD
    switch (selection) {
        case 'PayPal':
            methodType = 'PayPal';
            break;
        case 'Zinli':
            methodType = 'Zinli';
            break;
        case 'Pago Móvil':
            methodType = 'PagoMovil';
            break;
        default:
            ctx.reply('Por favor, selecciona una opción válida del teclado.');
            return;
    }

    const userId = ctx.from.id;
    getPaymentMethodsForUser(userId).then(methods => {
        const alreadyExists = methods.some(m => m.method_type === methodType);

        if (alreadyExists) {
            ctx.reply(`⚠️ Ya tienes registrado un método de tipo *${methodType}*. No puedes añadir otro.`, cancelKeyboard);
            ctx.session.step = 'menu';
            return;
        }

        ctx.session.paymentData = { method_type: methodType };
        ctx.session.step = 'add_nickname';
        ctx.reply(`Perfecto. Dale un apodo a este método (Ej: "Pago Móvil Personal"):`, cancelKeyboard);
    }).catch(err => {
        console.error('Error verificando métodos de pago:', err);
        ctx.reply('❌ Ocurrió un error al verificar tus métodos de pago.');
    });
}

function askForDetails(ctx) {
    const type = ctx.session.paymentData.method_type;
    if (type === 'PayPal' || type === 'Zinli') {
        ctx.session.step = 'add_details_paypal_zinli';
        ctx.reply(`Ingresa el correo electrónico de tu cuenta ${type}:`);
    } else if (type === 'PagoMovil') {
        ctx.session.step = 'add_details_pm_identity';
        ctx.reply('Ahora, ingresa tu Cédula de Identidad (V/E):');
    }
}

async function savePaymentMethod(ctx) {
    await addPaymentMethod(ctx.from.id, ctx.session.paymentData);
    ctx.reply('✅ ¡Método de pago guardado exitosamente!');
    
    ctx.session.flow = null;
    ctx.session.step = null;
    ctx.session.paymentData = null;
    
    ctx.reply('¿Qué deseas hacer ahora?', mainKeyboard);
}

export default paymentMethodsFlow;
