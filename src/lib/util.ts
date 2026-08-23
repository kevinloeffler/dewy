export function darkenColor(hex: number, amount: number = 0): number {
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;

    const darken = (channel: number) => Math.round(channel * (1 - amount));

    return (darken(r) << 16) | (darken(g) << 8) | darken(b);
}
