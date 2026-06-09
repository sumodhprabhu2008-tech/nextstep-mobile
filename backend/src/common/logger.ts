export const logger = {
  info: (msg: string, ctx?: object) => console.log(`[INFO] ${msg}`, ctx ?? ''),
  warn: (msg: string, ctx?: object) => console.warn(`[WARN] ${msg}`, ctx ?? ''),
  error: (msg: string, ctx?: object) => console.error(`[ERROR] ${msg}`, ctx ?? ''),
}
