/**
 * Release flow の薄い wrapper (synqux scripts/release.mjs の縮小版)。
 *
 * 配布の本体は `npm publish`。GitHub Release は `gh release create --generate-notes` で作る。
 * この script が集約するのは、version の bump、test/build、tag と version の整合チェック、
 * 人間による publish ゲート。変更履歴は GitHub Release に残す (CHANGELOG.md は持たない)。
 *
 * Flow:
 *   1. prepare : bump + test/build (publish なしの検証)
 *   2. 人間    : version bump を commit し、`git tag v<version>` を打つ
 *   3. publish : 整合チェック → push → `npm publish` → `gh release create`
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PROJECT_NAME = 'vite-plugin-license-csv'
const PUBLISH_FLAG = '--i-understand-this-pushes-and-publishes'

const usage = () =>
  `Usage:
  node scripts/release.mjs prepare <version>
  node scripts/release.mjs publish <version> ${PUBLISH_FLAG}

Examples:
  mise run release:prepare -- 0.3.0
  mise run release:publish -- 0.3.0 ${PUBLISH_FLAG}`

function parseArgs() {
  const [command, version, ...rest] = process.argv.slice(2)

  if (command !== 'prepare' && command !== 'publish') {
    throw new Error(`Unknown command.\n\n${usage()}`)
  }
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Release version must be semver-like, for example 0.3.0.\n\n${usage()}`,
    )
  }

  return { command, version, publishAllowed: rest.includes(PUBLISH_FLAG) }
}

/**
 * @param {object} [options]
 * @param {boolean} [options.stream] 出力を端末へ直接流す (戻り値は空文字)。長時間コマンド用
 * @param {boolean} [options.quiet]  コマンドと stdout を表示しない
 */
function run(command, args, options = {}) {
  if (!options.quiet) {
    console.log(`$ ${[command, ...args].join(' ')}`)
  }

  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf-8',
      stdio: options.stream ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    })

    if (!options.stream && !options.quiet && stdout?.trim()) {
      console.log(stdout.trimEnd())
    }
    return options.stream ? '' : (stdout ?? '')
  } catch (error) {
    if (!options.stream && error.stderr?.trim()) {
      console.error(error.stderr.trimEnd())
    }
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

const readPkgVersion = () =>
  JSON.parse(readFileSync('package.json', 'utf-8')).version

// tag と package.json の食い違いを publish 前に止める
function assertVersionMatch(version) {
  const inPkg = readPkgVersion()

  if (inPkg !== version) {
    throw new Error(
      `Version mismatch: expected ${version}, but package.json=${inPkg}. ` +
        `Run release:prepare first.`,
    )
  }
}

function assertCleanTree() {
  if (run('git', ['status', '--porcelain'], { quiet: true }).trim() !== '') {
    throw new Error(
      'Working tree must be clean before publishing. Commit the version bump first.',
    )
  }
}

// GitHub Release は tag 済みコミットから作る。tag が HEAD を指すことを保証する
function assertTagAtHead(tag) {
  let tagCommit
  try {
    tagCommit = run('git', ['rev-parse', '--verify', `${tag}^{commit}`], {
      quiet: true,
    }).trim()
  } catch {
    throw new Error(
      `Tag ${tag} does not exist. Create it yourself: git tag ${tag}`,
    )
  }

  const head = run('git', ['rev-parse', 'HEAD'], { quiet: true }).trim()
  if (tagCommit !== head) {
    throw new Error(
      `Tag ${tag} does not point at HEAD. Move the tag to the release commit.`,
    )
  }
}

function prepare(version) {
  // --no-git-tag-version: commit/tag と clean-tree チェックを行わずファイルだけ更新する
  run('npm', [
    'version',
    version,
    '--no-git-tag-version',
    '--allow-same-version',
  ])
  assertVersionMatch(version)

  // publish の prepublishOnly (test → build) をここで先取りして全部失敗させておく
  run('npm', ['test'], { stream: true })
  run('npm', ['run', 'build'], { stream: true })

  console.log(
    `\nPrepared v${version}. Review the diff, commit the bump, ` +
      `tag it (git tag v${version}), then run release:publish.`,
  )
}

function publish(version, publishAllowed) {
  if (!publishAllowed) {
    throw new Error(`Refusing to push and publish without ${PUBLISH_FLAG}.`)
  }

  const tag = `v${version}`

  assertVersionMatch(version)
  assertCleanTree()
  assertTagAtHead(tag)

  // push 前に gh の認証だけ確かめて
  // 「npm publish 済みなのに Release だけ作れない」中途半端を避ける
  run('gh', ['auth', 'status'], { quiet: true })

  // 先に remote を tag まで揃える。--atomic で branch だけ進んで tag が落ちる状態を防ぐ。
  // その後 npm publish で prepublishOnly (test/build) が最終ゲートとして走る
  run('git', ['push', '--atomic', 'origin', 'HEAD', tag])
  run('npm', ['publish', '--access', 'public'], { stream: true })

  // GitHub Release へ添付する tarball を作る (古いものが混ざらないよう掃除してから pack)
  const tarball = `${PROJECT_NAME}-${version}.tgz`
  run('rm', ['-f', tarball])
  run('npm', ['pack'], { stream: true })
  run('gh', ['release', 'create', tag, tarball, '--generate-notes'], {
    stream: true,
  })

  console.log(`\nPublished ${tag} to npm and created the GitHub Release.`)
}

try {
  const { command, version, publishAllowed } = parseArgs()
  if (command === 'prepare') {
    prepare(version)
  } else {
    publish(version, publishAllowed)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
