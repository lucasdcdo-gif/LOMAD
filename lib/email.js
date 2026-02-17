import * as postmark from 'postmark';
import logger from '../logger.js';
import * as dotenv from 'dotenv';
dotenv.config();

// Initialize Postmark Client
const apiKey = process.env.POSTMARK_API_KEY;
const senderEmail = process.env.POSTMARK_FROM_EMAIL;

let client = null;

if (apiKey && senderEmail) {
    client = new postmark.ServerClient(apiKey);
} else {
    logger.warn("Postmark API Key or Sender Email missing. Email service disabled.");
}

const appUrl = process.env.VITE_APP_URL || 'https://lvh.me:3000';

export const emailService = {
    /**
     * Send Welcome Email
     * @param {string} to - Recipient email
     * @param {string} name - User's name
     */
    async sendWelcomeEmail(to, name) {
        if (!client) return;

        try {
            const templateAlias = process.env.POSTMARK_TEMPLATE_WELCOME || 'welcome';

            await client.sendEmailWithTemplate({
                "From": senderEmail,
                "To": to,
                "TemplateAlias": templateAlias,
                "TemplateModel": {
                    "nome": name,
                    "cta_url": "https://lomad.com.br/",
                    "plans_url": "https://lomad.com.br/"
                }
            });
            logger.info(`[Email] Welcome email sent to ${to}`);
        } catch (error) {
            logger.error(`[Email] Failed to send welcome email to ${to}: ${error.message}`);
        }
    },

    /**
     * Send Transcription Ready Email
     * @param {string} to - Recipient email
     * @param {string} name - User's name
     * @param {string} meetingTitle - Meeting title
     * @param {string} meetingId - Meeting ID (for link generation)
     * @param {boolean} isParticipant - If true, slightly different messaging (optional)
     */
    async sendTranscriptionReadyEmail(to, name, meetingTitle, meetingId, isParticipant = false) {
        if (!client) return;

        try {
            const templateAlias = process.env.POSTMARK_TEMPLATE_TRANSCRIPTION_READY || 'transcription-ready';
            const meetingLink = `${appUrl}/meeting/${meetingId}`;

            await client.sendEmailWithTemplate({
                "From": senderEmail,
                "To": to,
                "TemplateAlias": templateAlias,
                "TemplateModel": {
                    "name": name,
                    "meeting_title": meetingTitle,
                    "action_url": meetingLink,
                    "is_participant": isParticipant // Template can condition content
                }
            });
            logger.info(`[Email] Transcription Ready email sent to ${to} (ID: ${meetingId})`);
        } catch (error) {
            logger.error(`[Email] Failed to send transcription email to ${to}: ${error.message}`);
        }
    }
};
