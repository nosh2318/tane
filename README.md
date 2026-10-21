# たね

業界 × 自分の持ち物 × 相手 × AI を、めくって（スワイプ）集めて、深掘りして、タスクにして進めるWebアプリ。

- 画面：`public/`（GitHub Pages でそのまま公開。スマホのホーム画面に追加できる）
- 保存とAI：Supabase（匿名ログイン＋メールで引き継ぎ、`user_state` 表、`ai` サーバー関数）
- AI：`supabase/functions/ai` が Claude（`claude-opus-5-5`）を呼ぶ。1人1日 `AI_DAILY_LIMIT` 回（既定60）まで

## 作り直し
`src/app.tpl.html`（画面）と `src/data.json`（事例284件）から `public/index.html` を作る。

    python3 tools/build.py

事例を増やしたら `tools/tag.py` でタグを付け直してから build する。

## 初回の準備
1. Supabase：`supabase/migrations/001_init.sql` を流す。Auth で Anonymous sign-ins を有効にし、Site URL / Redirect URLs に公開URLを入れる
2. 関数：`supabase functions deploy ai`。secrets に `ANTHROPIC_API_KEY`（必須）、`ALLOW_ORIGIN`（公開URL）、`AI_DAILY_LIMIT`（任意）
3. `public/config.js` に Supabase の URL と anon key（公開してよい鍵）を書く
4. GitHub の Settings → Pages で Source を「GitHub Actions」にする

`config.js` が空なら、アプリは端末の中だけで動く（AIのボタンは出ない）。
