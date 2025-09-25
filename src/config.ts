import 'dotenv/config';

export interface SheetTarget {
  spreadsheetId: string;
  tabName: string;
  gid?: string;
}

export interface PersonalSheetMap {
  [slackUserId: string]: SheetTarget;
}

export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  timezone: string;
  slack: {
    botToken: string;
    signingSecret: string;
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
    personalSheetMap: PersonalSheetMap;
    defaultSheet?: SheetTarget;
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

function parseSheetTarget(value: string | undefined): SheetTarget | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed.spreadsheetId || !parsed.tabName) {
      throw new Error('Missing spreadsheetId or tabName');
    }
    return parsed as SheetTarget;
  } catch (error) {
    throw new Error(`Failed to parse sheet target JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parsePersonalSheetMap(value: string | undefined): PersonalSheetMap {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, { spreadsheetId: string; tabName?: string; gid?: string }>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, target]) => [
        key,
        {
          spreadsheetId: target.spreadsheetId,
          tabName: target.tabName ?? process.env.DEFAULT_SHEET_TAB_NAME ?? 'Requests',
          gid: target.gid,
        },
      ]),
    );
  } catch (error) {
    throw new Error(`Failed to parse PERSONAL_SHEET_MAP JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadConfig(): AppConfig {
  const environment = (process.env.NODE_ENV ?? 'development') as AppConfig['environment'];
  const timezone = process.env.APP_TIMEZONE ?? 'Asia/Tokyo';

  const config: AppConfig = {
    environment,
    timezone,
    slack: {
      botToken: requireEnv('SLACK_BOT_TOKEN'),
      signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
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
      personalSheetMap: parsePersonalSheetMap(process.env.PERSONAL_SHEET_MAP),
      defaultSheet: parseSheetTarget(process.env.DEFAULT_SHEET_TARGET),
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

  if (!config.google.defaultSheet && Object.keys(config.google.personalSheetMap).length === 0) {
    throw new Error('Either DEFAULT_SHEET_TARGET or PERSONAL_SHEET_MAP must be provided');
  }

  return config;
}
