# Clear Maker 2C オンライン公開手順

ローカル試作が完了してから、この手順でGitHub Pagesへ公開します。試作中は `start-local.bat` で起動し、GitHubへのpushは行いません。

## 全体構成

- GitHub Pages: 生徒画面、CSS、JavaScript、英単語JSON、PWA
- Google Apps Script: Gemini採点の中継、端末別進捗の保存、教師用ダッシュボード
- Googleスプレッドシート: 最新状態の「英単語進捗」とカレンダー用の「英単語進捗履歴」

## 1. GASを更新する

1. Google Apps Scriptで現在の採点用プロジェクトを開く。
2. `backend_GAS_spreadsheet.gs` と `teacher_dashboard.gs` の内容をGASへ反映する。
3. GASにHTMLファイルを追加し、名前を `teacher_dashboard` として `teacher_dashboard.html` の内容を貼り付ける。
4. プロジェクトの設定→スクリプトプロパティに `TEACHER_DASHBOARD_CODE` を追加し、教師だけが知る確認コードを設定する。
5. 「デプロイ」→「デプロイを管理」→既存デプロイの編集を開く。
6. バージョンを「新バージョン」にしてデプロイする。
7. 実行ユーザーは自分、アクセスできるユーザーは利用環境に合わせて設定する。
8. WebアプリURLが `student.js` 冒頭の `GAS_API_URL` と一致することを確認する。

既存デプロイを更新すれば、通常はWebアプリURLを変更せずに利用できます。

## 2. GitHub Pagesで公開する

1. このフォルダをGitHubリポジトリの `main` ブランチへ登録する。
2. GitHubのリポジトリで Settings → Pages を開く。
3. Sourceを「GitHub Actions」に設定する。
4. `main` ブランチへpushするか、Actionsから `Deploy Clear Maker 2C to GitHub Pages` を手動実行する。
5. デプロイ完了後に表示されるHTTPSのURLを生徒へ案内する。

公開処理は `.github/workflows/deploy-pages.yml` が行います。公開されるのは次のファイルだけです。

- `index.html`
- `student.css`
- `student.js`
- `sw.js`
- `manifest.json`
- `.nojekyll`
- `vocabulary-question.json`
- `vocabulary-data.js`
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`

GASソース、README、退避ファイルは公開対象に含まれません。

## 3. 動作確認

1. 公開URLをスマートフォンで開く。
2. 画面上のバージョンが `v2.6.6` であることを確認する。
3. 「1,800語・9,000問」と表示されることを確認する（初回はGASから自動取得され、以降はバージョン変更時だけ自動再取得されます）。
4. 生徒情報を登録して20題を表示する。
5. テスト答案を撮影して採点できることを確認する。
6. 合格後、スプレッドシートの「英単語進捗」と「英単語進捗履歴」が更新されることを確認する。
7. GASのWebアプリURLをブラウザで直接開き、教師確認コードでダッシュボードへ入れることを確認する。

進捗はブラウザに保存された端末IDごとに区別されます。同じ端末・同じブラウザでは保存済みの到達位置を復元しますが、別端末の進捗とは統合しません。

## 4. 教師用ダッシュボード

GASのWebアプリURLをGETで開くと教師用ダッシュボードが表示されます。確認コードの入力後、次の内容を確認できます。

- 登録生徒数、登録端末数、本日の更新数、平均到達番号、マスター端末数
- 月ごとの進捗カレンダー
- 日付を選択した進捗更新一覧
- 生徒番号・氏名で検索できる現在の到達状況

ダッシュボードには答案画像や詳しい採点内容は表示しません。

カメラ機能はHTTPSの公開URLで利用してください。
