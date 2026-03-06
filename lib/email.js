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
                    "nome": name,
                    "meeting_name": meetingTitle,
                    "transcript_url": meetingLink,
                    "is_participant": isParticipant // Template can condition content
                }
            });
            logger.info(`[Email] Transcription Ready email sent to ${to} (ID: ${meetingId})`);
        } catch (error) {
            logger.error(`[Email] Failed to send transcription email to ${to}: ${error.message}`);
        }
    },

    /**
     * Send Marketing Campaign Batch
     * @param {string} templateAlias - Postmark template alias
     * @param {Array<Object>} usersData - Array of user objects from Supabase
     * @param {Array<Object>} mapping - Array of { from: string, to: string } where 'from' is Postmark var and 'to' is 'table.column'
     * @returns {Promise<Object>} - Object with success count, fail count, and processed emails
     */
    async sendMarketingCampaign(templateAlias, usersData, mapping) {
        if (!client) {
            return { error: "Postmark client is disabled." };
        }

        try {
            const messages = [];
            const processedEmails = new Set();
            let successCount = 0;
            let failCount = 0;

            for (const user of usersData) {
                if (!user.email || processedEmails.has(user.email)) continue;
                processedEmails.add(user.email);

                const templateModel = {};
                for (const map of mapping) {
                    const postmarkVar = map.from;
                    const dbFieldRaw = map.to; // e.g. "profiles.name"

                    // Simple path resolver (mostly extracts 'name' from 'profiles.name' since we only query profiles right now)
                    const parts = dbFieldRaw.split('.');
                    const fieldName = parts.length > 1 ? parts[1] : parts[0];

                    if (user[fieldName] !== undefined) {
                        // Found in database (e.g. name, email)
                        templateModel[postmarkVar] = user[fieldName];
                    } else if (parts.length > 1 && parts[0] === 'profiles') {
                        // Explicitly requested a database column but it's null/undefined
                        templateModel[postmarkVar] = "";
                    } else {
                        // Treat as a fixed value (e.g. a hardcoded URL string or fixed text)
                        templateModel[postmarkVar] = dbFieldRaw;
                    }
                }

                messages.push({
                    "From": senderEmail,
                    "To": user.email,
                    "TemplateAlias": templateAlias,
                    "TemplateModel": templateModel
                });
            }

            if (messages.length === 0) {
                return { success: 0, failed: 0, processed: 0, message: "No unique emails to process." };
            }

            // Postmark handles batches up to 500. We can chunk them if needed, 
            // but the sendEmailBatchWithTemplates handles arrays natively.
            // Let's chunk to 500 to be safe.
            const chunkSize = 500;
            for (let i = 0; i < messages.length; i += chunkSize) {
                const chunk = messages.slice(i, i + chunkSize);
                const results = await client.sendEmailBatchWithTemplates(chunk);

                // Count successes vs failures in the batch response
                results.forEach(res => {
                    if (res.ErrorCode === 0) {
                        successCount++;
                    } else {
                        failCount++;
                        logger.warn(`[Marketing Campaign] Failed to send to some recipients in batch: ${res.Message}`);
                    }
                });
            }

            logger.info(`[Marketing Campaign] Dispatch complete using template ${templateAlias}. Success: ${successCount}, Failed: ${failCount}.`);
            return {
                success: successCount,
                failed: failCount,
                processed: processedEmails.size
            };

        } catch (error) {
            logger.error(`[Marketing Campaign] Critical Failure: ${error.message}`);
            throw new Error(`Failed to dispatch campaign: ${error.message}`);
        }
    }
};
