# Setup

This project runs `.ts` files directly via Node's native TypeScript
support, with no build step. That requires an official Node.js build —
distro-packaged builds (e.g. Ubuntu's `nodejs` apt package) are compiled
without the bundled TypeScript parser and will fail with
`ERR_NO_TYPESCRIPT` or `ERR_UNKNOWN_FILE_EXTENSION`. Use
[nvm](https://github.com/nvm-sh/nvm) to install an official build instead
of relying on the system Node.

Install nvm (skip if already installed):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Restart your terminal (or `source ~/.bashrc`) so `nvm` is on your `PATH`,
then install and switch to the latest LTS release:

```bash
nvm install --lts
nvm use --lts
```

Verify `node` now resolves to the nvm-managed build, not
`/usr/bin/node`:

```bash
which node
```

Then install dependencies:

```bash
npm install
```

Each new terminal session needs `nvm use --lts` (or `nvm use default`
after running `nvm alias default lts/*` once) before running `npm`
commands, since the system Node is still first on `PATH` by default.

See [toolchain.md](toolchain.md) for the full toolchain (tests, type
checking, playing in the browser, and simulations).
