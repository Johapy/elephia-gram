import { createWorker } from 'tesseract.js';
import path from 'path';

/**
 * Procesa una imagen para extraer texto y buscar un número de referencia o de operación.
 * @param {string} imagePath - La ruta local al archivo de imagen.
 * @returns {Promise<{success: boolean, referenceId: string|null, error: string|null}>} 
 *          Un objeto indicando el éxito, el ID encontrado (o null), y un mensaje de error (o null).
 */
async function processPaymentImage(imagePath) {
    console.log(`[ImageService] Procesando imagen: ${imagePath}`);

    const worker = await createWorker('spa'); // Usamos 'spa' para español

    try {
        const { data: { text } } = await worker.recognize(imagePath);
        console.log(`[ImageService] Texto extraído:\n---\n${text}\n---`);

        // Limpiamos el texto para evitar problemas con múltiples espacios o saltos
        const cleanedText = text.replace(/\s+/g, ' ').toLowerCase();
        console.log(`[ImageService] Texto normalizado:\n${cleanedText}\n---`);

        /**
         * Expresión regular mejorada:
         * - Detecta: referencia, nro, nro., número de referencia, operación
         * - Tolera espacios, puntos o guiones
         * - Captura números de 6 a 20 dígitos
         */
        const combinedRegex = /(n(?:ú|u)mero\s*de\s*referencia|nro\.?|referencia|operaci[oó]n)\s*[:\-]?\s*([0-9]{6,20})/i;

        const match = cleanedText.match(combinedRegex);

        if (match && match[2]) {
            const referenceId = match[2].trim();
            console.log(`[ImageService] ✅ Número de referencia encontrado: ${referenceId}`);
            return { success: true, referenceId: referenceId, error: null };
        } else {
            console.log('[ImageService] ❌ No se encontró un número de referencia válido.');
            return { success: false, referenceId: null, error: 'No se pudo encontrar un número de referencia en el comprobante.' };
        }

    } catch (error) {
        console.error('[ImageService] ❌ Error procesando la imagen con Tesseract:', error);
        return { success: false, referenceId: null, error: 'Hubo un error técnico al leer la imagen.' };
    } finally {
        await worker.terminate();
    }
}

export { processPaymentImage };
