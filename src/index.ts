import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

export type LicenseRow = {
  name: string
  version?: string
  /** SPDX identifier */
  license: string
  url: string
}

export type LicenseCsvOptions = {
  /**
   * Output path relative to `build.outDir`.
   * @default 'licenses.csv'
   */
  fileName?: string
  /**
   * Prepend a UTF-8 BOM. Excel reads a UTF-8 CSV without a BOM in the legacy
   * system encoding (e.g. Shift_JIS), which garbles non-ASCII text.
   * @default false
   */
  bom?: boolean
  /**
   * Rows for works the bundle cannot tell about (fonts, images, audio, ...).
   * They are appended after the npm packages, in the given order.
   */
  extras?: LicenseRow[]
}

type PackageJson = {
  name?: string
  version?: string
  license?: string
  homepage?: string
  repository?: string | { url?: string }
}

const HEADER = ['name', 'version', 'license', 'url']

/** RFC 4180 */
const escapeCsv = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

export const toCsv = (rows: LicenseRow[], bom = false) =>
  (bom ? '﻿' : '') +
  [
    HEADER,
    ...rows.map((row) => [row.name, row.version ?? '', row.license, row.url]),
  ]
    .map((cells) => cells.map(escapeCsv).join(','))
    .join('\r\n') +
  '\r\n'

const httpUrl = (url: string | undefined) =>
  url && /^https?:\/\//.test(url) ? url : undefined

/** Only git URL notations are converted. Shorthands like `github:x/a` are not. */
const repositoryUrl = (repository: PackageJson['repository']) =>
  httpUrl(
    (typeof repository === 'string' ? repository : repository?.url)
      ?.replace(/^git\+/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/^git@([^:/]+):/, 'https://$1/')
      .replace(/\.git$/, ''),
  )

/** `homepage`, else `repository`, else the npm page of that exact version */
export const resolveUrl = (pkg: PackageJson) =>
  httpUrl(pkg.homepage) ??
  repositoryUrl(pkg.repository) ??
  `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`

/**
 * Walks up to the nearest package.json that has both `name` and `version`.
 * A subpath package.json such as `some-pkg/sub` has a name but no version and
 * no license, so it must resolve to the published package that contains it.
 */
const findPackage = (moduleId: string, cache: Map<string, PackageJson>) => {
  for (
    let dir = dirname(moduleId);
    dir.includes('node_modules');
    dir = dirname(dir)
  ) {
    const cached = cache.get(dir)
    if (cached) return cached
    const file = join(dir, 'package.json')
    if (!existsSync(file)) continue
    const pkg: PackageJson = JSON.parse(readFileSync(file, 'utf-8'))
    if (pkg.name && pkg.version) {
      cache.set(dir, pkg)
      return pkg
    }
  }
}

/**
 * Emits a CSV (name, version, license, url) of the npm packages whose modules
 * are actually in the bundle. The source is the same as Vite's `build.license`,
 * not the dependency tree, so the rows match what is distributed.
 *
 * `license` and `url` are what each package.json declares. This plugin does not
 * verify them.
 */
export const licenseCsv = ({
  fileName = 'licenses.csv',
  bom = false,
  extras = [],
}: LicenseCsvOptions = {}): Plugin => ({
  name: 'license-csv',
  generateBundle(_, bundle) {
    const cache = new Map<string, PackageJson>()
    const rows = new Map<string, LicenseRow>()
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue
      for (const moduleId of output.moduleIds) {
        if (moduleId.startsWith('\0') || !moduleId.includes('node_modules')) {
          continue
        }
        const pkg = findPackage(moduleId, cache)
        if (!pkg?.name || !pkg.version) continue
        rows.set(`${pkg.name}@${pkg.version}`, {
          name: pkg.name,
          version: pkg.version,
          license: pkg.license?.trim() ?? '',
          url: resolveUrl(pkg),
        })
      }
    }
    const sorted = [...rows.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, row]) => row)
    this.emitFile({
      type: 'asset',
      fileName,
      source: toCsv([...sorted, ...extras], bom),
    })
  },
})
