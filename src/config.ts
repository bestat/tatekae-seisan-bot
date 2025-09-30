import 'dotenv/config';

export interface SheetTarget {
  spreadsheetId: string;
  tabName: string;
  gid?: string;
}

export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  timezone: string;
  slack: {
    botToken: string;
    appToken: string;
    financeChannelId: string;
    accountingChannelId: string;
    approveReaction: string;
    rejectReaction: string;
    modalCallbackId: string;
    modalShortcutCallbackId: string;
  };
  google: {
    credentialsJson?: string;
    applicationCredentialsPath?: string;
    driveRootFolderId: string;
    sharedDriveId?: string;
    sharingDomain?: string;
    sheet: SheetTarget;
  };
  app: {
    requestIdPrefix: string;
    sheetDateFormat: string;
    currency: string;
    receiptInstructionsTemplate: string;
    maxFilenameTitleLength: number;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

function parseSheetTarget(value: string): SheetTarget {
  try {
    const parsed = JSON.parse(value) as Partial<SheetTarget>;
    if (!parsed.spreadsheetId) {
      throw new Error('Missing spreadsheetId');
    }
    return {
      spreadsheetId: parsed.spreadsheetId,
      tabName: parsed.tabName ?? process.env.DEFAULT_SHEET_TAB_NAME ?? 'Requests',
      gid: parsed.gid,
    };
  } catch (error) {
    throw new Error(`Failed to parse sheet target JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadConfig(): AppConfig {
  const environment = (process.env.NODE_ENV ?? 'development') as AppConfig['environment'];
  const timezone = process.env.APP_TIMEZONE ?? 'Asia/Tokyo';

  const sheetTargetValue = process.env.SHEET_TARGET ?? process.env.DEFAULT_SHEET_TARGET;
  if (!sheetTargetValue) {
    throw new Error('Environment variable SHEET_TARGET (or DEFAULT_SHEET_TARGET) is required');
  }
  const sheetTarget = parseSheetTarget(sheetTargetValue);

  const config: AppConfig = {
    environment,
    timezone,
    slack: {
      botToken: requireEnv('SLACK_BOT_TOKEN'),
      appToken: requireEnv('SLACK_APP_TOKEN'),
      financeChannelId: requireEnv('EXPENSE_CHANNEL_ID'),
      accountingChannelId: requireEnv('ACCOUNTING_CHANNEL_ID'),
      approveReaction: process.env.APPROVE_REACTION ?? 'white_check_mark',
      rejectReaction: process.env.REJECT_REACTION ?? 'x',
      modalCallbackId: process.env.EXPENSE_MODAL_CALLBACK_ID ?? 'expense_request_view',
      modalShortcutCallbackId: process.env.EXPENSE_SHORTCUT_CALLBACK_ID ?? 'expense_request',
    },
    google: {
      credentialsJson: process.env.GOOGLE_CREDENTIALS_JSON,
      applicationCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      driveRootFolderId: requireEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
      sharedDriveId: process.env.GOOGLE_SHARED_DRIVE_ID,
      sharingDomain: process.env.GOOGLE_SHARING_DOMAIN,
      sheet: sheetTarget,
    },
    app: {
      requestIdPrefix: process.env.REQUEST_ID_PREFIX ?? 'EXP',
      sheetDateFormat: process.env.SHEET_DATE_FORMAT ?? 'yyyy-MM-dd',
      currency: process.env.EXPENSE_CURRENCY ?? 'JPY',
      receiptInstructionsTemplate:
        process.env.RECEIPT_DM_TEMPLATE ??
        '領収書を {threadLink} のスレッドに添付してください。添付後に自動で処理します。',
      maxFilenameTitleLength: Number(process.env.MAX_FILENAME_TITLE_LENGTH ?? '20'),
    },
  };

  return config;
}
