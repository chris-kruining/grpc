export interface Serialize<T> {
    (value: T): Uint8Array;
}

export interface Deserialize<T> {
    (bytes: Uint8Array): T;
}

export interface MethodDefinition<RequestType, ResponseType, OutputRequestType=RequestType, OutputResponseType=ResponseType> {
    path: string;
    requestStream: boolean;
    responseStream: boolean;
    requestSerialize: Serialize<RequestType>;
    responseSerialize: Serialize<ResponseType>;
    requestDeserialize: Deserialize<OutputRequestType>;
    responseDeserialize: Deserialize<OutputResponseType>;
    originalName?: string;
}

export interface ServiceDefinition {
    [index: string]: MethodDefinition<any, any>;
}

export function methodDescriptor<RequestType, ResponseType>(conf: Partial<MethodDefinition<RequestType, ResponseType>>): MethodDecorator
{
    return <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> | void => {};
}

export type Metadata = Partial<{
    /* Signal that the request is idempotent. Defaults to false */
    idempotentRequest: boolean;
    /* Signal that the call should not return UNAVAILABLE before it has started. Defaults to false. */
    waitForReady: boolean;
    /* Signal that the call is cacheable. GRPC is free to use GET verb. Defaults to false */
    cacheableRequest: boolean;
    /* Signal that the initial metadata should be corked. Defaults to false. */
    corked?: boolean;
}>;

export type CallOptions = Partial<{
    deadline: Date|number,
}>;

export class BaseClient
{
    #address: string;

    constructor(address: string)
    {
        this.#address = address;
    }

    async makeRequest<RequestType, ResponseType>(
        path: string,
        request: RequestType|AsyncIterable<RequestType>,
        metadata: Metadata = {},
        options: CallOptions = {},
    ): Promise<ResponseType|AsyncIterable<ResponseType>>
    {
        return Promise.resolve(`${this.#address}${path}` as unknown as ResponseType);
    }

    async makeUnaryRequest<RequestType, ResponseType>(
        path: string,
        request: RequestType,
        metadata: Metadata = {},
        options: CallOptions = {},
    ): Promise<ResponseType> {
        return Promise.resolve(undefined as unknown as ResponseType);
    }

    async makeClientStreamRequest<RequestType, ResponseType>(
        path: string,
        request: AsyncIterable<RequestType>,
        metadata: Metadata = {},
        options: CallOptions = {},
    ): Promise<ResponseType> {
        return Promise.resolve(undefined as unknown as ResponseType);
    }

    async *makeServerStreamRequest<RequestType, ResponseType>(
        path: string,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions
    ): AsyncGenerator<ResponseType, void, undefined> {
        yield Promise.resolve(undefined as unknown as ResponseType);
    }

    async *makeBidiStreamRequest<RequestType, ResponseType>(
        path: string,
        request: AsyncIterable<RequestType>,
        metadata?: Metadata | CallOptions,
        options?: CallOptions
    ): AsyncGenerator<ResponseType, void, undefined> {
        yield Promise.resolve(undefined as unknown as ResponseType);
    }
}