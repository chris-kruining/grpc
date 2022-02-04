import { build } from 'esbuild';

const options = {
    entryPoints: [ 'src/index.ts', 'src/index.node.ts' ],
    outdir: 'lib',
    outbase: 'src',
    bundle: true,
    sourcemap: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    inject: [ 'src/globals.ts' ],
    // external: [ 'node:stream/web', 'node:http2' ],
    target: [ 'esnext' ],
};

await build({
    ...options,
    outdir: 'lib/cjs',
    format: 'cjs',
});

await build({
    ...options,
    outdir: 'lib/esm',
    format: 'esm',
});