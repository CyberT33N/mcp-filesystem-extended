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
import {
    isBigInt,
    isBoolean,
    isNullish,
    isNumber,
    isPlainObject,
    isString,
    isSymbol
} from 'remeda'

import { stringify } from 'safe-stable-stringify'

// ═══╡ 🗿 CONSTANTS ╞═══
const UNKNOWN_ERROR_MESSAGE = 'Unknown error' as const
const UNSERIALIZABLE_ERROR_MESSAGE = '[Unserializable error object]' as const

const safeStringify = stringify.configure({
    bigint: true,
    circularValue: '[Circular]',
    deterministic: true
})

/*
 *╭───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 *📦 EXPORTS ► Exports for: shared/errors
 *╰───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 */

/**
 * Convert an unknown error-like value into a human-readable message.
 *
 * @param value - The value to convert.
 * @returns A best-effort error message for logging or error wrapping.
 *
 * @internal
 */
export const toErrorMessage = (value: unknown): string => {
    if (isString(value)) {
        return value
    }

    if (isNullish(value)) {
        return UNKNOWN_ERROR_MESSAGE
    }

    if (isPlainObject(value)) {
        const serialized = safeStringify(value)

        if (isString(serialized)) {
            return serialized
        }

        return UNSERIALIZABLE_ERROR_MESSAGE
    }

    if (isSymbol(value)) {
        return value.description ?? UNKNOWN_ERROR_MESSAGE
    }

    if (isNumber(value) || isBoolean(value) || isBigInt(value)) {
        return String(value)
    }

    // functions, arrays, class instances and any other exotic types
    return UNKNOWN_ERROR_MESSAGE
}
