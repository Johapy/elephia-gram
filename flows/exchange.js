
import { Markup } from 'telegraf';
import { createTransaction } from '../db.js';
import { processPaymentImage } from '../services/image-service.js';
import { mainKeyboard } from '../bot/keyboards.js' // <-- Importamos el servicio
import { getBTC } from '../services/dolar-service.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const TASA_BOLIVAR = await getBTC();
const COMISION_USD = 1;

// Directorio para guardar temporalmente los comprobantes
const DOWNLOAD_DIR = path.resolve('downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}


const exchangeFlow = {
    start: async (ctx) => {
        ctx.session.flow = 'exchange';
        ctx.session.step = 'action';
        ctx.session.tasa = await getBTC();
        if (!ctx.session.tasa || isNaN(ctx.session.tasa)) {
            ctx.reply("❌ Error obteniendo la tasa del dólar. Intenta de nuevo en unos segundos, si no deseas esperar guarda nuestro contacto y realiza la operacion mediante nuestro whatsapp +584121283027");
            ctx.session.flow = null;
            ctx.session.step = null;
            return;
        }
        ctx.reply('🏦 ¡Bienvenido al módulo de cambio! ¿Qué operación deseas realizar hoy?', Markup.keyboard([
            ['📈 Comprar Zinli', '📉 Vender Zinli']
        ]).resize());
    },
    handle: async (ctx) => {
        switch (ctx.session.step) {
            // ... (otros casos sin cambios)
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
                    ctx.session.step = 'payment';
                    ctx.reply('💸 ¡Genial! Para continuar, por favor, realiza el pago y envíame una captura de pantalla del comprobante.');
                } else {
                    ctx.session.flow = null;
                    ctx.session.step = null;
                    ctx.reply('❌ Operación cancelada. Si cambias de opinión, aquí estaré para ayudarte.', mainKeyboard);
                }
                break;

            case 'payment':
                if (!ctx.message.photo) {
                    ctx.reply('Por favor, envíame una imagen del comprobante de pago.');
                    return;
                }
                ctx.reply('🤖 Analizando tu comprobante... Esto puede tardar unos segundos.');

                let imagePath = '';

                try {
                    // 1. Descargar la imagen del comprobante
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

                    // 2. Usar el servicio de imágenes para procesarla
                    const result = await processPaymentImage(imagePath);

                    if (!result.success) {
                        ctx.session.step = 'manual_reference';
                        ctx.reply(
                            `⚠️ No pude detectar automáticamente el número de referencia del comprobante.\n\n` +
                            `Por favor, escribe **solo el número de referencia** tal como aparece en tu comprobante.\n\n` +
                            `Ejemplo: 1234567890`
                        );
                        return;
                    }

                    // 3. Si tuvo éxito, guardar la transacción

                    const commission = calcularComision(ctx.session.amount);

                    const transactionData = {
                        user_telegram_id: ctx.from.id,
                        transaction_type: ctx.session.action,
                        amount_usd: ctx.session.amount,
                        commission_usd: commission,
                        total_usd: ctx.session.amount + commission,
                        rate_bs: ctx.session.tasa,
                        total_bs: (ctx.session.amount + commission) * ctx.session.tasa,
                        payment_reference: result.referenceId
                    };

                    await createTransaction(transactionData);

                    ctx.reply(`✅ ¡Pago recibido! Tu orden ha sido creada con la referencia #${result.referenceId} y está en estado "pendiente". Te notificaremos pronto.`, mainKeyboard);

                } catch (error) {
                    console.error("Error en el procesamiento del pago:", error);
                    ctx.session.step = 'manual_reference';
                    ctx.reply(
                        `⚠️ Hubo un problema al procesar el comprobante.\n` +
                        `Pero no te preocupes, aún podemos continuar.\n\n` +
                        `Por favor, escribe **solo el número de referencia** del pago.\n\n` +
                        `Ejemplo: 1234567890`
                    );
                } finally {
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                
                    // ❌ SOLO limpiamos si NO vamos a pedir referencia manual
                    if (ctx.session.step !== 'manual_reference') {
                        ctx.session.flow = null;
                        ctx.session.step = null;
                    }
                }
                break;

            case 'manual_reference':
                const ref = ctx.message.text.trim();

                if (!/^\d+$/.test(ref)) {
                    ctx.reply('❌ La referencia debe contener **solo números**. Inténtalo nuevamente.');
                    return;
                }

                // Guardamos transacción
                const commissionManual = calcularComision(ctx.session.amount);

                const transactionDataManual = {
                    user_telegram_id: ctx.from.id,
                    transaction_type: ctx.session.action,
                    amount_usd: ctx.session.amount,
                    commission_usd: commissionManual,
                    total_usd: ctx.session.amount + commissionManual,
                    rate_bs: ctx.session.tasa,
                    total_bs: (ctx.session.amount + commissionManual) * ctx.session.tasa,
                    payment_reference: ref
                };

                await createTransaction(transactionDataManual);

                ctx.reply(`✅ Pago recibido.\nTu orden ha sido creada con la referencia **#${ref}** y está en estado *pendiente*.\n\nTe notificaremos pronto.`, mainKeyboard);

                // Limpiamos sesión
                ctx.session.flow = null;
                ctx.session.step = null;
                break;
        }
    }
};

function showConfirmation(ctx) {
    const amountToReceive = ctx.session.amount;
    const commission = calcularComision(amountToReceive);
    const totalInUSD = amountToReceive + commission;
    const totalInBolivares = totalInUSD * ctx.session.tasa;

    ctx.reply(
        `🧾 Resumen de tu Operación 🧾\n\n` +
        `Acción: ${ctx.session.action} Zinli\n\n` +
        `💰 Monto a recibir: **$${amountToReceive.toFixed(2)} USD**\n` +
        `➕ Comisión del servicio: **$${commission.toFixed(2)} USD**\n\n` +
        `-------------------------------------\n` +
        `💵 **Total a Pagar (USD): $${totalInUSD.toFixed(2)}**\n` +
        `🇻🇪 **Total a Pagar (Bs.): ${totalInBolivares.toFixed(2)}**\n` +
        `-------------------------------------\n\n` +
        `¿Confirmas que los datos son correctos? taza: ${TASA_BOLIVAR} `,
        Markup.keyboard([
            ['👍 Sí, confirmar', '👎 No, cancelar']
        ]).resize()
    );

    if (ctx.session.action === "Comprar") {
        ctx.reply(
            `🧾 **PagoMovil** 🧾\n\n` +
            `Telefono: 0424-3354141\n\n` +
            `Cedula: 29.846.137\n` +
            `Banco: Banco Nacional de Credito (BNC 0191)\n` +
            `-------------------------------------\n`
        );

    }
    if (ctx.session.action === "Vender") {
        ctx.reply(
            `-------------------------------------\n` +
            `🧾 **Zinli** 🧾\n\n` +
            `Correo: yohanderjose2002@gmail.com\n\n` +
            `-------------------------------------\n`
        );

    }

}

function calcularComision(amount) {
    switch (true) {
        case (amount < 10):
            return 1; // Comisión fija de $1

        case (amount <= 25):
            return 1.5; // Comisión fija de $1.50

        default:
            return amount * 0.08; // Comisión del 8%
    }
}



export default exchangeFlow;

