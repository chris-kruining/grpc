import { Message } from 'google-protobuf';

export function asyncIterableToStream<T>(iterable: AsyncIterable<T>, signal?: AbortSignal): ReadableStream<T>
{
    return new ReadableStream<T>({
        async start(controller: ReadableStreamDefaultController<T>)
        {
            const iterator = iterable[Symbol.asyncIterator]();

            try
            {
                while (!(
                    signal?.aborted ?? false
                ))
                {
                    const { done, value } = await iterator.next();

                    if (done)
                    {
                        break;
                    }

                    controller.enqueue(value);
                }
            }
            finally // Makes sure we release even in the case of an uncaught exception
            {
                controller.close();
            }
        }
    })
}

export async function *streamToAsyncIterable<T>(stream: ReadableStream<T>, signal?: AbortSignal): AsyncGenerator<T, void, undefined>
{
    const reader: ReadableStreamDefaultReader<T> = stream.getReader();

    try
    {
        while(!(signal?.aborted ?? false))
        {
            const { done, value } = await reader.read();

            if(done)
            {
                break;
            }

            yield value!;
        }
    }
    finally // Makes sure we release even in the case of an uncaught exception
    {
        reader.releaseLock();
    }
}

export class MessageSerializerStream<RequestType extends Message> extends TransformStream<RequestType, Uint8Array> implements GenericTransformStream
{
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<RequestType>;

    constructor()
    {
        super({
            transform(request: RequestType, controller: TransformStreamDefaultController<Uint8Array>)
            {
                controller.enqueue(request.serializeBinary());
            }
        });

        this.readable = new ReadableStream();
        this.writable = new WritableStream();
    }
}

export class MessageDeserializerStream<ResponseType extends Message> extends TransformStream<Uint8Array, ResponseType> implements GenericTransformStream
{
    readonly readable: ReadableStream<ResponseType>;
    readonly writable: WritableStream<Uint8Array>;

    constructor()
    {
        super({
            transform(message: Uint8Array, controller: TransformStreamDefaultController<ResponseType>)
            {
                controller.enqueue(Message.deserializeBinary(message) as ResponseType);
            }
        });

        this.readable = new ReadableStream();
        this.writable = new WritableStream();
    }
}