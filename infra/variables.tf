variable "project_id" {
  description = "GCP project ID that hosts the Tatekae Seisan bot infrastructure."
  type        = string
}

variable "region" {
  description = "Default region for regional resources (Always Free 対象の us-west1 等を推奨)。"
  type        = string
  default     = "us-west1"
}

variable "zone" {
  description = "Compute Engine zone (Always Free 対象: us-west1-b など)。"
  type        = string
  default     = "us-west1-b"
}

variable "instance_name" {
  description = "Compute Engine インスタンス名。"
  type        = string
  default     = "tatekae-bot"
}

variable "machine_type" {
  description = "Compute Engine のマシンタイプ。Always Free は e2-micro 固定。"
  type        = string
  default     = "e2-micro"
}

variable "boot_disk_size_gb" {
  description = "ブートディスクサイズ (GB)。Always Free は 30GB 以下に抑える。"
  type        = number
  default     = 20
}

variable "boot_disk_type" {
  description = "ブートディスクのタイプ。pd-standard だと Always Free の要件を満たしやすい。"
  type        = string
  default     = "pd-standard"
}

variable "boot_disk_image" {
  description = "ブートイメージ。デフォルトは Debian 12。"
  type        = string
  default     = "debian-cloud/debian-12"
}

variable "network" {
  description = "接続する VPC ネットワーク。デフォルトは default。"
  type        = string
  default     = "default"
}

variable "instance_tags" {
  description = "ファイアウォール適用などで使うインスタンスタグ。"
  type        = list(string)
  default     = []
}

variable "service_account_id" {
  description = "Service Account の account_id（文字数 <= 30、英数字と - のみ）。"
  type        = string
  default     = "tatekae-bot"
}

variable "repo_url" {
  description = "デプロイ対象リポジトリの URL。"
  type        = string
  default     = "https://github.com/bestat/tatekae-seisan-bot.git"
}

variable "repo_token_secret_id" {
  description = "Secret Manager に保存した GitHub PAT のシークレットID（プライベートリポジトリを clone する場合に指定）。空なら認証なしのURLを使用。"
  type        = string
  default     = ""
}

variable "service_name" {
  description = "systemd サービス名。"
  type        = string
  default     = "tatekae-bot"
}

variable "working_dir" {
  description = "アプリの配置先ディレクトリ。"
  type        = string
  default     = "/opt/tatekae-seisan-bot"
}

variable "app_user" {
  description = "アプリ実行用の Linux ユーザー。"
  type        = string
  default     = "botuser"
}

variable "node_version" {
  description = "Node.js のメジャーバージョン (例: 18)。"
  type        = string
  default     = "18"
}

variable "use_secret_manager" {
  description = "Secret Manager から .env を取得するロジックを有効化するかどうか。"
  type        = bool
  default     = false
}

variable "secret_id" {
  description = "Secret Manager 上の .env シークレット ID（use_secret_manager = true の場合に指定）。"
  type        = string
  default     = ""
}
