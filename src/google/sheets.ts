import { sheets_v4 } from 'googleapis';
import { formatInTimeZone } from 'date-fns-tz';
import { AppConfig, SheetTarget } from '../config';

type Row = string[];

export interface SheetRecord {
  requestId: string;
  slackThreadTs: string;
  slackChannelId: string;
  applicantSlackId: string;
  applicantName: string;
  expenseTitle: string;
  amount: number;
  currency: string;
  usageDate: string;
  remarks: string;
  driveFolderId?: string;
  driveFileName?: string;
  driveFileLink?: string;
  driveFileId?: string;
  status: string;
  sheetRowUrl?: string;
  spreadsheetId: string;
  tabName: string;
  rowNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppendRequestInput {
  requestId: string;
  slackThreadTs: string;
  slackChannelId: string;
  applicantSlackId: string;
  applicantName: string;
  expenseTitle: string;
  amount: number;
  currency: string;
  usageDate: string;
  remarks: string;
  sheetTarget: SheetTarget;
  timezone: string;
}

export interface UpdateRecordInput {
  sheetTarget: SheetTarget;
  rowNumber: number;
  updates: Partial<Pick<SheetRecord, 'driveFileId' | 'driveFileLink' | 'driveFileName' | 'driveFolderId' | 'status' | 'remarks' | 'updatedAt'>>;
}

export class SheetsService {
  constructor(private client: sheets_v4.Sheets, private config: AppConfig) {}

  async appendRequest(input: AppendRequestInput): Promise<SheetRecord> {
    const now = this.formatNow(input.timezone);
    const values: Row = [
      input.requestId,
      input.slackThreadTs,
      input.slackChannelId,
      input.applicantSlackId,
      input.applicantName,
      input.expenseTitle,
      String(input.amount),
      input.currency,
      input.usageDate,
      input.remarks,
      '',
      '',
      '',
      '',
      '待機中',
      '',
      now,
      now,
    ];

    const range = `${input.sheetTarget.tabName}!A1:R1`;
    const res = await this.client.spreadsheets.values.append({
      spreadsheetId: input.sheetTarget.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values],
      },
    });

    const rowNumber = this.extractRowNumber(res.data.updates?.updatedRange);
    const sheetRowUrl = rowNumber
      ? this.buildRowUrl(input.sheetTarget, rowNumber)
      : undefined;

    return {
      requestId: input.requestId,
      slackThreadTs: input.slackThreadTs,
      slackChannelId: input.slackChannelId,
      applicantSlackId: input.applicantSlackId,
      applicantName: input.applicantName,
      expenseTitle: input.expenseTitle,
      amount: input.amount,
      currency: input.currency,
      usageDate: input.usageDate,
      remarks: input.remarks,
      driveFolderId: undefined,
      driveFileName: undefined,
      driveFileLink: undefined,
      driveFileId: undefined,
      status: '待機中',
      sheetRowUrl,
      spreadsheetId: input.sheetTarget.spreadsheetId,
      tabName: input.sheetTarget.tabName,
      rowNumber: rowNumber ?? NaN,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateRecord(input: UpdateRecordInput): Promise<void> {
    const range = `${input.sheetTarget.tabName}!A${input.rowNumber}:R${input.rowNumber}`;
    const { data } = await this.client.spreadsheets.values.get({
      spreadsheetId: input.sheetTarget.spreadsheetId,
      range,
    });

    const row = data.values?.[0];
    if (!row) {
      throw new Error(`Row ${input.rowNumber} not found in sheet ${input.sheetTarget.spreadsheetId}`);
    }

    // Ensure row has length 18 (A-R)
    while (row.length < 18) {
      row.push('');
    }

    const now = this.formatNow(this.config.timezone);
    const updatedRow = [...row];

    if (input.updates.remarks !== undefined) {
      updatedRow[9] = input.updates.remarks;
    }

    if (input.updates.driveFolderId !== undefined) {
      updatedRow[10] = input.updates.driveFolderId;
    }

    if (input.updates.driveFileName !== undefined) {
      updatedRow[11] = input.updates.driveFileName;
    }

    if (input.updates.driveFileLink !== undefined) {
      updatedRow[12] = input.updates.driveFileLink;
    }

    if (input.updates.driveFileId !== undefined) {
      updatedRow[13] = input.updates.driveFileId;
    }

    if (input.updates.status !== undefined) {
      updatedRow[14] = input.updates.status;
    }

    if (!updatedRow[15]) {
      updatedRow[15] = this.buildRowUrl(input.sheetTarget, input.rowNumber);
    }

    updatedRow[17] = input.updates.updatedAt ?? now;

    await this.client.spreadsheets.values.update({
      spreadsheetId: input.sheetTarget.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [updatedRow],
      },
    });
  }

  async findRecordByThreadTs(threadTs: string): Promise<SheetRecord | undefined> {
    return this.findRecordInSheet(this.config.google.sheet, threadTs);
  }

  async findRecordByRequestId(requestId: string): Promise<SheetRecord | undefined> {
    return this.findRecordInSheet(this.config.google.sheet, undefined, requestId);
  }

  private async findRecordInSheet(
    target: SheetTarget,
    threadTs?: string,
    requestId?: string,
  ): Promise<SheetRecord | undefined> {
    const range = `${target.tabName}!A:R`;
    const { data } = await this.client.spreadsheets.values.get({
      spreadsheetId: target.spreadsheetId,
      range,
    });

    const rows = data.values ?? [];
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      const candidateThreadTs = row[1];
      const candidateRequestId = row[0];
      if ((threadTs && candidateThreadTs === threadTs) || (requestId && candidateRequestId === requestId)) {
        return this.rowToRecord(row, target, index + 1);
      }
    }
    return undefined;
  }

  private rowToRecord(row: Row, sheetTarget: SheetTarget, rowNumber: number): SheetRecord {
    const [
      requestId,
      threadTs,
      channelId,
      applicantId,
      applicantName,
      title,
      amount,
      currency,
      usageDate,
      remarks,
      driveFolderId,
      driveFileName,
      driveFileLink,
      driveFileId,
      status,
      rowUrl,
      createdAt,
      updatedAt,
    ] = row;
    return {
      requestId,
      slackThreadTs: threadTs,
      slackChannelId: channelId,
      applicantSlackId: applicantId,
      applicantName: applicantName ?? '',
      expenseTitle: title ?? '',
      amount: Number(amount ?? 0),
      currency: currency ?? this.config.app.currency,
      usageDate: usageDate ?? '',
      remarks: remarks ?? '',
      driveFolderId: driveFolderId,
      driveFileName: driveFileName,
      driveFileLink: driveFileLink,
      driveFileId: driveFileId,
      status: status ?? '待機中',
      sheetRowUrl: rowUrl || this.buildRowUrl(sheetTarget, rowNumber),
      spreadsheetId: sheetTarget.spreadsheetId,
      tabName: sheetTarget.tabName,
      rowNumber,
      createdAt: createdAt ?? '',
      updatedAt: updatedAt ?? '',
    };
  }

  private extractRowNumber(range?: string | null): number | undefined {
    if (!range) {
      return undefined;
    }
    const match = range.match(/!(?:[A-Z]+)(\d+):/);
    if (!match) {
      return undefined;
    }
    return Number(match[1]);
  }

  private buildRowUrl(sheetTarget: SheetTarget, rowNumber: number): string { 
    const base = `https://docs.google.com/spreadsheets/d/${sheetTarget.spreadsheetId}/edit`;
    if (sheetTarget.gid) {
      return `${base}#gid=${sheetTarget.gid}&range=A${rowNumber}`;
    }
    return `${base}#range=A${rowNumber}`;
  }

  private formatNow(timezone: string): string {
    return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
}
