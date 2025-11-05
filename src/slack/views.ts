import { View } from '@slack/web-api';
import { AppConfig } from '../config';

export function buildExpenseModal(config: AppConfig, userName: string): View {
  return {
    type: 'modal',
    callback_id: config.slack.modalCallbackId,
    title: {
      type: 'plain_text',
      text: '立替精算申請',
    },
    submit: {
      type: 'plain_text',
      text: '送信',
    },
    close: {
      type: 'plain_text',
      text: 'キャンセル',
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `申請者: *${userName}*`,
        },
      },
      {
        type: 'input',
        block_id: 'expense_title_block',
        label: {
          type: 'plain_text',
          text: '経費内容',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'expense_title',
          placeholder: {
            type: 'plain_text',
            text: '例: クライアント打合せランチ',
          },
        },
      },
      {
        type: 'input',
        block_id: 'currency_block',
        label: {
          type: 'plain_text',
          text: '通貨',
        },
        element: {
          type: 'static_select',
          action_id: 'currency',
          placeholder: {
            type: 'plain_text',
            text: '選択してください',
          },
          options: [
            {
              text: { type: 'plain_text', text: 'JPY (¥)' },
              value: 'JPY',
            },
            {
              text: { type: 'plain_text', text: 'USD ($)' },
              value: 'USD',
            },
          ],
          initial_option:
            config.app.currency === 'USD'
              ? { text: { type: 'plain_text', text: 'USD ($)' }, value: 'USD' }
              : { text: { type: 'plain_text', text: 'JPY (¥)' }, value: 'JPY' },
        },
      },
      {
        type: 'input',
        block_id: 'amount_block',
        label: {
          type: 'plain_text',
          text: '金額',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'amount',
          placeholder: {
            type: 'plain_text',
            text: '例: 5280',
          },
        },
      },
      {
        type: 'input',
        block_id: 'usage_date_block',
        label: {
          type: 'plain_text',
          text: '利用日 (YYYY-MM-DD)',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'usage_date',
          placeholder: {
            type: 'plain_text',
            text: '例: 2025-09-12',
          },
        },
      },
      {
        type: 'input',
        block_id: 'remarks_block',
        optional: true,
        label: {
          type: 'plain_text',
          text: '備考',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'remarks',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: '補足や共有事項があれば記載してください',
          },
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '領収書はモーダル送信後にBotからDMします。その案内に沿って *必ず同じスレッド内* にアップロードしてください。',
        },
      },
    ],
  };
}
