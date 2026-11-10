vite-plugin-license-csv
===

A Vite plugin that emits a CSV of the npm packages **actually bundled** into your build output.

```csv
name,version,license,url
react,18.3.1,MIT,https://reactjs.org/
redux,5.0.1,MIT,http://redux.js.org
M PLUS 2,,OFL-1.1,https://github.com/coz-m/MPLUS_FONTS
```

Use it when someone asks you for a list of the OSS in your deliverable, for example for an OSS management ledger.

## Why

Tools that list the dependency tree (`node_modules` or the lockfile) do not match what you distribute. They include dev tools, tree-shaken packages and optional peers.

This plugin reads the module IDs of the output chunks. This is the same source as Vite's [`build.license`](https://vite.dev/config/build-options#build-license). A package is in the CSV only when at least one of its modules is in the bundle.

`build.license` gives you the license texts. This plugin gives you the table.

## Install

```sh
npm install -D vite-plugin-license-csv
```

Requires Vite 8.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { licenseCsv } from 'vite-plugin-license-csv'

export default defineConfig({
  build: {
    license: true,
  },
  plugins: [
    licenseCsv({
      bom: true,
      extras: [
        {
          name: 'M PLUS 2',
          license: 'OFL-1.1',
          url: 'https://github.com/coz-m/MPLUS_FONTS',
        },
      ],
    }),
  ],
})
```

`vite build` then writes `licenses.csv` into `build.outDir`.

## Options

| Option     | Type           | Default          | Description                                                                                         |
| ---------- | -------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `fileName` | `string`       | `'licenses.csv'` | Output path relative to `build.outDir`.                                                             |
| `bom`      | `boolean`      | `false`          | Prepend a UTF-8 BOM. Set it when the file is opened in Excel and contains non-ASCII text.           |
| `extras`   | `LicenseRow[]` | `[]`             | Rows for works the bundle cannot tell about (fonts, images, audio). Appended after the npm packages. |

```ts
type LicenseRow = {
  name: string
  version?: string
  license: string
  url: string
}
```

## Output

- **Columns**: `name`, `version`, `license`, `url`.
- **Rows**: one row per `name@version`, sorted by that key. Two versions of one package give two rows.
- **Format**: RFC 4180, CRLF line endings.
- **`license`**: the `license` field of the package.json. Empty when the field is missing.
- **`url`**: the first one available of
    1. `homepage`
    2. `repository`, converted to an `https://` URL
    3. the npm page of that exact version

A module belongs to the nearest package.json that has both `name` and `version`. So a subpath package.json such as `firebase/app` is counted as `firebase`.

## Limitations

- `license` and `url` are what each package declares. The plugin does not verify them. Review the CSV before you hand it over.
- The plugin does not output license texts. Use `build.license` for them.
- Only npm packages are detected. Add other works with `extras`.

## Development

```sh
npm install
npm test        # vitest, oxlint, oxfmt, tsc
npm run build
```

## License

MIT
