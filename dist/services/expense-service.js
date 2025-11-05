"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseService = void 0;
const id_1 = require("../utils/id");
const time_1 = require("../utils/time");
const logger_1 = require("../logger");
const date_fns_1 = require("date-fns");
const undici_1 = require("undici");
const errors_1 = require("./errors");
class ExpenseService {
    constructor(config, sheets, drive, slack) {
        this.config = config;
        this.sheets = sheets;
        this.drive = drive;
        this.slack = slack;
        this.requestCache = new Map();
    }
    async handleModalSubmission(context, submission) {
        const { userId, view } = context;
        const parsed = submission ?? this.parseSubmission(view);
        const { expenseTitle, amount, usageDate, remarks, currency } = parsed;
        const userInfo = await this.slack.users.info({ user: userId });
        const applicantName = userInfo.user?.profile?.real_name || userInfo.user?.profile?.display_name || `<@${userId}>`;
        const requestId = (0, id_1.generateRequestId)(this.config.app.requestIdPrefix, this.config.timezone);
        const sheetTarget = this.resolveSheetTarget(userId);
        const postMessageRes = await this.slack.chat.postMessage({
            channel: this.config.slack.financeChannelId,
            text: this.buildRequestMessage({
                requestId,
                applicantName,
                applicantSlackId: userId,
                expenseTitle,
                amount,
                usageDate,
                remarks,
                currency,
            }),
        });
        if (!postMessageRes.ok || !postMessageRes.ts || !postMessageRes.channel) {
            throw new Error('Failed to post expense request message');
        }
        const threadTs = postMessageRes.ts;
        const channel = postMessageRes.channel;
        const appendResult = await this.sheets.appendRequest({
            requestId,
            slackThreadTs: threadTs,
            slackChannelId: channel,
            applicantSlackId: userId,
            applicantName,
            expenseTitle,
            amount,
            currency,
            usageDate: (0, date_fns_1.format)(usageDate, 'yyyy-MM-dd'),
            remarks,
            sheetTarget,
            timezone: this.config.timezone,
        });
        this.requestCache.set(threadTs, appendResult);
        await this.slack.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: '申請を受け付けました。領収書をこのスレッドに添付してください。',
        });
        const { permalink } = await this.slack.chat.getPermalink({
            channel,
            message_ts: threadTs,
        });
        const instruction = this.config.app.receiptInstructionsTemplate.replace('{threadLink}', permalink ?? 'こちら');
        await this.slack.chat.postMessage({
            channel: userId,
            text: instruction,
        });
        await this.slack.chat.postMessage({
            channel: this.config.slack.accountingChannelId,
            text: `新しい立替精算申請: *${requestId}* - <@${userId}> が ${amount.toLocaleString('ja-JP')} ${currency} を申請しました。`,
        });
        return {
            requestId,
            threadTs,
            channel,
            sheetRowUrl: appendResult.sheetRowUrl,
        };
    }
    async handleReceiptMessage(event) {
        if (!event.thread_ts || !event.files || event.files.length === 0) {
            return;
        }
        const request = await this.getRequestByThreadTs(event.thread_ts);
        if (!request) {
            logger_1.logger.warn({ threadTs: event.thread_ts }, 'No matching expense request for receipt upload');
            return;
        }
        const file = event.files[0];
        if (!file.url_private_download) {
            logger_1.logger.warn({ fileId: file.id }, 'File does not contain downloadable URL');
            return;
        }
        const buffer = await this.downloadSlackFile(file.url_private_download);
        const mimeType = file.mimetype ?? 'application/octet-stream';
        const usageDate = (0, date_fns_1.parseISO)(`${request.usageDate}T00:00:00`);
        const receipt = await this.drive.uploadReceipt({
            data: buffer,
            mimeType,
            requestId: request.requestId,
            usageDate,
            applicantName: request.applicantName,
            amount: request.amount,
            currency: request.currency,
            summary: request.expenseTitle,
            originalFilename: file.name,
        });
        const updatedAt = (0, time_1.nowInTimeZone)(this.config.timezone);
        await this.sheets.updateRecord({
            sheetTarget: this.resolveSheetTargetBySpreadsheetId(request.spreadsheetId, request.tabName),
            rowNumber: request.rowNumber,
            updates: {
                driveFolderId: receipt.folderId,
                driveFileName: receipt.name,
                driveFileLink: receipt.webViewLink ?? receipt.webContentLink,
                driveFileId: receipt.fileId,
                status: '受付済',
                updatedAt,
            },
        });
        const sheetLink = request.sheetRowUrl ?? this.buildSheetLink(request);
        const driveLink = receipt.webViewLink ?? receipt.webContentLink ?? 'Drive';
        await this.slack.chat.postMessage({
            channel: request.slackChannelId,
            thread_ts: request.slackThreadTs,
            text: `領収書を保存しました。Drive: <${driveLink}|${receipt.name}> / シート: <${sheetLink}|行リンク>`,
        });
        await this.slack.chat.postMessage({
            channel: this.config.slack.accountingChannelId,
            text: `領収書がアップロードされました: *${request.requestId}* (<${sheetLink}|シート>)`,
        });
        const refreshed = await this.sheets.findRecordByRequestId(request.requestId);
        if (refreshed) {
            this.requestCache.set(refreshed.slackThreadTs, refreshed);
        }
    }
    async handleReaction(event) {
        const { reaction, item } = event;
        if (reaction !== this.config.slack.approveReaction && reaction !== this.config.slack.rejectReaction) {
            return;
        }
        const request = await this.getRequestByThreadTs(item.ts);
        if (!request) {
            logger_1.logger.warn({ threadTs: item.ts }, 'Reaction received but request not found');
            return;
        }
        const status = reaction === this.config.slack.approveReaction ? '承認' : '却下';
        const updatedAt = (0, time_1.nowInTimeZone)(this.config.timezone);
        await this.sheets.updateRecord({
            sheetTarget: this.resolveSheetTargetBySpreadsheetId(request.spreadsheetId, request.tabName),
            rowNumber: request.rowNumber,
            updates: {
                status,
                updatedAt,
            },
        });
        const sheetLink = request.sheetRowUrl ?? this.buildSheetLink(request);
        const message = status === '承認' ? '承認されました。' : '却下されました。理由をスレッドに返信してください。';
        await this.slack.chat.postMessage({
            channel: request.slackChannelId,
            thread_ts: request.slackThreadTs,
            text: `${message} (<${sheetLink}|シート>)`,
        });
        await this.slack.chat.postMessage({
            channel: this.config.slack.accountingChannelId,
            text: `${status}リアクション: *${request.requestId}* (<${sheetLink}|シート>)`,
        });
        const refreshed = await this.sheets.findRecordByRequestId(request.requestId);
        if (refreshed) {
            this.requestCache.set(refreshed.slackThreadTs, refreshed);
        }
    }
    async handleCompleteCommand(command) {
        const requestId = command.text.trim();
        if (!requestId) {
            return '受付番号を指定してください (例: /expense-complete EXP-20250925-ABCD)';
        }
        const record = await this.sheets.findRecordByRequestId(requestId);
        if (!record) {
            return `指定した受付番号 ${requestId} の申請が見つかりませんでした。`;
        }
        const updatedAt = (0, time_1.nowInTimeZone)(this.config.timezone);
        await this.sheets.updateRecord({
            sheetTarget: this.resolveSheetTargetBySpreadsheetId(record.spreadsheetId, record.tabName),
            rowNumber: record.rowNumber,
            updates: {
                status: '完了',
                updatedAt,
            },
        });
        const sheetLink = record.sheetRowUrl ?? this.buildSheetLink(record);
        await this.slack.chat.postMessage({
            channel: record.slackChannelId,
            thread_ts: record.slackThreadTs,
            text: `精算処理が完了しました。 (<${sheetLink}|シート>)`,
        });
        await this.slack.chat.postMessage({
            channel: record.applicantSlackId,
            text: `あなたの立替精算 (${record.requestId}) が完了しました。詳細: <${sheetLink}|シート>`,
        });
        await this.slack.chat.postMessage({
            channel: this.config.slack.accountingChannelId,
            text: `完了マーク: *${record.requestId}* (<${sheetLink}|シート>)`,
        });
        this.requestCache.set(record.slackThreadTs, {
            ...record,
            status: '完了',
            updatedAt,
        });
        return `受付番号 ${record.requestId} を完了に更新しました。`;
    }
    buildRequestMessage(params) {
        const usageDateStr = (0, date_fns_1.format)(params.usageDate, 'yyyy-MM-dd');
        const amountStr = params.amount.toLocaleString('ja-JP');
        const remarks = params.remarks ? `\n• 備考: ${params.remarks}` : '';
        return `*${params.requestId}* 立替精算申請\n• 申請者: <@${params.applicantSlackId}> (${params.applicantName})\n• 経費内容: ${params.expenseTitle}\n• 金額: ${amountStr} ${params.currency}\n• 利用日: ${usageDateStr}${remarks}`;
    }
    resolveSheetTarget(_slackUserId) {
        return this.config.google.sheet;
    }
    parseSubmission(view) {
        const values = view.state.values;
        const errors = {};
        let expenseTitle = '';
        let amount = 0;
        let usageDate;
        let currency = '';
        try {
            expenseTitle = this.getInputValue(values, 'expense_title_block', 'expense_title');
            if (!expenseTitle) {
                throw new Error();
            }
        }
        catch (error) {
            errors.expense_title_block = '経費内容を入力してください';
        }
        try {
            const raw = this.getInputValue(values, 'amount_block', 'amount');
            amount = this.parseAmount(raw);
        }
        catch (error) {
            errors.amount_block = '金額は半角の数値で入力してください';
        }
        try {
            currency = this.getSelectValue(values, 'currency_block', 'currency');
        }
        catch (error) {
            errors.currency_block = '通貨を選択してください';
        }
        try {
            const raw = this.getInputValue(values, 'usage_date_block', 'usage_date');
            usageDate = this.parseUsageDate(raw);
        }
        catch (error) {
            errors.usage_date_block = '利用日は YYYY-MM-DD 形式で入力してください';
        }
        const remarks = this.getOptionalInputValue(values, 'remarks_block', 'remarks') ?? '';
        if (Object.keys(errors).length > 0 || !usageDate) {
            throw new errors_1.SubmissionValidationError(errors);
        }
        return {
            expenseTitle,
            amount,
            usageDate,
            remarks,
            currency,
        };
    }
    resolveSheetTargetBySpreadsheetId(spreadsheetId, fallbackTab) {
        const sheet = this.config.google.sheet;
        if (sheet.spreadsheetId === spreadsheetId) {
            if (sheet.tabName === fallbackTab) {
                return sheet;
            }
            return { ...sheet, tabName: fallbackTab };
        }
        // fallback to provided identifiers without gid information
        return { spreadsheetId, tabName: fallbackTab };
    }
    getInputValue(values, blockId, actionId) {
        const block = values[blockId]?.[actionId];
        const value = block?.value;
        if (!value) {
            throw new Error(`Missing required field: ${blockId}.${actionId}`);
        }
        return value.trim();
    }
    getOptionalInputValue(values, blockId, actionId) {
        const block = values[blockId]?.[actionId];
        return block?.value?.trim();
    }
    getSelectValue(values, blockId, actionId) {
        const block = values[blockId]?.[actionId];
        const value = block?.selected_option?.value;
        if (!value) {
            throw new Error(`Missing required select field: ${blockId}.${actionId}`);
        }
        return String(value);
    }
    parseAmount(raw) {
        const normalized = raw.replace(/[^0-9.]/g, '');
        const amount = Number(normalized);
        if (Number.isNaN(amount) || amount <= 0) {
            throw new Error('金額は正の数値で入力してください');
        }
        return amount;
    }
    parseUsageDate(raw) {
        const trimmed = raw.trim();
        const isoCandidate = `${trimmed}T00:00:00`;
        const date = (0, date_fns_1.parseISO)(isoCandidate);
        if (Number.isNaN(date.getTime())) {
            throw new Error('利用日は YYYY-MM-DD 形式で入力してください');
        }
        return date;
    }
    async downloadSlackFile(url) {
        const response = await (0, undici_1.fetch)(url, {
            headers: {
                Authorization: `Bearer ${this.config.slack.botToken}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Slack file download failed: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    async getRequestByThreadTs(threadTs) {
        const cached = this.requestCache.get(threadTs);
        if (cached) {
            return cached;
        }
        const record = await this.sheets.findRecordByThreadTs(threadTs);
        if (record) {
            this.requestCache.set(threadTs, record);
        }
        return record;
    }
    buildSheetLink(record) {
        return record.sheetRowUrl ?? `https://docs.google.com/spreadsheets/d/${record.spreadsheetId}/edit#range=A${record.rowNumber}`;
    }
}
exports.ExpenseService = ExpenseService;
