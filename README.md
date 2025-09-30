# Tatekae Seisan Bot

Slackベースの立替精算ワークフローを自動化する Node.js アプリです。社員がショートカットから経費申請を行うと、Botがスレッドで領収書を受け付け、Google Drive へ保存し、指定の Google スプレッドシートへ行を追加します。リアクションで承認／却下を管理し、精算完了もSlack上で通知します。

## 主な機能
- グローバルショートカットによる精算申請モーダル
- 領収書アップロードのスレッド管理とGoogle Driveへの自動保存
- 個人別スプレッドシート（またはデフォルト）への行追加とリンク共有
- :white_check_mark:／:x: リアクションでステータス更新
- `/expense-complete` コマンドで精算完了処理と通知

## 動作環境
- Node.js 18 以上
- Slack App (Socket Mode)
- Google Workspace (Drive / Sheets API) とサービスアカウント

## セットアップ概要
1. Slack AppでBotを作成し、ショートカット・スラッシュコマンド・イベント・スコープを設定
2. Google Cloudでサービスアカウントを作成し、Drive/Sheets権限を付与
3. 領収書保存用のDriveフォルダとスプレッドシート（個人ごと or デフォルト）を準備
4. `.env` に必要な環境変数を設定

詳細な手順は `docs/setup.md` を参照してください。

## Terraform デプロイ
Google Cloud の Always Free 対象である Compute Engine e2-micro を使う構成を Terraform で管理できます。初回セットアップは以下の流れです（Billing 有効化済みのプロジェクトが前提）。

```bash
# プロジェクトルートで実行
cd infra
cp terraform.tfvars.example terraform.tfvars   # 任意
# 上記ファイルで project_id 等を編集
terraform init
terraform plan
terraform apply
```

- `terraform.tfvars` で最低限 `project_id` を設定してください。その他 `region`, `zone`, `service_account_id` などは `infra/variables.tf` のデフォルト値で動作します。
- Secret Manager から `.env` を取得したい場合は、Terraform 側で該当シークレットを作成し `use_secret_manager = true`, `secret_id = "your-secret"` をセットします。Secret Manager を使わない場合、VM 起動後に `/opt/tatekae-seisan-bot/.env` を手動で更新します。
- `terraform destroy` を実行すると VM と `.env`（Secret Manager ではなくローカルにある場合も含む）が削除されるため、実運用ではバックアップ手段を確保してください。

## 開発コマンド
```bash
npm install
npm run dev # ts-node-dev で Socket Mode を起動
npm run build
npm start   # ビルド済み dist を実行
```

## フォルダ構成
- `src/index.ts`: Slack Bolt アプリのエントリーポイント
- `src/services/expense-service.ts`: 精算ワークフローの中心ロジック
- `src/google/`: Google Drive / Sheets クライアント
- `src/slack/views.ts`: モーダルなどのSlack UI定義
- `docs/setup.md`: 管理者向けセットアップガイド
- `infra/`: Terraform 管理用ディレクトリ

## テスト
現時点では自動テストは未整備です。ローカルで `npm run dev` を起動し、Slackのワークスペースで動作確認してください。

## ライセンス
ISC (任意で変更してください)
