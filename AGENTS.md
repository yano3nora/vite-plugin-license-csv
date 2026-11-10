# AGENTS - Development Guide

## Overview

- bundle に実際に入った npm package の一覧を CSV で出力する Vite plugin
- 仕様の正は README.md。出力の列・並び・URL の決め方は公開 API なので、変えるときは README とテストを同時に直す

## Rules

- 範囲は CSV の出力だけ。ライセンス本文の出力は Vite の `build.license` に任せ、ここへ足さない
- `dependencies` を足さない。`vite` は peer、他は Node 標準で書く
- 完了前に `npm run fix` → `npm test` を通す
- `src/index.test.ts` の `licenseCsv` は実際に `vite build` を走らせる。bundle から package を拾う処理を変えたらここで確かめる
- `npm publish` と tag の push は人間が行う。手順は README の Release
- semver を守る。変更履歴は GitHub Release が commit から自動で作るので、CHANGELOG は書かない
