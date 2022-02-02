import { clientWithFetcher } from './client.js';
import { fetch } from './fetch.js';

export { methodDescriptor } from './client.js';
export { fetch } from './fetch.js';

export const BaseClient = clientWithFetcher(fetch);