import { isValidCode } from './validation';

// The guest's verified reservation code, kept for the current browser tab so
// they can move between the table portal and the guestbook / photo pages
// without rescanning the table QR code.
const KEY = 'bsp.tableScanCode';

export const readTableScanCode = (): string => {
  try {
    const value = sessionStorage.getItem(KEY) ?? '';
    return isValidCode(value) ? value : '';
  } catch {
    return '';
  }
};

export const saveTableScanCode = (code: string): void => {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    // Storage can be blocked (private mode); the guest just re-enters the code.
  }
};

export const clearTableScanCode = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
};

/** Path of the table portal menu (guestbook / photos choice), keeping the table. */
export const scanMenuPath = (tableId?: string): string =>
  tableId ? `/scan?table=${encodeURIComponent(tableId)}` : '/scan';
