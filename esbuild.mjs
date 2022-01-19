import { build } from 'esbuild';

await build({
    entryPoints: [ 'src/index.ts' ],
    outdir: 'lib',
    outbase: 'src',
    bundle: true,
    sourcemap: true,
    minify: true,
    format: 'cjs',
    target: [ 'esnext' ],
});