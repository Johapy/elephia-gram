
import { Markup } from 'telegraf';
import { createTransaction, getPaymentMethodsForUserByType } from '../db.js';
import { mainKeyboard } from '../bot/keyboards.js';
import { processPaymentImage } from '../services/image-service.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const TASA_BOLIVAR = 196;
const COMISION_USD = 1;
const DOWNLOAD_DIR = path.resolve('downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

const exchangeFlow = {
    start: (ctx) => {
        ctx.session.flow = 'exchange';
        ctx.session.step = 'action';
        ctx.reply('🏦 ¡Bienvenido al módulo de cambio! ¿Qué operación deseas realizar hoy?', Markup.keyboard([
            ['📈 Comprar Zinli', '📉 Vender Zinli']
        ]).resize());
    },
    handle: async (ctx) => {
        switch (ctx.session.step) {
            // ... (casos 'action', 'select_amount', 'custom_amount', 'confirm' sin cambios)
             case 'action':
                ctx.session.action = ctx.message.text.includes('Comprar') ? 'Comprar' : 'Vender';
                ctx.session.step = 'select_amount';
                ctx.reply(`Perfecto. ¿Qué cantidad de saldo Zinli deseas ${ctx.session.action.toLowerCase()}?`, Markup.keyboard([
                    ['$1', '$5', '$10'],
                    ['$20', '$50', '$100'],
                    ['Otro monto']
                ]).resize());
                break;
            case 'select_amount':
                if (ctx.message.text === 'Otro monto') {
                    ctx.session.step = 'custom_amount';
                    ctx.reply('Por favor, ingresa el monto en USD que deseas cambiar:');
                } else {
                    const amount = parseInt(ctx.message.text.replace('$', ''));
                    if (isNaN(amount)) {
                        ctx.reply('Por favor, selecciona un monto válido del teclado.');
                        return;
                    }
                    ctx.session.amount = amount;
                    showConfirmation(ctx);
                    ctx.session.step = 'confirm';
                }
                break;
            case 'custom_amount':
                const customAmount = parseInt(ctx.message.text);
                if (isNaN(customAmount) || customAmount <= 0) {
                    ctx.reply('Monto inválido. Por favor, ingresa un número mayor a cero.');
                    return;
                }
                ctx.session.amount = customAmount;
                showConfirmation(ctx);
                ctx.session.step = 'confirm';
                break;
            case 'confirm':
                if (ctx.message.text.includes('Sí')) {
                    ctx.session.step = 'select_payment_method';
                    await promptForPaymentMethod(ctx);
                } else {
                    ctx.session.flow = null;
                    ctx.session.step = null;
                    ctx.reply('❌ Operación cancelada. Volviendo al menú principal.', mainKeyboard);
                }
                break;
            case 'select_payment_method':
                const selection = ctx.message.text;
                const availableMethods = ctx.session.availableMethods || [];
                const selectedMethod = availableMethods.find(method => method.nickname === selection);

                if (selectedMethod) {
                    ctx.session.selectedMethod = selectedMethod;
                    ctx.session.step = 'payment';
                    ctx.reply(`Perfecto. Ahora, por favor, envíame el comprobante de pago para verificar la transacción.`);
                } else {
                    ctx.reply('Por favor, selecciona un método de pago válido usando los botones.');
                }
                break;

            // --- CASO 'payment' MODIFICADO ---
            case 'payment':
                if (!ctx.message.photo) {
                    ctx.reply('Por favor, envíame una imagen del comprobante de pago.');
                    return;
                }
                ctx.reply('🤖 Analizando tu comprobante...');
                
                let imagePath = '';
                try {
                    // Descargar y procesar imagen (sin cambios)
                    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                    const url = await ctx.telegram.getFileLink(fileId);
                    const response = await axios({ url: url.href, responseType: 'stream' });
                    imagePath = path.join(DOWNLOAD_DIR, `${fileId}.jpg`);
                    const writer = fs.createWriteStream(imagePath);
                    response.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    const result = await processPaymentImage(imagePath);
                    if (!result.success) {
                        ctx.reply(`❌ Error al leer el comprobante: ${result.error}`);
                        return;
                    }

                    // --- AQUÍ ESTÁ LA LÓGICA NUEVA ---
                    // Recopilamos todos los datos para la transacción
                    const transactionData = {
                        user_telegram_id: ctx.from.id,
                        // Obtenemos el ID del método de pago que guardamos en la sesión
                        destination_payment_method_id: ctx.session.selectedMethod.id,
                        transaction_type: ctx.session.action,
                        amount_usd: ctx.session.amount,
                        commission_usd: COMISION_USD,
                        total_usd: ctx.session.amount + COMISION_USD,
                        rate_bs: TASA_BOLIVAR,
                        total_bs: (ctx.session.amount + COMISION_USD) * TASA_BOLIVAR,
                        payment_reference: result.referenceId
                    };

                    // Llamamos a la función de la BD con el objeto de datos completo
                    await createTransaction(transactionData);

                    ctx.reply(`✅ ¡Transacción registrada! Tu orden con referencia #${result.referenceId} está pendiente de procesamiento.`);

                } catch (error) {
                    console.error("Error en el procesamiento del pago:", error);
                    ctx.reply("❌ Hubo un error técnico. Por favor, contacta a soporte.");
                } finally {
                    // Limpieza (sin cambios)
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                    ctx.session.flow = null;
                    ctx.session.step = null;
                }
                break;
        }
    }
};

// ... (resto de funciones auxiliares como promptForPaymentMethod y showConfirmation sin cambios)
async function promptForPaymentMethod(ctx) {
    const userId = ctx.from.id;
    const action = ctx.session.action;
    
    let requiredTypes = [];
    let message = '';
    if (action === 'Comprar') {
        requiredTypes = ['PayPal', 'Zinli'];
        message = 'Selecciona la cuenta donde deseas recibir los fondos:';
    } else {
        requiredTypes = ['PagoMovil'];
        message = 'Selecciona el método que usarás para enviar el pago:';
    }

    const methods = await getPaymentMethodsForUserByType(userId, requiredTypes);

    if (methods.length > 0) {
        ctx.session.availableMethods = methods;
        const keyboardButtons = methods.map(method => method.nickname);
        ctx.reply(message, Markup.keyboard(keyboardButtons, { columns: 2 }).resize());
    } else {
        ctx.reply(
            `❌ No tienes ningún método de pago del tipo requerido (${requiredTypes.join('/')}) guardado.\n\n` +
            `Por favor, ve a "💳 Mis Métodos de Pago" y añade una cuenta.`,
            mainKeyboard
        );
        ctx.session.flow = null;
        ctx.session.step = null;
    }
}

function showConfirmation(ctx) {
    const amountToReceive = ctx.session.amount;
    const totalInUSD = amountToReceive + COMISION_USD;
    const totalInBolivares = totalInUSD * TASA_BOLIVAR;

    ctx.reply(
        `🧾 **Resumen de tu Operación** 🧾\n\n` +
        `Acción: ${ctx.session.action} Zinli\n\n` +
        `💰 Monto a recibir: **$${amountToReceive.toFixed(2)} USD**\n` +
        `➕ Comisión del servicio: **$${COMISION_USD.toFixed(2)} USD**\n\n` +
        `-------------------------------------\n` +
        `💵 **Total a Pagar (USD): $${totalInUSD.toFixed(2)}**\n` +
        `🇻🇪 **Total a Pagar (Bs.): ${totalInBolivares.toFixed(2)}**\n` +
        `-------------------------------------\n\n` +
        `¿Confirmas que los datos son correctos?`,
        Markup.keyboard([
            ['👍 Sí, confirmar', '👎 No, cancelar']
        ]).resize()
    );
}

export default exchangeFlow;
