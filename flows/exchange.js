
import { Markup } from 'telegraf';
import { createTransaction } from '../db.js';
import { processPaymentImage } from '../services/image-service.js';
import { mainKeyboard } from '../bot/keyboards.js' // <-- Importamos el servicio
import { getBTC } from '../services/dolar-service.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const TASA_BOLIVAR = getBTC();
const COMISION_USD = 1;

// Directorio para guardar temporalmente los comprobantes
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
                }else {
                    ctx.session.flow = null;
                    ctx.session.step = null;
                    ctx.reply('❌ Operación cancelada. Si cambias de opinión, aquí estaré para ayudarte.');
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
                        ctx.reply(`❌ Error al leer el comprobante: ${result.error} Por favor, inténtalo de nuevo o contacta a soporte.`);
                        return;
                    }
                    
                    // 3. Si tuvo éxito, guardar la transacción
                    const transactionData = {
                        user_telegram_id: ctx.from.id,
                        transaction_type: ctx.session.action,
                        amount_usd: ctx.session.amount,
                        commission_usd: COMISION_USD,
                        total_usd: ctx.session.amount + COMISION_USD,
                        rate_bs: TASA_BOLIVAR,
                        total_bs: (ctx.session.amount + COMISION_USD) * TASA_BOLIVAR,
                        payment_reference: result.referenceId
                    };

                    await createTransaction(transactionData);

                    ctx.reply(`✅ ¡Pago recibido! Tu orden ha sido creada con la referencia #${result.referenceId} y está en estado "pendiente". Te notificaremos pronto.`, mainKeyboard);

                } catch (error) {
                    console.error("Error en el procesamiento del pago:", error);
                    ctx.reply("❌ Hubo un error técnico procesando tu comprobante. Por favor, contacta a soporte.");
                } finally {
                    // 4. Limpiar la sesión y el archivo temporal
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

