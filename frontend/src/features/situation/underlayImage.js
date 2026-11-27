// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// An existing plan (a page of a PDF, or a picture) as the small JPEG that is kept behind a page of the situatieschema (model/underlay.js).
// pdf.js (about 2 MB) is loaded only when a PDF is chosen.
import {MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_PIXELS, imageBytes} from '../../model/underlay.js'

/** An error whose message is shown to the user as it is. */
export class UnderlayError extends Error {}

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')

const megabytes = (bytes) => (bytes / 1024 / 1024).toLocaleString(undefined, {maximumFractionDigits: 1})

// a white canvas of `width` x `height` pixels and its 2D context
const whiteCanvas = (width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return {canvas, context}
}

// page `number` of a PDF drawn on a canvas, its longest side MAX_PIXELS
const pdfCanvas = async (file, choosePage) => {
    const [pdfjs, {default: workerUrl}] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    // no eval (the Content-Security-Policy of Plugged allows only its own scripts)
    const task = pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}),
        pdf = await task.promise
    try {
        const number = pdf.numPages > 1 ? await choosePage(pdf.numPages) : 1
        if (!number) return null
        const page = await pdf.getPage(number),
            natural = page.getViewport({scale: 1}),
            viewport = page.getViewport({scale: MAX_PIXELS / Math.max(natural.width, natural.height)}),
            {canvas, context} = whiteCanvas(viewport.width, viewport.height)
        await page.render({canvas, canvasContext: context, viewport, background: '#fff'}).promise
        return canvas
    } finally {
        task.destroy()
    }
}

// a picture drawn on a canvas, its longest side at most MAX_PIXELS
const pictureCanvas = async (file) => {
    const bitmap = await createImageBitmap(file),
        factor = Math.min(1, MAX_PIXELS / Math.max(bitmap.width, bitmap.height)),
        {canvas, context} = whiteCanvas(bitmap.width * factor, bitmap.height * factor)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    return canvas
}

// the canvas as a JPEG of at most MAX_IMAGE_BYTES: lower quality first, then fewer pixels
const smallJpeg = (canvas) => {
    for (const size of [1, 0.8, 0.65, 0.5, 0.4]) {
        const {canvas: scaled, context} = size === 1 ? {canvas} : whiteCanvas(canvas.width * size, canvas.height * size)
        if (size !== 1) context.drawImage(canvas, 0, 0, scaled.width, scaled.height)
        for (const quality of [0.8, 0.65, 0.5]) {
            const src = scaled.toDataURL('image/jpeg', quality)
            if (imageBytes(src) <= MAX_IMAGE_BYTES) return {src, width: scaled.width, height: scaled.height}
        }
    }
    return null
}

/**
 * The plan in `file` (a PDF: the page `choosePage(count)` resolves to, asked only when there are several; a PNG, JPEG or WebP picture) as
 * {src, width, height}, or null when no page was chosen. Throws an UnderlayError with a message for the user when the file is too large or
 * cannot be read. `t` translates the messages.
 */
export async function underlayFromFile(file, {choosePage, t}) {
    if (file.size > MAX_FILE_BYTES) throw new UnderlayError(t('underlay.fileTooLarge', {size: megabytes(file.size), max: megabytes(MAX_FILE_BYTES)}))
    let canvas
    try {
        canvas = isPdf(file) ? await pdfCanvas(file, choosePage) : await pictureCanvas(file)
    } catch {
        throw new UnderlayError(t('underlay.unreadable'))
    }
    if (!canvas) return null
    const image = smallJpeg(canvas)
    if (!image) throw new UnderlayError(t('underlay.imageTooLarge'))
    return image
}
