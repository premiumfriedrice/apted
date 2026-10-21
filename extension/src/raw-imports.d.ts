// Ambient declarations for Vite-style ?raw imports (vitest resolves these at
// runtime; this gives tsc the shape).
declare module "*?raw" {
  const content: string;
  export default content;
}
