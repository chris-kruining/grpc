import { ReadableStream as Rs, WritableStream as Ws, TransformStream as Ts } from 'node:stream/web';
import { asyncIterableToStream, streamToAsyncIterable, MessageSerializerStream, MessageDeserializerStream, } from '../src/stream.js';
global.ReadableStream = Rs;
global.WritableStream = Ws;
global.TransformStream = Ts;
describe('Stream', () => {
    const gen = async function* () {
        yield 'test';
    };
    const stream = new ReadableStream();
    const transform = new TransformStream();
    it('should convert async iterable to stream', () => {
        expect(asyncIterableToStream(gen())).toEqual(stream);
    });
    it('should convert stream to async iterable', () => {
        expect(streamToAsyncIterable(stream)).toEqual(gen());
    });
    it('should serialize messages', () => {
        const serializer = new MessageSerializerStream();
        expect(serializer).toBeInstanceOf(TransformStream);
    });
    it('should deserialize messages', () => {
        const deserializer = new MessageDeserializerStream();
        expect(deserializer).toBeInstanceOf(TransformStream);
    });
});
