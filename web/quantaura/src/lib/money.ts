// Symbol-first for the currencies we actually price in; anything else falls
// back to "CODE 1,234" so an admin switching currency in the settings panel
// never renders under the wrong symbol.
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', PKR: 'Rs ' };

export function money(amount: number, currency: string): string {
    const symbol = CURRENCY_SYMBOL[currency];
    return symbol ? `${symbol}${amount.toLocaleString()}` : `${currency} ${amount.toLocaleString()}`;
}
