// import {
//     asyncIterableToStream,
//     streamToAsyncIterable,
//     MessageSerializerStream,
//     MessageDeserializerStream,
// } from '../src/stream.js';

describe('Stream', () => {
    // const gen = async function *(): AsyncGenerator<string, void, undefined>
    // {
    //     yield 'test';
    // }
    // const stream: ReadableStream<string> = new ReadableStream<string>();
    // const transform = new TransformStream();

    it('should convert async iterable to stream', () => {
        // expect(asyncIterableToStream(gen())).toEqual(stream);
    });

    it('should convert stream to async iterable', () => {
        // expect(streamToAsyncIterable(stream)).toEqual(gen());
    });

    it('should serialize messages', () => {
        // const serializer = new MessageSerializerStream();
        // expect(serializer).toBeInstanceOf(TransformStream);
    });

    it('should deserialize messages', () => {
        // const deserializer = new MessageDeserializerStream();
        // expect(deserializer).toBeInstanceOf(TransformStream);
    });
});