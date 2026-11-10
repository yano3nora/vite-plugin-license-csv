import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { licenseCsv, resolveUrl, toCsv } from './index'

describe('toCsv', () => {
  it('ヘッダと行を CRLF で出力する', () => {
    expect(
      toCsv([
        { name: 'a', version: '1.0.0', license: 'MIT', url: 'https://a' },
      ]),
    ).toBe('name,version,license,url\r\na,1.0.0,MIT,https://a\r\n')
  })

  it('カンマ・引用符・改行を含む値を引用符で囲む', () => {
    expect(
      toCsv([{ name: 'a,"b"', license: 'MIT\nISC', url: 'https://a' }]),
    ).toBe('name,version,license,url\r\n"a,""b""",,"MIT\nISC",https://a\r\n')
  })

  it('bom を指定すると先頭に BOM を付ける', () => {
    expect(toCsv([], true)).toBe('﻿name,version,license,url\r\n')
  })
})

describe('resolveUrl', () => {
  const pkg = { name: '@scope/a', version: '1.2.3' }

  it('homepage を優先する', () => {
    expect(
      resolveUrl({
        ...pkg,
        homepage: 'https://a.example',
        repository: 'https://github.com/x/a',
      }),
    ).toBe('https://a.example')
  })

  it('homepage が無ければ repository を https の URL に直して使う', () => {
    expect(
      resolveUrl({
        ...pkg,
        repository: { url: 'git+https://github.com/x/a.git' },
      }),
    ).toBe('https://github.com/x/a')
    expect(resolveUrl({ ...pkg, repository: 'git://github.com/x/a.git' })).toBe(
      'https://github.com/x/a',
    )
  })

  it('scp 形式の repository も https の URL に直す', () => {
    expect(resolveUrl({ ...pkg, repository: 'git@github.com:x/a.git' })).toBe(
      'https://github.com/x/a',
    )
  })

  it('URL に直せなければ npm の配布ページにする', () => {
    const npm = 'https://www.npmjs.com/package/@scope/a/v/1.2.3'
    expect(resolveUrl(pkg)).toBe(npm)
    expect(resolveUrl({ ...pkg, repository: 'github:x/a' })).toBe(npm)
    expect(resolveUrl({ ...pkg, homepage: 'a.example' })).toBe(npm)
    expect(resolveUrl({ ...pkg, homepage: '' })).toBe(npm)
  })
})

describe('licenseCsv', () => {
  const root = mkdtempSync(join(tmpdir(), 'license-csv-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const write = (path: string, content: unknown) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      typeof content === 'string' ? content : JSON.stringify(content),
    )
  }

  it('bundle に入った package だけを、公開 package の単位で出力する', async () => {
    write('entry.js', "import 'used/sub'\n")
    write('node_modules/used/package.json', {
      name: 'used',
      version: '1.0.0',
      license: 'MIT',
      homepage: 'https://used.example',
    })
    write('node_modules/used/index.js', 'console.log(1)\n')
    // subpath 用の package.json は version を持たない。used の行に含める
    write('node_modules/used/sub/package.json', {
      name: 'used/sub',
      main: 'index.js',
    })
    write('node_modules/used/sub/index.js', 'console.log(2)\n')
    write('node_modules/unused/package.json', {
      name: 'unused',
      version: '2.0.0',
      license: 'ISC',
    })
    write('node_modules/unused/index.js', 'console.log(3)\n')

    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        lib: { entry: join(root, 'entry.js'), formats: ['es'] },
      },
      plugins: [
        licenseCsv({
          extras: [{ name: 'Font', license: 'OFL-1.1', url: 'https://font' }],
        }),
      ],
    })

    const outputs = [result]
      .flat()
      .flatMap((r) => ('output' in r ? r.output : []))
    const csv = outputs.find((o) => o.fileName === 'licenses.csv')
    expect(csv?.type === 'asset' && csv.source).toBe(
      'name,version,license,url\r\n' +
        'used,1.0.0,MIT,https://used.example\r\n' +
        'Font,,OFL-1.1,https://font\r\n',
    )
  })
})
