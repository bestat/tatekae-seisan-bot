"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriveService = void 0;
const node_stream_1 = require("node:stream");
const date_fns_1 = require("date-fns");
const logger_1 = require("../logger");
class DriveService {
    constructor(client, config) {
        this.client = client;
        this.config = config;
    }
    async uploadReceipt(params) {
        const folderId = await this.ensureMonthlyFolder(params.usageDate);
        const sanitizedSummary = params.summary.replace(/[^a-zA-Z0-9一-龯ぁ-ゔァ-ヴー々〆〤\s_-]+/g, '').trim();
        const truncatedSummary = sanitizedSummary.slice(0, this.config.app.maxFilenameTitleLength) || 'expense';
        const usageDateStr = (0, date_fns_1.format)(params.usageDate, 'yyyyMMdd');
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
                body: node_stream_1.Readable.from(params.data),
            },
            supportsAllDrives: Boolean(this.config.google.sharedDriveId),
            fields: 'id, name, webViewLink, webContentLink',
        });
        if (this.config.google.sharingDomain) {
            await this.ensureDomainAccess(res.data.id);
        }
        return {
            fileId: res.data.id,
            webViewLink: res.data.webViewLink ?? undefined,
            webContentLink: res.data.webContentLink ?? undefined,
            name: res.data.name ?? name,
            folderId,
        };
    }
    async ensureMonthlyFolder(target) {
        const year = (0, date_fns_1.format)(target, 'yyyy');
        const month = (0, date_fns_1.format)(target, 'MM');
        const yearFolderId = await this.ensureFolder(this.config.google.driveRootFolderId, year);
        return this.ensureFolder(yearFolderId, month);
    }
    async ensureFolder(parentId, name) {
        const queryParts = [
            `name = '${name.replace(/'/g, "\'")}'`,
            "mimeType = 'application/vnd.google-apps.folder'",
            `'${parentId}' in parents`,
            'trashed = false',
        ];
        const listParams = {
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
            return data.files[0].id;
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
        return res.data.id;
    }
    async ensureDomainAccess(fileId) {
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
        }
        catch (error) {
            // If permission already exists or parent grants broader permission, suppress the error
            const msg = error instanceof Error ? error.message : String(error);
            // Try to read reason from Google error payload if available
            const reason = error?.response?.data?.error?.errors?.[0]?.reason || error?.errors?.[0]?.reason;
            const benign = msg.includes('alreadyShared') ||
                msg.includes('duplicate') ||
                msg.includes('less than the inherited access') ||
                reason === 'cannotChangeInheritedAccess';
            if (benign) {
                logger_1.logger.warn({ fileId, reason, msg }, 'Skipping domain permission change due to inherited or duplicate access');
                return;
            }
            throw error;
        }
    }
    resolveExtension(params) {
        const fromName = params.originalFilename?.match(/\.([^.]+)$/);
        if (fromName) {
            return `.${fromName[1]}`;
        }
        const map = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/heic': '.heic',
            'application/pdf': '.pdf',
            'image/gif': '.gif',
        };
        return map[params.mimeType] ?? '';
    }
}
exports.DriveService = DriveService;
