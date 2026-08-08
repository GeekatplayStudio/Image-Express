/**
 * Queue job kinds for the vault indexing service.
 *
 * In contracts (not the server queue module) because the client needs them
 * too: the indexing bar filters the queue stream by kind, and importing the
 * server module would drag `getQueue` into the browser bundle.
 */
export const VAULT_EMBED_JOB_KIND = 'vault-embed';
export const VAULT_THUMBS_JOB_KIND = 'vault-thumbs';
