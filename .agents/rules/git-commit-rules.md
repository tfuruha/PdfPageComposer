---
trigger: always_on
---

# Git Commit Rules (コミットメッセージ規約)

**Activation:** This rule is **ALWAYS ON** for all git-related operations.

## Scope

- **対象**: staged 変更（`git diff --cached`）のみ。unstaged・未追跡ファイルは無視。
- **適用範囲**: Git サイドバーの Generate ボタン、`/commit` `/commit-ja` ワークフロー、その他すべての git commit 関連操作。
- staged 変更がない場合、コミットメッセージの生成を行わず、ステージングを促すメッセージのみ返すこと。

## Format: Conventional Commits

コミットメッセージはプレフィックス（Type）を付与した形式を採用する。

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Type（常に英語）

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`

### Description（件名）

- 簡潔に変更意図が伝わる内容とする（目安として50文字程度）。
- 末尾にピリオド（`.`）は付けない。
- 言語はワークフローの指定に従う（`/commit` → 英語、`/commit-ja` → 日本語）。ワークフロー外は日本語または英語。

### Body（本文、任意）

- 変更の背景や影響を補足したい場合のみ記述（件名と本文の間に空行を入れる）。

## Guardrails（禁止事項）

- ❌ メタ解説・導入文・締めの言葉（コミットメッセージ本文のみを出力する）。
- ❌ 絵文字の使用。

## Principles（原則）

- **柔軟なコミット単位**: 機能追加に伴う型定義やUI調整など、一連の関連作業は無理に細切れにせず1つのコミットにまとめて良い。
- **破壊的変更**: `!` を type の後に付与する（例: `feat!:`, `fix!:`）。footer に `BREAKING CHANGE:` も記述可。
- **出力形式**: コミットメッセージ本文のみを直接出力する。思考プロセスや解説は一切含めない。
