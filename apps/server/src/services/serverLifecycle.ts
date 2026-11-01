let shutdownCallback: (() => void) | null = null;

export function registerShutdownCallback(callback: () => void) {
  shutdownCallback = callback;
}

export function requestServerShutdown(): boolean {
  if (!shutdownCallback) return false;
  setTimeout(shutdownCallback, 150);
  return true;
}
