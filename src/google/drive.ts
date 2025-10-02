import { Readable } from 'node:stream';
import { drive_v3 } from 'googleapis';
import { format } from 'date-fns';
import { AppConfig } from '../config';
import { logger } from '../logger';

interface UploadReceiptParams {
  data: Buffer;
  mimeType: string;
  requestId: string;
  usageDate: Date;
  applicantName: string;
  amount: number;
  currency: string;
  summary: string;
  originalFilename?: string;
}

export interface UploadedReceipt {
  fileId: string;
  webViewLink?: string;
  webContentLink?: string;
  name: string;
  folderId: string;
}

export class DriveService {
  constructor(private client: drive_v3.Drive, private config: AppConfig) {}

  async uploadReceipt(params: UploadReceiptParams): Promise<UploadedReceipt> {
    const folderId = await this.ensureMonthlyFolder(params.usageDate);
    const sanitizedSummary = params.summary.replace(/[^a-zA-Z0-9一-龯ぁ-ゔァ-ヴー々〆〤\s_-]+/g, '').trim();
    const truncatedSummary = sanitizedSummary.slice(0, this.config.app.maxFilenameTitleLength) || 'expense';
    const usageDateStr = format(params.usageDate, 'yyyyMMdd');
    const amountStr = new Intl.NumberFormat('ja-JP').format(params.amount);
    const extension = this.resolveExtension(params);
    const name = `${usageDateStr}_${params.applicantName}_${amountStr}${params.currency}_${truncatedSummary}${extension}`;

    const res = await this.client.files.create({
      requestBody: {
        name,
        parents: [folderId],
        mimeType: params.mimeType,
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from(params.data),
      },
      supportsAllDrives: Boolean(this.config.google.sharedDriveId),
      fields: 'id, name, webViewLink, webContentLink',
    });

    if (this.config.google.sharingDomain) {
      await this.ensureDomainAccess(res.data.id!);
    }

    return {
      fileId: res.data.id!,
      webViewLink: res.data.webViewLink ?? undefined,
      webContentLink: res.data.webContentLink ?? undefined,
      name: res.data.name ?? name,
      folderId,
    };
  }

  private async ensureMonthlyFolder(target: Date): Promise<string> {
    const year = format(target, 'yyyy');
    const month = format(target, 'MM');

    const yearFolderId = await this.ensureFolder(this.config.google.driveRootFolderId, year);
    return this.ensureFolder(yearFolderId, month);
  }

  private async ensureFolder(parentId: string, name: string): Promise<string> {
    const queryParts = [
      `name = '${name.replace(/'/g, "\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      `'${parentId}' in parents`,
      'trashed = false',
    ];

    const listParams: drive_v3.Params$Resource$Files$List = {
      q: queryParts.join(' and '),
      fields: 'files(id, name)',
      supportsAllDrives: Boolean(this.config.google.sharedDriveId),
      includeItemsFromAllDrives: Boolean(this.config.google.sharedDriveId),
    };

    if (this.config.google.sharedDriveId) {
      listParams.driveId = this.config.google.sharedDriveId;
      listParams.corpora = 'drive';
      listParams.spaces = 'drive';
    }

    const { data } = await this.client.files.list(listParams);

    if (data.files && data.files.length > 0) {
      return data.files[0].id!;
    }

    const res = await this.client.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      supportsAllDrives: Boolean(this.config.google.sharedDriveId),
      fields: 'id',
    });

    return res.data.id!;
  }

  private async ensureDomainAccess(fileId: string): Promise<void> {
    try {
      await this.client.permissions.create({
        fileId,
        supportsAllDrives: Boolean(this.config.google.sharedDriveId),
        requestBody: {
          type: 'domain',
          role: 'reader',
          domain: this.config.google.sharingDomain,
          allowFileDiscovery: false,
        },
      });
    } catch (error) {
      // If permission already exists or parent grants broader permission, suppress the error
      const msg = error instanceof Error ? error.message : String(error);
      // Try to read reason from Google error payload if available
      const reason = (error as any)?.response?.data?.error?.errors?.[0]?.reason || (error as any)?.errors?.[0]?.reason;
      const benign =
        msg.includes('alreadyShared') ||
        msg.includes('duplicate') ||
        msg.includes('less than the inherited access') ||
        reason === 'cannotChangeInheritedAccess';
      if (benign) {
        logger.warn({ fileId, reason, msg }, 'Skipping domain permission change due to inherited or duplicate access');
        return;
      }
      throw error;
    }
  }

  private resolveExtension(params: UploadReceiptParams): string {
    const fromName = params.originalFilename?.match(/\.([^.]+)$/);
    if (fromName) {
      return `.${fromName[1]}`;
    }

    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/heic': '.heic',
      'application/pdf': '.pdf',
      'image/gif': '.gif',
    };
    return map[params.mimeType] ?? '';
  }
}
