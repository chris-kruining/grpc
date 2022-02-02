import { Message } from 'google-protobuf';
import { asyncIterableToStream, streamToAsyncIterable, MessageSerializerStream, MessageDeserializerStream } from './stream.js';

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

const prefixer = new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>)
    {
        const out = new ArrayBuffer(5 + bytes.length);
        const view = new DataView(out);
        // Set compressed flag
        view.setUint8(0, +false);
        // Set message byte length (encoded in big endian)
        view.setUint32(0, bytes.length, false);

        controller.enqueue(new Uint8Array(out));
    },
});

const prefixCutter = new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>)
    {
        controller.enqueue(bytes.slice(3));
    },
});

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

        return responseType.deserializeBinary(new Uint8Array(await response.arrayBuffer())) as ResponseType;
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

        return responseType.deserializeBinary(new Uint8Array(await response.arrayBuffer())) as ResponseType;
    }

    async *makeServerStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined> {
        yield Promise.resolve(undefined as unknown as ResponseType);
        const { body } = await this.#fetch<RequestType, ResponseType>(
            path,
            request.serializeBinary(),
            metadata,
            options,
        );

        yield* streamToAsyncIterable(body!.pipeThrough(new MessageDeserializerStream<ResponseType>(responseType.deserializeBinary)));
    }

    async *makeBidiStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requestType: MessageConstructor<RequestType>,
        responseType: MessageConstructor<ResponseType>,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined> {
        const { body } = await this.#fetch<RequestType, ResponseType>(
            path,
            asyncIterableToStream(requests).pipeThrough(new MessageSerializerStream()),
            metadata,
            options,
        );

        yield* streamToAsyncIterable(body!.pipeThrough(new MessageDeserializerStream<ResponseType>(responseType.deserializeBinary)));
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

        const response = await this.#fetcher(`${this.#address}${path}`, {
            method: 'POST',
            body: this.#normalizePayload(payload).pipeThrough(prefixer),
            headers: {
                'Content-Type': 'application/grpc',
            },
            signal,
        });

        for(const callback of callbacks)
        {
            callback();
        }

        return new Response(response.body!.pipeThrough(prefixCutter), response);
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