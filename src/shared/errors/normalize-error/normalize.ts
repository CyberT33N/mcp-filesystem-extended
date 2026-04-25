/*
 *▄▄▄·▄▄▄  ▪   ▌ ▐· ▄▄▄· ·▄▄▄▄  ▄▄▄ . ▐ ▄ ▄▄▄▄▄
 *▐█ ▄█▀▄ █·██ ▪█·█▌▐█ ▀█ ██▪ ██ ▀▄.▀·•█▌▐█•██
 *██▀·▐▀▀▄ ▐█·▐█▐█•▄█▀▀█ ▐█· ▐█▌▐▀▀▪▄▐█▐▐▌ ▐█.▪
 *▐█▪·•▐█•█▌▐█▌ ███ ▐█ ▪▐▌██. ██ ▐█▄▄▌██▐█▌ ▐█▌·
 *.▀   .▀  ▀▀▀▀. ▀   ▀  ▀ ▀▀▀▀▀•  ▀▀▀ ▀▀ █▪ ▀▀▀
 * © privadent GmbH. All rights reserved.
 * Unauthorized copying, distribution, or modification of this software is strictly prohibited.
 */

// ═══╡ 🧩 IMPORTS ╞═══
import { isError } from 'remeda'

import { toErrorMessage } from './internal/to-error-message'

/*
 *╭───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 *📦 IMPLEMENTATION ► Implementation for: shared/errors
 *╰───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 */

/**
 * Normalize an error-like value to a concrete `Error` instance.
 *
 * @typeParam TError - Concrete `Error` subtype that should be preserved when already present.
 * @param error - The error (or unknown value) to normalize.
 * @returns
 * - The original error instance (including subclasses like `ValidationError`) when `error` is already an `Error`.
 * - A new `Error` instance wrapping the best-effort string representation otherwise.
 */
export function normalizeError<TError extends Error>(error: TError): TError
export function normalizeError(error: unknown): Error
export function normalizeError(error: unknown): Error {
    if (isError(error)) {
        // Preserve the concrete error subtype (e.g. ValidationError)
        return error
    }

    return new Error(toErrorMessage(error))
}
