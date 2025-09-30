# セットアップ手順（管理者向け）

このドキュメントは、Slack・Google 側で管理者が設定すべき内容をまとめたものです。作業は大きく分けて以下の 3 セクションです。

1. Slack App の構築と設定
2. Google API（Drive / Sheets）の準備
3. .env などランタイム設定の投入

---

## 1. Slack App の構築

1. **アプリ作成**
   - https://api.slack.com/apps から「Create New App」→「From scratch」を選択し、ワークスペースを `tatekae` の運用環境に指定。
   - App Name は任意（例: `Tatekae Seisan Bot`).
2. **Socket Mode 有効化**
   - *Basic Information > App-Level Tokens* から App-Level Token を発行（少なくとも `connections:write` 権限）。
   - `.env` の `SLACK_APP_TOKEN` に保存。
3. **OAuth & Permissions**
   - *Bot Token Scopes* に以下を追加:
     - `app_mentions:read`
     - `channels:history`
     - `channels:read`
     - `chat:write`
     - `chat:write.public`
     - `commands`
     - `files:read`
     - `files:write`
     - `groups:history` （プライベートチャンネル運用時）
     - `im:history`
     - `im:write`
     - `reactions:read`
     - `reactions:write`
     - `users:read`
   - 権限追加後、「Install to Workspace」で Bot Token (`SLACK_BOT_TOKEN`) を取得。
   - 補足: Socket Mode のみで運用する本リポジトリでは Signing Secret は不要です（HTTP エンドポイントを使う場合のみ使用）。
4. **Event Subscriptions**
   - *Event Subscriptions* を ON。Request URL は Socket Mode の場合ダミーで可（空でも可）。
   - *Subscribe to bot events* に以下を追加:
     - `message.channels`
     - `message.groups`
     - `message.im`
     - `reaction_added`
5. **Interactivity & Shortcuts**
   - Interactivity を ON。
   - *Shortcuts* にグローバルショートカットを追加:
     - Name: `経費申請`
     - Short Description: 任意（例: `立替精算申請モーダルを開く`）
     - Callback ID: `expense_request`（`.env` の `EXPENSE_SHORTCUT_CALLBACK_ID` に合わせる）
6. **Slash Commands**
   - Command: `/expense-complete`
   - Request URL は Socket Mode のためダミーで OK。
   - Short Description: `精算完了に更新`
7. **Bot をチャンネルへ招待**
   - グローバルショートカットで申請を受け付ける `#finance-expense` に Bot を追加。

> **確認ポイント**: Slack App 側ですべての設定変更後に再インストールが必要な場合があります。

---

## 2. Google API の準備

### 2.1 サービスアカウント
1. Google Cloud Console で新規/既存プロジェクトを選択。
2. **API ライブラリ**で「Google Drive API」「Google Sheets API」を有効化。
3. **サービスアカウント**を作成し、キーを JSON 形式で発行。
4. サービスアカウントのメールアドレスに以下の共有権限を付与：
   - 領収書保存先となる Google Drive フォルダ（例: `/Finance/Expenses`）に `コンテンツの管理者` 権限以上。
   - 個人シート、もしくはデフォルトシートへ「編集者」権限で共有。
5. 発行した JSON は `.env` の `GOOGLE_CREDENTIALS_JSON` にフル文字列で入れるか、ファイルパスを `GOOGLE_APPLICATION_CREDENTIALS` に指定。

### 2.2 Google Drive 構造
- ルートフォルダ（例: `Finance/Expenses`）のフォルダ ID を取得し、`GOOGLE_DRIVE_ROOT_FOLDER_ID` に設定。
- Bot は `YYYY/MM` 形式のサブフォルダを自動で作成します（例: `Finance/Expenses/2025/09/`）。
- 社内閲覧用に自動共有したいドメインがある場合は `GOOGLE_SHARING_DOMAIN` にドメインを設定してください（例: `example.co.jp`）。
  - 指定すると Drive API でドメインリーダー権限を付与します。

### 2.3 Google Sheets 構造
1. 個人ごとのスプレッドシート（例: `松田_立替精算`）を用意し、サービスアカウントに「編集者」権限を付与。
2. シート（タブ）に以下のヘッダーを 1 行目に作成してください：
   | 列 | 項目 | 説明 |
   |----|------|------|
   | A | Request ID | 自動採番 (例: EXP-20250925-ABCD) |
   | B | Slack Thread TS | スレッドTS（内部参照）|
   | C | Slack Channel ID | 申請投稿チャンネル |
   | D | Applicant Slack ID | 申請者の Slack User ID |
   | E | Applicant Name | 表示名 |
   | F | Expense Title | 経費内容 |
   | G | Amount | 金額（数値）|
   | H | Currency | 通貨（デフォルト JPY）|
   | I | Usage Date | 利用日 (YYYY-MM-DD) |
   | J | Remarks | 備考 |
   | K | Drive Folder ID | 領収書を保存したフォルダ ID |
   | L | Drive File Name | 領収書ファイル名 |
   | M | Drive File Link | 閲覧リンク |
   | N | Drive File ID | ファイル ID |
   | O | Status | `待機中` / `受付済` / `承認` / `却下` / `完了` |
   | P | Sheet Row URL | 行リンク（自動生成）|
   | Q | Created At | ISO8601 タイムスタンプ |
   | R | Updated At | ISO8601 タイムスタンプ |
3. 共通シートを `SHEET_TARGET` もしくは `DEFAULT_SHEET_TARGET`（後方互換用）として以下形式の JSON で指定：
   ```json
   {
     "spreadsheetId": "1AbCdEfGhIjK",
     "tabName": "Requests",
     "gid": "0"
   }
   ```
   - `gid` は任意。指定しない場合はタブ名ベースでアクセスします。

> **Slack User ID の取得方法**: Slack で `@ユーザー` を右クリック→「プロフィールを表示」→その他→「メンバーIDをコピー」。

---

## 3. 環境変数 (.env) の設定

`.env.example` をベースに必要値を設定してください。主な変数の意味は下表の通りです。

| 変数 | 説明 |
|------|------|
| `SLACK_BOT_TOKEN` | OAuth & Permissions で発行される Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Socket Mode のみの場合は未使用（HTTP エンドポイント運用時のみ） |
| `SLACK_APP_TOKEN` | Socket Mode 用 App-Level Token (connections:write) |
| `EXPENSE_CHANNEL_ID` | 申請を受け付けるチャンネルID（例: `C0123456789`）|
| `ACCOUNTING_CHANNEL_ID` | 経理通知チャンネルID |
| `GOOGLE_CREDENTIALS_JSON` | サービスアカウントのJSON（文字列）|
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | 領収書保存ルートフォルダのID |
| `GOOGLE_SHARED_DRIVE_ID` | 共有ドライブを使う場合は指定（任意）|
| `GOOGLE_SHARING_DOMAIN` | 自動共有するドメイン（任意）|
| `SHEET_TARGET` | 申請を記録するシート情報の JSON（`DEFAULT_SHEET_TARGET` でも可）|
| `REQUEST_ID_PREFIX` | 受付番号のプレフィックス（例: `EXP`）|
| `RECEIPT_DM_TEMPLATE` | モーダル送信直後に送る DM テキスト。`{threadLink}` プレースホルダ使用可 |
| `APPROVE_REACTION` / `REJECT_REACTION` | ステータス更新に使うリアクション（デフォルト: `white_check_mark` / `x`）|
| `MAX_FILENAME_TITLE_LENGTH` | Drive 保存ファイル名で経費内容の切り詰め文字数 |
| `PORT` | Socket Mode でも Express を起動する場合のポート（ローカルデバッグ用）|

---

## 4. 運用フロー確認

1. 社員が `#finance-expense` でグローバルショートカット「経費申請」を実行し、モーダルに入力。
2. Bot がチャンネルに受付メッセージを投稿し、同時に申請者へ DM で領収書アップロードの案内。
3. 申請者が同スレッドに領収書ファイルを添付すると、Bot が自動で Google Drive に保存し、該当シートへ行追加＆スレッドへリンク返信。
4. 経理担当が :white_check_mark:（承認）または :x:（却下）のリアクション → ステータスが Sheets で更新され、スレッド／経理チャンネルへ通知。
5. 精算完了時は `/expense-complete {RequestID}` コマンド、もしくは Sheets のステータス更新（手動）を実行。コマンド経由の場合、申請者へ DM とチャンネル通知を自動送信。

---

## 5. デプロイと運用時の注意

- サービスアカウントのキー管理は Google Secret Manager / AWS Secrets Manager 等で暗号化保管してください。
- プロダクションでは `npm run build` でトランスパイル後、`npm start` もしくは PM2 等のプロセスマネージャを利用する運用を推奨。
- Slack のイベント数が多い場合、Socket Mode の同時接続数・レイテンシーを監視。
- シートの検索は API で行単位スキャンのため、レコードが数万件を超える場合は BigQuery 等での集約を検討。
- 追加のフィールド（例: 申請カテゴリ）を扱う場合は `src/slack/views.ts` と `src/services/expense-service.ts` の双方を変更する。

---

## 5.1 Compute Engine e2-micro へのデプロイ手順（Always Free 枠）

常時オンラインを無料枠で運用したい場合の最小構成例です。リージョンは Always Free 対象（例: `us-west1`, `us-central1`）。

1. **VM 作成**
   ```bash
   gcloud compute instances create tatekae-bot \
     --machine-type=e2-micro \
     --zone=us-west1-b \
     --boot-disk-type=pd-standard \
     --boot-disk-size=20GB \
     --image-family=debian-12 \
     --image-project=debian-cloud
   ```
   - SSH 接続は IAP 経由にするか、必要な IP のみに制限してください。

2. **OS 初期設定**
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   sudo apt-get install -y curl git build-essential
   ```
   - 自動更新（`unattended-upgrades`）を有効化するとパッチ適用が楽です。

3. **Node.js 18 LTS 導入**（例: NodeSource）
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node -v  # v18.x を確認
   ```

4. **リポジトリ配置**
   ```bash
   sudo useradd -m -s /bin/bash botuser
   sudo mkdir -p /opt/tatekae-seisan-bot
   sudo chown botuser:botuser /opt/tatekae-seisan-bot
   sudo -u botuser git clone https://github.com/bestat/tatekae-seisan-bot.git /opt/tatekae-seisan-bot
   cd /opt/tatekae-seisan-bot
   sudo -u botuser npm install
   sudo -u botuser npm run build
   ```

5. **環境変数配置**
   - `/opt/tatekae-seisan-bot/.env` を作成し、Slack/Google のシークレットを記載。
   - ファイル権限は `chmod 600`、所有者は `botuser` にします。

6. **systemd サービス化**
   `/etc/systemd/system/tatekae-bot.service`:
   ```ini
   [Unit]
   Description=Tatekae Seisan Bot (SlackExpense)
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/opt/tatekae-seisan-bot
   EnvironmentFile=/opt/tatekae-seisan-bot/.env
   ExecStart=/usr/bin/node dist/index.js
   Restart=always
   User=botuser

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now tatekae-bot
   sudo systemctl status tatekae-bot
   ```

7. **ログ・監視**
   - Journald: `journalctl -u tatekae-bot -f`
   - Stackdriver (Cloud Logging) を有効化しておくと GUI で確認できます。

8. **バックアップ & セキュリティ**
   - 月次でディスクスナップショットを取得。
   - SSH は IAP トンネル推奨、`ufw` や Cloud Armor でアクセス制御。

> Always Free 枠は 1 プロジェクトあたり e2-micro 1 台のみ対象です。別用途で枠を使っている場合は課金が発生する点に注意してください。

---

## 6. チェックリスト

- [ ] Slack App の Bot Token / Signing Secret / App Token を取得し `.env` に設定
- [ ] グローバルショートカット・スラッシュコマンド・Socket Mode を有効化
- [ ] `#finance-expense` と経理チャンネルへ Bot を追加
- [ ] Google Drive ルートフォルダを作成しサービスアカウントへ共有
- [ ] 共通シートを作成し、1 行目にヘッダーを設定＆サービスアカウント共有
- [ ] `SHEET_TARGET`（もしくは `DEFAULT_SHEET_TARGET`）を設定
- [ ] `.env` を配置して `npm run dev` で接続テスト

以上で初期構築は完了です。追加のカスタマイズ要件があれば `src/services/expense-service.ts` を中心に調整してください。
