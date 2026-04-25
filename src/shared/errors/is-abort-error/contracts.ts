/*
 *▄▄▄·▄▄▄  ▪   ▌ ▐· ▄▄▄· ·▄▄▄▄  ▄▄▄ . ▐ ▄ ▄▄▄▄▄
 *▐█ ▄█▀▄ █·██ ▪█·█▌▐█ ▀█ ██▪ ██ ▀▄.▀·•█▌▐█•██
 *██▀·▐▀▀▄ ▐█·▐█▐█•▄█▀▀█ ▐█· ▐█▌▐▀▀▪▄▐█▐▐▌ ▐█.▪
 *▐█▪·•▐█•█▌▐█▌ ███ ▐█ ▪▐▌██. ██ ▐█▄▄▌██▐█▌ ▐█▌·
 *.▀   .▀  ▀▀▀▀. ▀   ▀  ▀ ▀▀▀▀▀•  ▀▀▀ ▀▀ █▪ ▀▀▀
 * © privadent GmbH. All rights reserved.
 * Unauthorized copying, distribution, or modification of this software is strictly prohibited.
 */

/*
 *╭───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 *📦 EXPORTS ► Exports for: shared/errors/is-abort-error/contracts
 *╰───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
 */

/**
 * The type of abort error.
 */
export type AbortErrorLike = | DOMException & {
    name: 'AbortError'
}
| Error & {
    name: 'AbortError'
}
