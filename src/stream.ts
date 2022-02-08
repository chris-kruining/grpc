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

export class PrefixerStream extends TransformStream<Uint8Array, Uint8Array> implements GenericTransformStream
{
    constructor()
    {
        super({
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
    }
}

export class DeprefixerStream extends TransformStream<Uint8Array, Uint8Array> implements GenericTransformStream
{
    readonly #messageDelimiterSize = 4; // How many bytes it takes to encode the message length
    readonly #headerSize = this.#messageDelimiterSize + 1; // Message length + compressed flag

    constructor()
    {
        super({
            transform: (bytes: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) => {
                const { compressed, length } = this.#readHeader(bytes);

                const message = bytes.slice(this.#headerSize);

                console.log(bytes, message, length, compressed)

                controller.enqueue(message);
            },
        });
    }

    #readHeader(bytes: Uint8Array): { compressed: boolean, length: number }
    {
        const buffer = bytes.slice(0, this.#headerSize).buffer;
        const view = new DataView(buffer);

        const compressed = view.getUint8(0);
        const length = view.getUint32(1, false);

        // Make sure the compression flag is valid
        if(compressed !== 0 && compressed !== 1)
        {
            throw new Error('Invalid compression flag')
        }

        return {
            compressed: Boolean(compressed),
            length,
        };
    }
}

export class MessageSerializerStream<RequestType extends Message> extends TransformStream<RequestType, Uint8Array> implements GenericTransformStream
{
    constructor()
    {
        super({
            transform(request: RequestType, controller: TransformStreamDefaultController<Uint8Array>)
            {
                controller.enqueue(request.serializeBinary());
            }
        });
    }
}

export class MessageDeserializerStream<ResponseType extends Message> extends TransformStream<Uint8Array, ResponseType> implements GenericTransformStream
{
    constructor(deserializer: (data: Uint8Array) => Message)
    {
        super({
            transform(message: Uint8Array, controller: TransformStreamDefaultController<ResponseType>)
            {
                controller.enqueue(deserializer(message) as ResponseType);
            }
        });
    }
}