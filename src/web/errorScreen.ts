// The fatal error screen (specs/gui.md's Error Screen): shown in place
// of the game for any unhandled exception, unhandled promise rejection,
// or URL debug-param validation error.

// formatErrorDetail renders err as the text shown in the stack-trace
// area. For an Error, this is "name: message" followed by the stack's
// call frames — built explicitly rather than trusting err.stack to
// include the header line, since that's a V8 (Chrome/Node) convention:
// Firefox and Safari's stack is just the bare frame list, with no
// message at all. Non-Error throws fall back to their string form.
export function formatErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const header = `${err.name}: ${err.message}`;
  const stack = err.stack ?? "";
  if (stack === "") {
    return header;
  }
  return stack.startsWith(header) ? stack : `${header}\n${stack}`;
}

// mockError builds a placeholder Error for specs/params.md's
// screen=error debug param, so that screen can be reached without a
// real unhandled exception. Building a real Error (rather than a
// plain string) gives showErrorScreen/formatErrorDetail a genuine
// generated stack trace to display.
export function mockError(): Error {
  return new Error("Mock error (debug: screen=error)");
}

// showErrorScreen reveals #error-screen with err's detail. Safe to call
// more than once (e.g. a second error while the screen is already up)
// — it just overwrites the displayed detail.
export function showErrorScreen(err: unknown): void {
  console.error(err);

  const screen = document.getElementById("error-screen");
  const stackEl = document.getElementById("error-stack");
  if (!screen || !stackEl) {
    return;
  }
  stackEl.textContent = formatErrorDetail(err);
  screen.hidden = false;
}

// installGlobalErrorHandlers routes window's error/unhandledrejection
// events to showErrorScreen, so exceptions thrown outside main()'s own
// promise chain (e.g. from a DOM event listener) still surface the
// error screen instead of leaving the game silently frozen.
export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (e) => showErrorScreen(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => showErrorScreen(e.reason));
}
