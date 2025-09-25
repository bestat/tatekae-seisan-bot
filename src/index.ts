import { App } from '@slack/bolt';
import { loadConfig } from './config';
import { logger } from './logger';
import { createGoogleClients } from './google/auth';
import { SheetsService } from './google/sheets';
import { DriveService } from './google/drive';
import { ExpenseService } from './services/expense-service';
import { buildExpenseModal } from './slack/views';
import { SubmissionValidationError } from './services/errors';

async function bootstrap() {
  const config = loadConfig();
  const googleClients = await createGoogleClients(config);
  const sheetsService = new SheetsService(googleClients.sheets, config);
  const driveService = new DriveService(googleClients.drive, config);

  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    appToken: config.slack.appToken,
    socketMode: true,
  });

  const expenseService = new ExpenseService(config, sheetsService, driveService, app.client);

  app.shortcut(config.slack.modalShortcutCallbackId, async ({ ack, body, client }) => {
    await ack();
    try {
      const userInfo = await client.users.info({ user: body.user.id });
      const userName =
        userInfo.user?.profile?.real_name ||
        userInfo.user?.profile?.display_name ||
        body.user.username ||
        body.user.id;
      const view = buildExpenseModal(config, userName ?? body.user.id);
      await client.views.open({
        trigger_id: body.trigger_id,
        view,
      });
    } catch (error) {
      logger.error(error, 'Failed to open expense modal');
    }
  });

  app.view(config.slack.modalCallbackId, async ({ ack, body, view, client }) => {
    let parsed;
    try {
      parsed = expenseService.parseSubmission(view);
    } catch (error) {
      if (error instanceof SubmissionValidationError) {
        await ack({
          response_action: 'errors',
          errors: error.errors,
        });
        return;
      }
      await ack();
      logger.error(error, 'Failed to parse submission');
      await client.chat.postMessage({
        channel: body.user.id,
        text: '申請の処理中にエラーが発生しました。もう一度お試しください。',
      });
      return;
    }

    await ack();

    try {
      await expenseService.handleModalSubmission({ userId: body.user.id, view }, parsed);
    } catch (error) {
      logger.error(error, 'Failed to handle expense submission');
      await client.chat.postMessage({
        channel: body.user.id,
        text: '申請の保存中にエラーが発生しました。管理者に連絡してください。',
      });
    }
  });

  app.event('message', async ({ event }) => {
    const message = event as any;
    if (message.subtype && message.subtype !== 'file_share') {
      return;
    }
    if (message.user === undefined || message.bot_id) {
      return;
    }
    const files = message.files as Array<any> | undefined;
    if (!files || files.length === 0) {
      return;
    }

    await expenseService.handleReceiptMessage({
      user: message.user,
      files,
      channel: message.channel,
      thread_ts: message.thread_ts,
      ts: message.ts,
      text: message.text,
    });
  });

  app.event('reaction_added', async ({ event }) => {
    await expenseService.handleReaction(event as any);
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
    } catch (error) {
      logger.error(error, 'Failed to complete expense');
      await respond('完了処理中にエラーが発生しました。');
    }
  });

  await app.start(Number(process.env.PORT) || 3000);
  logger.info('⚡️ Expense bot is running');
}

bootstrap().catch((error) => {
  logger.error(error, 'Fatal error while starting the app');
  process.exit(1);
});
