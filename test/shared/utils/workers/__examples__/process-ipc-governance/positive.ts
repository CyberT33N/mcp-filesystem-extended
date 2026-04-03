/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Area example: `test/shared/utils/workers/**` (dedicated test worker helper boundary).
 *
 * Expected:
 * - `enterprise-node/process-ipc-governance` SHOULD NOT report process IPC surfaces here.
 */

export const positiveTestWorkerHelperIpc = (): void => {
    void process.channel
    void process.connected
    process.on('message', () => {})
    process.on('disconnect', () => {})
    process.send?.({ type: 'test-helper-ready' })
    process.disconnect?.()
}
