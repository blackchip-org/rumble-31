import fs from "node:fs";

// LineReader abstracts a blocking source of input lines, letting
// Human's decide() stay fully synchronous.
export interface LineReader {
  // readLine returns the next line (without its terminator), or
  // undefined once the source is exhausted.
  readLine(): string | undefined;
}

// arrayLineReader replays a fixed list of lines — the standard test
// double.
export function arrayLineReader(lines: readonly string[]): LineReader {
  let i = 0;
  return {
    readLine(): string | undefined {
      if (i >= lines.length) {
        return undefined;
      }
      return lines[i++];
    },
  };
}

// stdinLineReader synchronously reads lines from file descriptor 0. It
// blocks the event loop while waiting for input, which is exactly what
// an interactive single-player CLI wants: a human's turn behaves like
// any other synchronous Strategy, with no async infection of the game
// engine.
export function stdinLineReader(): LineReader {
  let buffer = "";
  let eof = false;
  const chunk = Buffer.alloc(4096);

  function fill(): void {
    if (eof) {
      return;
    }
    try {
      const bytesRead = fs.readSync(0, chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        eof = true;
      } else {
        buffer += chunk.toString("utf8", 0, bytesRead);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EOF" || code === "EAGAIN") {
        eof = true;
      } else {
        throw err;
      }
    }
  }

  return {
    readLine(): string | undefined {
      for (;;) {
        const idx = buffer.indexOf("\n");
        if (idx !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);
          return line;
        }
        if (eof) {
          if (buffer.length > 0) {
            const line = buffer;
            buffer = "";
            return line;
          }
          return undefined;
        }
        fill();
      }
    },
  };
}

// Writer abstracts a sink for output text.
export interface Writer {
  write(s: string): void;
}

// bufferWriter collects everything written to it, for tests.
export function bufferWriter(): Writer & { toString(): string } {
  let buf = "";
  return {
    write(s: string): void {
      buf += s;
    },
    toString(): string {
      return buf;
    },
  };
}

// streamWriter adapts a Node writable stream (e.g. process.stdout) to
// Writer.
export function streamWriter(stream: NodeJS.WritableStream): Writer {
  return {
    write(s: string): void {
      stream.write(s);
    },
  };
}

const sharedState = new Int32Array(new SharedArrayBuffer(4));

// realSleep blocks the event loop synchronously for ms milliseconds,
// via Atomics.wait — the standard technique for a true blocking sleep
// in Node.
function realSleep(ms: number): void {
  Atomics.wait(sharedState, 0, 0, ms);
}

// clock.sleep is called to pause for interactive pacing (dealing, bot
// thinking). Tests can override it to a no-op (or a recorder) and
// restore it afterward.
export const clock: { sleep: (ms: number) => void } = { sleep: realSleep };
