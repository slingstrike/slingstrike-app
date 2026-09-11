declare module 'js-yaml' {
  export function dump(obj: unknown, options?: { lineWidth?: number; noRefs?: boolean }): string
  export function load(str: string): unknown
}
