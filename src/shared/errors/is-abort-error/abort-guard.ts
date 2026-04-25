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

// ═══╡ 🏷️ TYPES ╞═══
import type { AbortErrorLike } from './contracts'

/*
 *╭───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 *📦 IMPLEMENTATION ► Implementation for: shared/errors
 *╰───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 */

/**
 * Checks if the error is an abort error.
 *
 * @param value - The value to check.
 * @returns True if the value is an abort error, false otherwise.
 */
export const isAbortError = (value: unknown): value is AbortErrorLike => {
    if (isError(value) || value instanceof DOMException) {
        return value.name === 'AbortError'
    }

    return false
}
