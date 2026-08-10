export const createXoshiro128 = (seed: number) => {
  let x = seed >>> 0;
  const split = () => { x = (x + 0x9e3779b9) >>> 0; let z = x; z = Math.imul(z ^ (z >>> 16), 0x21f0aaad); z = Math.imul(z ^ (z >>> 15), 0x735a2d97); return (z ^ (z >>> 15)) >>> 0; };
  const state = [split(), split(), split(), split()];
  const rotate = (value: number, bits: number) => ((value << bits) | (value >>> (32 - bits))) >>> 0;
  return () => {
    const result = Math.imul(rotate(Math.imul(state[1], 5), 7), 9) >>> 0;
    const t = state[1] << 9;
    state[2] ^= state[0]; state[3] ^= state[1]; state[1] ^= state[2]; state[0] ^= state[3]; state[2] ^= t; state[3] = rotate(state[3], 11);
    return (result + 0.5) / 4294967296;
  };
};

export const createNormal = (uniform: () => number) => {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) { const value = spare; spare = undefined; return value; }
    const radius = Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, uniform())));
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
};
