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

// Keep the xterm.js stacks in one place so TerminalPane cannot accidentally
// change the non-Linux fallback while adding a Linux-only font preference.
export const DEFAULT_TERMINAL_FONT_FAMILY = "Menlo, Monaco, 'Courier New', monospace";
export const LINUX_TERMINAL_FONT_FAMILY =
  "'Ubuntu Mono', 'DejaVu Sans Mono', Menlo, Monaco, 'Courier New', monospace";
