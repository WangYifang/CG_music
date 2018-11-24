// import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
// import json from 'rollup-plugin-json'

export default {
    input: 'script/fbxLoaderRaw.js',
    output: {
        format: 'iife',
        sourceMap: true,
        file: 'script/fbxLoader.js',
    },
    plugins: [
        // babel(),
        // json({
        //     // preferConst: true,
        //     // compact: true
        // }),
        nodeResolve({
            // use "jsnext:main" if possible
            // see https://github.com/rollup/rollup/wiki/jsnext:main
            // jsnext: true
            main: true,  // Default: true
        }),
        commonjs({
            include: 'node_modules/**'
        })
    ],
};