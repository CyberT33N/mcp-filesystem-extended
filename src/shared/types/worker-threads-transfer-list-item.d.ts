/**
 * Temporary compatibility augmentation for thread-stream@4.2.0.
 *
 * thread-stream's declaration surface references `worker_threads.TransferListItem`,
 * an alias that @types/node 26 removed. Until thread-stream ships a fixed release,
 * this augmentation re-declares the alias with its real transferable union so the
 * strict `skipLibCheck: false` typecheck lane stays green without patching the
 * dependency itself.
 *
 * Removal trigger: delete this file once thread-stream declares compatibility
 * with @types/node 26 or stops referencing the removed alias.
 */
import type { X509Certificate } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import type { MessagePort } from "node:worker_threads";

declare module "worker_threads" {
  export type TransferListItem = ArrayBuffer | MessagePort | FileHandle | X509Certificate | Blob;
}
