import { compile } from '@kruining/waterlogged';

await compile([ 'esm', 'cjs' ], {
    entryPoints: [ './src/index.ts' ],
    outbase: 'src',
    outdir: './lib/$format',
    bundle: true,
    sourcemap: true,
    minify: false,
    // platform: 'node',
    // inject: [ 'src/globals.ts' ],
    external: [ 'node:http2' ],
    target: [ 'esnext' ],
    watch: process.argv[2] === 'watch',
});

await compile([ 'esm', 'cjs' ], {
    entryPoints: [ './src/index.node.ts' ],
    outbase: 'src',
    outdir: './lib/$format',
    bundle: true,
    sourcemap: true,
    minify: false,
    platform: 'node',
    inject: [ 'src/globals.ts' ],
    target: [ 'esnext' ],
    watch: process.argv[2] === 'watch',
});