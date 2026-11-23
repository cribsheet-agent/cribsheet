// Just enough ABI coding for the Pons factory: static words in and out.

export const word = (data: string, i: number): string => {
  const h = data.startsWith('0x') ? data.slice(2) : data;
  const w = h.slice(i * 64, i * 64 + 64);
  if (w.length !== 64) throw new Error(`word ${i} out of range`);
  return w;
};
export const asAddress = (w: string): string => '0x' + w.slice(24).toLowerCase();
export const asUint = (w: string): bigint => BigInt('0x' + w);
export const asBool = (w: string): boolean => asUint(w) !== 0n;
export const topicAddress = (topic: string): string => '0x' + topic.slice(-40).toLowerCase();
export const encodeAddress = (a: string): string => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
