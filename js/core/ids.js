export function newId(prefix="id"){if(globalThis.crypto?.randomUUID)return `${prefix}_${crypto.randomUUID()}`;return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`}
