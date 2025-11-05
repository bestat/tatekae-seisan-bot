"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bolt_1 = require("@slack/bolt");
const config_1 = require("./config");
const logger_1 = require("./logger");
const auth_1 = require("./google/auth");
const sheets_1 = require("./google/sheets");
const drive_1 = require("./google/drive");
const expense_service_1 = require("./services/expense-service");
const views_1 = require("./slack/views");
const errors_1 = require("./services/errors");
async function bootstrap() {
    const config = (0, config_1.loadConfig)();
    const googleClients = await (0, auth_1.createGoogleClients)(config);
    const sheetsService = new sheets_1.SheetsService(googleClients.sheets, config);
    const driveService = new drive_1.DriveService(googleClients.drive, config);
    const app = new bolt_1.App({
        token: config.slack.botToken,
        appToken: config.slack.appToken,
        socketMode: true,
    });
    const expenseService = new expense_service_1.ExpenseService(config, sheetsService, driveService, app.client);
    app.shortcut(config.slack.modalShortcutCallbackId, async ({ ack, body, client }) => {
        await ack();
        try {
            const userInfo = await client.users.info({ user: body.user.id });
            const userName = userInfo.user?.profile?.real_name ||
                userInfo.user?.profile?.display_name ||
                body.user.username ||
                body.user.id;
            const view = (0, views_1.buildExpenseModal)(config, userName ?? body.user.id);
            await client.views.open({
                trigger_id: body.trigger_id,
                view,
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to open expense modal');
        }
    });
    app.view(config.slack.modalCallbackId, async ({ ack, body, view, client }) => {
        let parsed;
        try {
            parsed = expenseService.parseSubmission(view);
        }
        catch (error) {
            if (error instanceof errors_1.SubmissionValidationError) {
                await ack({
                    response_action: 'errors',
                    errors: error.errors,
                });
                return;
            }
            await ack();
            logger_1.logger.error(error, 'Failed to parse submission');
            await client.chat.postMessage({
                channel: body.user.id,
                text: '申請の処理中にエラーが発生しました。もう一度お試しください。',
            });
            return;
        }
        await ack();
        try {
            await expenseService.handleModalSubmission({ userId: body.user.id, view }, parsed);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to handle expense submission');
            await client.chat.postMessage({
                channel: body.user.id,
                text: '申請の保存中にエラーが発生しました。管理者に連絡してください。',
            });
        }
    });
    // Handle file uploads posted in threads. Slack may send these as
    // - message with subtype 'file_share' (files on the top level), or
    // - message with subtype 'message_replied' where the actual files are nested under `message.files`.
    app.event('message', async ({ event }) => {
        const raw = event;
        // Ignore bot/self and non-file-related message subtypes early
        const subtype = raw.subtype;
        const nested = subtype === 'message_replied' && raw.message ? raw.message : undefined;
        const source = nested ?? raw;
        const user = source.user;
        const files = source.files ?? [];
        // Only continue when this looks like a user file upload
        if (!user || raw.bot_id) {
            return;
        }
        if (files.length === 0) {
            return;
        }
        await expenseService.handleReceiptMessage({
            user,
            files,
            channel: raw.channel,
            thread_ts: source.thread_ts ?? raw.thread_ts ?? raw.ts,
            ts: source.ts ?? raw.ts,
            text: source.text ?? raw.text,
        });
    });
    app.event('reaction_added', async ({ event }) => {
        await expenseService.handleReaction(event);
    });
    app.command('/expense-complete', async ({ ack, body, respond }) => {
        await ack();
        try {
            const message = await expenseService.handleCompleteCommand({
                user_id: body.user_id,
                text: body.text,
                response_url: body.response_url,
            });
            await respond(message);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to complete expense');
            await respond('完了処理中にエラーが発生しました。');
        }
    });
    await app.start(Number(process.env.PORT) || 3000);
    logger_1.logger.info('⚡️ Expense bot is running');
}
bootstrap().catch((error) => {
    logger_1.logger.error(error, 'Fatal error while starting the app');
    process.exit(1);
});
