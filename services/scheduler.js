import cron from 'node-cron';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { emailService } from '../lib/email.js';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Lazy Init
let supabase = null;

const getSupabase = () => {
    if (supabase) return supabase;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; // Fallback
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Matching server.js

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error("[Scheduler] Missing Supabase Credentials. skipping...");
        return null;
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    return supabase;
};

const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1';
const RECALL_API_KEY = process.env.RECALL_API_KEY;

// Helper: Log with Timestamp
const log = (msg) => console.log(`[Scheduler ${new Date().toISOString().substring(11, 19)}] ${msg}`);

/**
 * Main Job to Check Upcoming Meetings
 * Runs every 5 minutes to catch meetings starting soon.
 */
async function checkUpcomingMeetings() {
    log("Starting automated join check...");

    try {
        // 1. Get Qualified Users (PRO/PLUS with connected calendar)
        // We only automate for paid users as per busines rules.
        const sb = getSupabase();
        if (!sb) return; // Skip if no db

        const { data: users, error } = await sb
            .from('profiles')
            .select('id, recall_id, bot_name, role, calendar_connected')
            .eq('calendar_connected', true)
            .in('role', ['PRO', 'PRO_PLUS', 'LOMAD_PLUS']);

        if (error) throw new Error("Supabase Fetch Error: " + error.message);
        if (!users || users.length === 0) {
            log("No eligible users found for auto-join.");
            return;
        }

        log(`Found ${users.length} eligible users. Processing...`);

        // 2. Process each user
        for (const user of users) {
            await processUserMeetings(user);
        }

    } catch (err) {
        console.error("[Scheduler Error]", err.message);
    }
}

/**
 * Process a single user's calendar
 */
async function processUserMeetings(user) {
    try {
        // A. Authenticate with Recall to see their calendar
        const authRes = await axios.post(`${RECALL_BASE_URL}/calendar/authenticate/`,
            { user_id: user.id },
            { headers: { Authorization: `Token ${RECALL_API_KEY}` } }
        );
        const calendarToken = authRes.data.token;

        // B. Get Upcoming Meetings (Next 20 minutes)
        // Providing a small window prevents scheduling too far in advance (allowing changes).
        const now = new Date();
        const futureWindow = new Date(now.getTime() + 20 * 60 * 1000); // 20 mins from now

        const meetingsRes = await axios.get(`${RECALL_BASE_URL}/calendar/meetings/`, {
            params: {
                start_time: now.toISOString(),
                end_time: futureWindow.toISOString()
            },
            headers: {
                'x-recallcalendarauthtoken': calendarToken, // User-scoped access
                'accept': 'application/json'
            }
        });

        const events = meetingsRes.data.results || meetingsRes.data || [];

        log(`[Scheduler] User ${user.id} - Window: ${now.toISOString()} to ${futureWindow.toISOString()}`);
        log(`[Scheduler] User ${user.id} - Events Found: ${events.length}`);

        if (events.length === 0) {
            // DEBUG: Log raw response if empty to ensure structure is correct
            // log(`[Scheduler] Raw Response: ${JSON.stringify(meetingsRes.data)}`);
            return;
        }

        // C. Check and Schedule
        for (const event of events) {
            await scheduleBotForEvent(user, event);
        }

    } catch (err) {
        // Log primarily user-related errors (e.g. Auth failed if they disconnected in Recall but not LOMAD)
        console.error(`[Scheduler] Error processing user ${user.id}: ${err.message}`);
    }
}

/**
 * Schedule a bot for a specific event if not already scheduled
 */
async function scheduleBotForEvent(user, event) {
    const eventId = event.id;
    let meetingUrl = event.meeting_url;
    const startTime = new Date(event.start_time).getTime();

    // DEBUG: Log event details
    // log(`[Scheduler] Checking Event: ${event.title} (${eventId}) - URL: ${meetingUrl}`);

    // Fallback: If no meeting_url, try to extract from platform specific invites
    if (!meetingUrl) {
        // 1. Google Meet
        if (event.meet_invite && event.meet_invite.meeting_id) {
            meetingUrl = `https://meet.google.com/${event.meet_invite.meeting_id}`;
            log(`[Scheduler] Constructed Google Meet URL: ${meetingUrl}`);
        }
        // 2. Zoom
        else if (event.zoom_invite && event.zoom_invite.join_url) {
            meetingUrl = event.zoom_invite.join_url;
            log(`[Scheduler] Found Zoom URL: ${meetingUrl}`);
        }
        // 3. Microsoft Teams
        else if (event.teams_invite && event.teams_invite.join_url) {
            meetingUrl = event.teams_invite.join_url;
            log(`[Scheduler] Found Teams URL: ${meetingUrl}`);
        }
    }

    // Fallback 2: Extract from location or description (Regex)
    if (!meetingUrl) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        // Check Location
        if (event.location) {
            const locMatch = event.location.match(urlRegex);
            if (locMatch) {
                meetingUrl = locMatch[0];
                log(`[Scheduler] Found URL in Location: ${meetingUrl}`);
            }
        }

        // Check Description (if still null)
        if (!meetingUrl && event.description) {
            const descMatch = event.description.match(urlRegex);
            if (descMatch) {
                meetingUrl = descMatch[0];
                log(`[Scheduler] Found URL in Description: ${meetingUrl}`);
            }
        }
    }

    if (!meetingUrl) {
        log(`[Scheduler] Skipping ${event.title} - No Meeting URL found.`);
        // DEBUG: Log full event to see where the URL is
        log(`[Scheduler] Event Dump: ${JSON.stringify(event)}`);
        return;
    }

    // 1. Idempotency Check (Avoid duplicates)
    // We check Supabase if we already created a 'scheduled' meeting or if we already have a bot for this time.
    // Ideally, we consult Recall's "upcoming bots" but that's expensive.
    // Instead, we trust our 'meetings' table or a new 'bot_schedules' table.
    // For V1, let's query Recall for bots with this meeting URL scheduled in the future range.
    // Actually, simplest is to check if we already have a meeting record with this 'meeting_url' that is recent.

    // NOTE: Recall allows listing bots. Filter by metadata is best.
    // GET /api/v1/bot/?metadata__event_id=...

    try {
        const botsRes = await axios.get(`${RECALL_BASE_URL}/bot/`, {
            params: {
                'metadata__event_id': eventId, // Identify by Calendar Config ID
                'status__in': 'scheduled,joining,in_waiting_room,recording'
            },
            headers: { Authorization: `Token ${RECALL_API_KEY}` }
        });

        if (botsRes.data.results && botsRes.data.results.length > 0) {
            // Bot already scheduled/active
            const bot = botsRes.data.results[0];
            log(`[Scheduler] Skipping ${event.title} - Bot already exists (ID: ${bot.id}, Status: ${bot.status_changes[bot.status_changes.length - 1]?.status}).`);
            return;
        }

        // 2. Schedule the Bot
        // Join 2 minutes before
        let joinTime = new Date(startTime - 2 * 60 * 1000);
        if (joinTime < new Date()) joinTime = new Date(); // If late, join now

        const botName = user.bot_name || "LOMAD Assistant";

        const payload = {
            meeting_url: meetingUrl,
            bot_name: botName,
            join_at: joinTime.toISOString(),
            metadata: {
                user_id: user.id,
                event_id: eventId,
                source: 'auto_scheduler'
            }
        };

        log(`[Scheduler] Scheduling Bot Payload: ${JSON.stringify(payload)}`);

        const createRes = await axios.post(`${RECALL_BASE_URL}/bot/`, payload, {
            headers: { Authorization: `Token ${RECALL_API_KEY}` }
        });

        log(`Scheduled bot for ${user.id} -> ${event.title} (ID: ${createRes.data.id})`);

    } catch (err) {
        if (err.response) {
            // Log full response data for API errors
            log(`[Scheduler] API Error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
            if (err.response.status === 422) {
                console.warn(`[Scheduler] Skipped invalid event ${eventId}: ${JSON.stringify(err.response.data)}`);
            }
        } else {
            console.error(`[Scheduler] Failed to schedule ${eventId}: ${err.message}`);
        }
    }
}

/**
 * Job to Check and Send Welcome Emails
 * Runs every 3 minutes for users with opl = 0
 */
async function checkWelcomeEmails() {
    log("Checking for unsent welcome emails...");
    try {
        const sb = getSupabase();
        if (!sb) return;

        // Note: Make sure the 'email' exists on profiles depending on user logic
        const { data: users, error } = await sb
            .from('profiles')
            .select('id, email, name')
            .eq('opl', 0);

        if (error) {
            console.error("[Scheduler] Fetch users for welcome email error:", error.message);
            return;
        }

        if (!users || users.length === 0) {
            return;
        }

        log(`Found ${users.length} users pending welcome email.`);

        for (const user of users) {
            if (user.email) {
                log(`Sending welcome email to ${user.email}`);
                await emailService.sendWelcomeEmail(user.email, user.name || 'Usuário');

                // Update opl to 1 on success
                const { error: updateError } = await sb
                    .from('profiles')
                    .update({ opl: 1 })
                    .eq('id', user.id);

                if (updateError) {
                    console.error(`[Scheduler] Failed to update OPL to 1 for ${user.id}:`, updateError.message);
                } else {
                    log(`Updated OPL to 1 for user ${user.id}`);
                }
            } else {
                // If user has no email, mark opl=1 to avoid retrying endlessly
                await sb.from('profiles').update({ opl: 1 }).eq('id', user.id);
            }
        }
    } catch (err) {
        console.error("[Scheduler] Error in checkWelcomeEmails:", err.message);
    }
}

/**
 * Job to Check and Send Transcription Emails
 * Runs every 5 minutes for meetings with opl = 0 and summary complete
 */
async function checkTranscriptionEmails() {
    log("Checking for unsent transcription emails...");
    try {
        const sb = getSupabase();
        if (!sb) return;

        // Fetch meetings that have opl = 0 and are NOT 'Processando...'
        const { data: meetings, error } = await sb
            .from('meetings')
            .select('id, user_id, title, summary')
            .eq('opl', 0)
            .neq('summary', 'Processando...')
            .not('summary', 'is', null);

        if (error) {
            console.error("[Scheduler] Fetch meetings for emails error:", error.message);
            return;
        }

        if (!meetings || meetings.length === 0) {
            return;
        }

        log(`Found ${meetings.length} meetings pending transcription email.`);

        for (const meeting of meetings) {
            log(`Processing emails for meeting: ${meeting.id}`);

            // 1. Get owner profile
            const { data: owner } = await sb
                .from('profiles')
                .select('id, email, name, role')
                .eq('id', meeting.user_id)
                .single();

            if (owner && owner.email) {
                const isFree = owner.role === 'FREE';
                const isPro = owner.role === 'PRO';
                const isProPlus = owner.role === 'PRO_PLUS';
                const isLomadPlus = owner.role === 'LOMAD_PLUS';
                const shouldNotifyOwner = isFree || isPro || isProPlus || isLomadPlus;
                const shouldNotifyParticipants = isProPlus || isLomadPlus;

                // Notify Owner
                if (shouldNotifyOwner) {
                    await emailService.sendTranscriptionReadyEmail(
                        owner.email,
                        owner.name || 'Usuário',
                        meeting.title || 'Reunião Processada',
                        meeting.id,
                        false
                    );
                    log(`Transcription email sent to owner ${owner.email}`);
                }

                // 2. Notify Participants (if owner plan allows)
                if (shouldNotifyParticipants) {
                    const { data: participants } = await sb
                        .from('meeting_access')
                        .select('email, user_id')
                        .eq('meeting_id', meeting.id)
                        .eq('status', 'accepted');

                    if (participants && participants.length > 0) {
                        for (const p of participants) {
                            if (!p.email) continue;

                            // Find name if user_id exists
                            let participantName = 'Participante';
                            if (p.user_id) {
                                const { data: pProfile } = await sb.from('profiles').select('name').eq('id', p.user_id).single();
                                if (pProfile?.name) participantName = pProfile.name;
                            } else {
                                // Try fallback finding by email
                                const { data: pProfileEmail } = await sb.from('profiles').select('name').eq('email', p.email).single();
                                if (pProfileEmail?.name) participantName = pProfileEmail.name;
                            }

                            await emailService.sendTranscriptionReadyEmail(
                                p.email,
                                participantName,
                                meeting.title || 'Reunião Compartilhada',
                                meeting.id,
                                true
                            );
                            log(`Transcription email sent to participant ${p.email}`);
                        }
                    }
                }
            }

            // 3. Mark meeting opl = 1 (even if owner didn't have email to avoid infinite loops)
            const { error: updateError } = await sb
                .from('meetings')
                .update({ opl: 1 })
                .eq('id', meeting.id);

            if (updateError) {
                console.error(`[Scheduler] Failed to update OPL to 1 for meeting ${meeting.id}:`, updateError.message);
            } else {
                log(`Updated OPL to 1 for meeting ${meeting.id}`);
            }
        }
    } catch (err) {
        console.error("[Scheduler] Error in checkTranscriptionEmails:", err.message);
    }
}

// --- NEW JOB: Fetch Participants for Completed Meetings ---
async function checkMeetingParticipants() {
    log("Checking for meetings to fetch participants...");
    try {
        const sb = getSupabase();
        if (!sb) return;

        const { data: meetings, error } = await sb
            .from('meetings')
            .select(`
                id,
                recall_id,
                summary,
                OPLgetpeople
            `)
            .eq('OPLgetpeople', 0)
            .neq('summary', 'Processando...')
            .not('summary', 'is', null);

        if (error) {
            console.error("[Scheduler] Fetch meetings for participants error:", error.message);
            return;
        }

        if (!meetings || meetings.length === 0) return;

        log(`Found ${meetings.length} meetings pending participant fetch.`);

        const RECALL_API_KEY = process.env.RECALL_API_KEY;
        if (!RECALL_API_KEY) {
            console.error("[Scheduler] Missing RECALL_API_KEY for fetching participants.");
            return;
        }

        for (const meeting of meetings) {
            try {
                if (!meeting.recall_id) continue;

                log(`Fetching participants for meeting recall_id: ${meeting.recall_id}`);
                const { data: botInfo } = await axios.get(`https://us-west-2.recall.ai/api/v1/bot/${meeting.recall_id}/`, {
                    headers: { Authorization: `Token ${RECALL_API_KEY}` }
                });

                let participantsArray = null;

                if (botInfo.recordings && botInfo.recordings.length > 0) {
                    const downloadUrl = botInfo.recordings[0]?.media_shortcuts?.participant_events?.data?.participants_download_url;

                    if (downloadUrl) {
                        log(`Found participants URL, downloading...`);
                        const { data: participantsData } = await axios.get(downloadUrl);

                        if (Array.isArray(participantsData)) {
                            participantsArray = participantsData
                                .filter(p => p.name)
                                .map(p => ({ id: p.id, name: p.name, email: p.email }));
                        }
                    }
                }

                const { error: updateError } = await sb
                    .from('meetings')
                    .update({
                        participants: participantsArray,
                        OPLgetpeople: 1
                    })
                    .eq('id', meeting.id);

                if (updateError) {
                    console.error(`[Scheduler] Failed to update participants for meeting ${meeting.id}:`, updateError.message);
                } else {
                    log(`Successfully fetched and saved participants for meeting ${meeting.id} (Total: ${participantsArray?.length || 0})`);
                }

            } catch (pErr) {
                console.error(`[Scheduler] Error fetching participants for meeting ${meeting.id}:`, pErr.message);

                // Set OPLgetpeople to 1 even on failure to avoid infinite crash loops if the bot is deleted/non-existent (404)
                if (pErr.response && pErr.response.status === 404) {
                    await sb.from('meetings').update({ OPLgetpeople: 1 }).eq('id', meeting.id);
                }
            }
        }
    } catch (err) {
        console.error("[Scheduler] Error in checkMeetingParticipants:", err.message);
    }
}


// Start the Cron Job
// Schedule: Every 5 minutes */5 * * * *
export const startScheduler = () => {
    log("Initializing Job Scheduler...");
    cron.schedule('*/5 * * * *', () => {
        checkUpcomingMeetings();
    });

    // Welcome Email Job: Every 3 minutes
    cron.schedule('*/3 * * * *', () => {
        checkWelcomeEmails();
    });

    // Transcription Ready Email Job: Every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        checkTranscriptionEmails();
    });

    // Participant Fetch Job: Every 2 minutes
    cron.schedule('*/2 * * * *', () => {
        checkMeetingParticipants();
    });

    // Custom: Run immediately on start (optional, good for dev testing)
    // checkUpcomingMeetings();
};
