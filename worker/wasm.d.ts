// Wrangler's bundler treats a *.wasm import as a precompiled WebAssembly
// module, not raw bytes - this tells TypeScript the same thing.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
