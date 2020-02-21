export function mapKeys(obj: any, cb: <T>(value: any, key: T) => T) {
  if (typeof obj !== 'object') {
    throw new Error(`${obj} is not an object`);
  }

  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [cb(v, k), v]));
}
