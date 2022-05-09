import { Message } from 'google-protobuf';
import { asyncIterableToStream, streamToAsyncIterable, EncoderStream, DecoderStream, MessageSerializerStream, MessageDeserializerStream } from './stream.js';

export interface MethodDefinition<RequestType, ResponseType, OutputRequestType=RequestType, OutputResponseType=ResponseType> {
    path: string;
    requestStream: boolean;
    responseStream: boolean;
}

export function methodDescriptor<RequestType, ResponseType>(conf: MethodDefinition<RequestType, ResponseType>): MethodDecorator
{
    return <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> | void => {

    };
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
}>|{
    [key: string]: string,
};

export type CallOptions = Partial<{
    deadline: Date|number,
    signal: AbortSignal,
}>;

export type Payload = ReadableStream<Uint8Array>|Uint8Array;
export type MessageConstructor<M extends Message> = { new(): M }&typeof Message;
export type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export interface Client
{
    makeUnaryRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType>;

    makeClientStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType>;

    makeServerStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined>;

    makeBidiStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined>;
}

export interface ClientConstructor
{
    new(address: string): Client
    readonly prototype: Client;
}

export abstract class AbstractClient
{
    readonly #address: string;
    readonly #fetcher: Fetcher;
    #controller!: AbortController;

    protected constructor(address: string, fetcher: Fetcher = fetch)
    {
        this.#address = address;
        this.#fetcher = fetcher;
    }

    async makeUnaryRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType> {
        const response = await this.#fetch<RequestType, ResponseType>(
            path,
            request.serializeBinary?.() ?? new Uint8Array(),
            metadata,
            options,
        );
        const message = responseType.deserializeBinary(new Uint8Array(await response.arrayBuffer())) as ResponseType;

        injectMetadata(message, { headers: response.headers });

        return message;
    }

    async makeClientStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType> {
        const response = await this.#fetch<RequestType, ResponseType>(
            path,
            asyncIterableToStream(requests).pipeThrough(new MessageSerializerStream()),
            metadata,
            options,
        );
        const message = responseType.deserializeBinary(new Uint8Array(await response.arrayBuffer())) as ResponseType;

        injectMetadata(message, { headers: response.headers });

        return message;
    }

    async *makeServerStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined> {
        const { body, headers } = await this.#fetch<RequestType, ResponseType>(
            path,
            request.serializeBinary(),
            metadata,
            options,
        );
        const messages = streamToAsyncIterable(
            body!.pipeThrough(new MessageDeserializerStream<ResponseType>(responseType.deserializeBinary))
        );

        for await (const message of messages)
        {
            injectMetadata(message, { headers });

            yield message;
        }
    }

    async *makeBidiStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined> {
        const { body, headers } = await this.#fetch<RequestType, ResponseType>(
            path,
            asyncIterableToStream(requests).pipeThrough(new MessageSerializerStream()),
            metadata,
            options,
        );
        const messages = streamToAsyncIterable(
            body!.pipeThrough(new MessageDeserializerStream<ResponseType>(responseType.deserializeBinary))
        );

        for await (const message of messages)
        {
            injectMetadata(message, { headers });

            yield message;
        }
    }

    async #fetch<RequestType extends Message, ResponseType extends Message>(
        path: string,
        payload: Payload,
        metadata: Metadata = {},
        options: CallOptions = {},
    ): Promise<Response>
    {
        this.#controller = new AbortController();

        const { signal, callbacks } = this.#processCallOptions(options);

        let response;
        try
        {
            response = await this.#fetcher(`${this.#address}${path}`, {
                method: 'POST',
                body: this.#normalizePayload(payload).pipeThrough(new EncoderStream()),
                headers: {
                    'Content-Type': 'application/grpc',
                },
                signal,
            });
        }
        catch (e)
        {
            console.error(e);

            throw new Error(`Network failed: '${(e as Error).message}'`)
        }

        for(const callback of callbacks)
        {
            callback();
        }

        return new Response(response.body!.pipeThrough(new DecoderStream()), response);
    }

    #normalizePayload(payload: Payload): ReadableStream<Uint8Array>
    {
        if(payload instanceof ReadableStream)
        {
            return payload;
        }

        return new ReadableStream<Uint8Array>({
            start(controller: ReadableStreamDefaultController<Uint8Array>)
            {
                controller.enqueue(payload);
                controller.close();
            },
        });
    }

    #processCallOptions(options: CallOptions): { callbacks: Function[] }&Pick<RequestInit, 'signal'>
    {
        let { deadline, signal } = options;
        const callbacks = [];

        signal ??= this.#controller.signal;

        if(deadline)
        {
            if(deadline instanceof Date)
            {
                const now = new Date().getTime()
                deadline = Math.max(Math.ceil(deadline.getTime() - now), 0);
            }

            const handle = setTimeout(() => {}, deadline);

            callbacks.push(() => clearTimeout(handle));
        }

        return {
            signal,
            callbacks,
        };
    }
}

export function clientWithFetcher(fetch: Fetcher): ClientConstructor
{
    return class BaseClient extends AbstractClient
    {
        constructor(address: string)
        {
            super(address, fetch);
        }
    }
}

function injectMetadata(message: Message, metadata: Record<string, any>): void
{
    for(const [ key, value ] of Object.entries(metadata))
    {
        Object.defineProperty(message, `__${key}__`, {
            value,
            writable: false,
            enumerable: false,
        })
    }
}