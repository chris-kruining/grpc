import { Message } from 'google-protobuf';
import { asyncIterableToStream, streamToAsyncIterable, MessageSerializerStream, MessageDeserializerStream } from './stream.js';

export interface MethodDefinition<RequestType, ResponseType, OutputRequestType=RequestType, OutputResponseType=ResponseType> {
    path: string;
    requestStream: boolean;
    responseStream: boolean;
}

export function methodDescriptor<RequestType, ResponseType>(conf: MethodDefinition<RequestType, ResponseType>): MethodDecorator
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
    signal: AbortSignal,
}>;

type Payload = ReadableStream<Uint8Array>|Uint8Array;

export interface Client {
    makeUnaryRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType>;

    makeClientStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType>;

    makeServerStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined>;

    makeBidiStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined>;
}

export class BaseClient implements Client
{
    readonly #address: string;
    #controller!: AbortController;

    constructor(address: string)
    {
        this.#address = address;
    }

    async makeUnaryRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType> {
        const response = await this.#fetch<RequestType, ResponseType>(
            path,
            request.serializeBinary(),
            {}
        );

        return Message.deserializeBinary(new Uint8Array(await response.arrayBuffer())) as ResponseType;
    }

    async makeClientStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<ResponseType> {
        const response = await this.#fetch<RequestType, ResponseType>(
            path,
            asyncIterableToStream(requests).pipeThrough(new MessageSerializerStream()),
            {}
        );

        return Message.deserializeBinary(new Uint8Array(await response.arrayBuffer())) as ResponseType;
    }

    async *makeServerStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        request: RequestType,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined> {
        yield Promise.resolve(undefined as unknown as ResponseType);
        const { body } = await this.#fetch<RequestType, ResponseType>(
            path,
            request.serializeBinary(),
            {}
        );

        yield* streamToAsyncIterable(body!.pipeThrough(new MessageDeserializerStream<ResponseType>()));
    }

    async *makeBidiStreamRequest<RequestType extends Message, ResponseType extends Message>(
        path: string,
        requests: AsyncIterable<RequestType>,
        metadata?: Metadata,
        options?: CallOptions,
    ): AsyncGenerator<ResponseType, void, undefined> {
        const { body } = await this.#fetch<RequestType, ResponseType>(
            path,
            asyncIterableToStream(requests).pipeThrough(new MessageSerializerStream()),
            {}
        );

        yield* streamToAsyncIterable(body!.pipeThrough(new MessageDeserializerStream<ResponseType>()));
    }

    async #fetch<RequestType extends Message, ResponseType extends Message>(
        path: string,
        payload: Payload,
        metadata?: Metadata,
        options?: CallOptions,
    ): Promise<Response>
    {
        this.#controller = new AbortController();

        const { signal, callbacks } = this.#processCallOptions(options ?? {});

        const headers = new Headers({
            'Content-Type': 'application/grpc',
        });

        const request = new Request(`${this.#address}${path}`, {
            method: 'POST',
            body: payload,
            headers,
            signal,
        });

        const response = await fetch(request);

        for(const callback of callbacks)
        {
            callback();
        }

        return response;
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