# 運用・デバッグ用コマンド集（Compute Engine + Terraform）

本番/検証VM（e2-micro）での起動確認・切り分け・復旧に使ったコマンドを用途別にまとめました。必要に応じて `--project` や `--zone` は自分の環境に置き換えてください。

---

## 状態確認（systemd）
- サービス状態
```bash
sudo systemctl status tatekae-bot
```
- 起動ログの追尾
```bash
sudo journalctl -u tatekae-bot -n 100 -f
```
- 起動失敗のクリアと再起動
```bash
sudo systemctl reset-failed tatekae-bot
sudo systemctl restart tatekae-bot
```
- ユニット内容の確認（ExecStartPre/WorkingDirectory 確認）
```bash
systemctl cat tatekae-bot
```

## 起動スクリプト（GCE Startup Script）
- ステータスと直近ログ
```bash
sudo systemctl status google-startup-scripts
sudo journalctl -u google-startup-scripts -b --no-pager | tail -n 200
```
- 進行状況の監視（ライブ追尾）
```bash
sudo journalctl -u google-startup-scripts -b -f
```
- どの工程で止まっているか（プロセス表示）
```bash
pgrep -fl 'npm|tsc|node|git|apt-get|curl'
```
- 完了判定（exited になったら完了）
```bash
sudo systemctl is-active google-startup-scripts
```
- インスタンスに付与された startup-script を取得（中身の検証）
```bash
curl -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/startup-script" \
  -o /tmp/startup.sh
sed -n '1,140p' /tmp/startup.sh
```
- 手動実行（詳細ログ付き）
```bash
sudo bash -x /tmp/startup.sh 2>&1 | sudo tee /tmp/startup-run.log
```

## Secret Manager（.env の反映）
- ローカルからシークレットに新バージョンを追加
```bash
gcloud secrets versions add tatekae-seisan-env \
  --project threed-ai-dev \
  --data-file=.env
```
- VM で最新の .env を再取得 → 権限設定 → 再起動
```bash
TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/threed-ai-dev/secrets/tatekae-seisan-env/versions/latest:access" \
  | python3 - <<'PY' | sudo tee /opt/tatekae-seisan-bot/.env >/dev/null
import json,sys,base64; print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode())
PY

sudo chown botuser:botuser /opt/tatekae-seisan-bot/.env && sudo chmod 600 /opt/tatekae-seisan-bot/.env
sudo systemctl restart tatekae-bot
```
- ExecStartPre で使う fetch-env.sh を手動配置（緊急時）
```bash
sudo tee /usr/local/bin/fetch-env.sh >/dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
APP_USER="${1:-botuser}"; WORKDIR="${2:-/opt/tatekae-seisan-bot}"; USE_SM="${3:-false}";
PROJECT_ID="${4:-}"; SECRET_ID="${5:-}"
if [ "$USE_SM" = "true" ] && [ -n "$SECRET_ID" ]; then
  TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
  curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${SECRET_ID}/versions/latest:access" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["payload"]["data"])' \
    | base64 --decode > "${WORKDIR}/.env"
  chown "${APP_USER}:${APP_USER}" "${WORKDIR}/.env" && chmod 600 "${WORKDIR}/.env"
fi
exit 0
EOF
sudo chmod 750 /usr/local/bin/fetch-env.sh
```

## Node/NPM（依存とビルド）
- 依存の健全性チェックと再インストール
```bash
sudo -u botuser bash -lc 'cd /opt/tatekae-seisan-bot && npm ci || (npm cache clean --force && npm install)'
```
- TypeScript ビルド（ヒープ拡張）
```bash
sudo -u botuser bash -lc 'cd /opt/tatekae-seisan-bot && NODE_OPTIONS=--max-old-space-size=1536 npm run build'
```
- モジュール解決の簡易確認
```bash
sudo -u botuser bash -lc 'cd /opt/tatekae-seisan-bot && node -p "require.resolve(\"@slack/bolt\")"'
```

## スワップ・メモリ
- 一時スワップの作成（e2‑micro の tsc OOM 回避）
```bash
sudo fallocate -l 3G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=3072
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
```

## Terraform
- 初期化〜適用
```bash
cd infra
terraform init
terraform plan
terraform apply -auto-approve
```
- 既存VMを強制置換（起動スクリプト更新を確実に反映）
```bash
terraform apply -replace=google_compute_instance.bot -auto-approve
```

## gcloud 補助
- プロジェクト確認/設定
```bash
gcloud config list core/project
gcloud config set project threed-ai-dev
```
- VM リセット（起動スクリプト再実行）
```bash
gcloud compute instances reset tatekae-bot --zone us-west1-b
```

## .env 必須項目のスポットチェック（VM）
```bash
sudo grep -E '^(SLACK_|GOOGLE_|SHEET_TARGET|EXPENSE_CHANNEL_ID|ACCOUNTING_CHANNEL_ID)=' /opt/tatekae-seisan-bot/.env
```

---

メモ
- 共有ドライブを使う場合: `GOOGLE_SHARED_DRIVE_ID` は 0A…（共有ドライブID）、`GOOGLE_DRIVE_ROOT_FOLDER_ID` は保存先フォルダID（1…）。
- Secret 更新は「新バージョン追加 → サービス再起動（ExecStartPre が最新を取得）」の流れで反映されます。
