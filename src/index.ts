import { clientWithFetcher } from './client.js';

export { methodDescriptor, Metadata, CallOptions } from './client.js';

export const BaseClient = clientWithFetcher(fetch);