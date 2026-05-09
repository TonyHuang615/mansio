export type SendFn = (data: string) => void;

export function createShiftEnterHandler(send: SendFn) {
  return (event: KeyboardEvent): boolean => {
    if (event.type !== 'keydown') return true;
    if (event.key !== 'Enter') return true;
    if (!event.shiftKey) return true;
    if (event.ctrlKey || event.altKey || event.metaKey) return true;

    try {
      send('\n');
    } catch {
      // WebSocket may have closed; swallow to avoid breaking xterm input pipeline.
    }
    return false;
  };
}
