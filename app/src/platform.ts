/**
 * Returns the root CSS class needed for the platform-specific window layout.
 * Tauri's webview user agent is the only platform signal already available to
 * this frontend; keeping the check pure makes the platform branches testable
 * without a DOM or an OS plugin dependency.
 */
export function platformClassForUserAgent(userAgent: string): string {
  if (/\b(?:macintosh|mac os x)\b/i.test(userAgent)) return "platform-macos";
  if (/\blinux\b/i.test(userAgent)) return "platform-linux";
  return "";
}

export type TerminalCopyShortcutEvent = Pick<
  KeyboardEvent,
  "type" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey"
>;

/**
 * Whether an event is the Linux terminal copy chord and there is text to copy.
 * Keeping this decision pure lets the platform gate and the keyboard shape be
 * tested without constructing a DOM KeyboardEvent in vitest.
 */
export function isLinuxTerminalCopyShortcut(
  userAgent: string,
  event: TerminalCopyShortcutEvent,
  hasSelection: boolean,
): boolean {
  return (
    hasSelection &&
    platformClassForUserAgent(userAgent) === "platform-linux" &&
    event.type === "keydown" &&
    event.code === "KeyC" &&
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  );
}

// Keep the xterm.js stacks in one place so TerminalPane cannot accidentally
// change the non-Linux fallback while adding a Linux-only font preference.
export const DEFAULT_TERMINAL_FONT_FAMILY = "Menlo, Monaco, 'Courier New', monospace";
export const LINUX_TERMINAL_FONT_FAMILY =
  "'Ubuntu Mono', 'DejaVu Sans Mono', Menlo, Monaco, 'Courier New', monospace";
