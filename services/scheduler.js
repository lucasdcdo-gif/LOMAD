import cron from 'node-cron';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // MUST use Service Role Key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        const { data: users, error } = await supabase
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

        if (events.length === 0) return; // No meetings soon

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
    const meetingUrl = event.meeting_url;
    const startTime = new Date(event.start_time).getTime();

    if (!meetingUrl) return; // Can't join without URL

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
            return;
        }

        // 2. Schedule the Bot
        // Join 2 minutes before
        let joinTime = new Date(startTime - 2 * 60 * 1000);
        if (joinTime < new Date()) joinTime = new Date(); // If late, join now

        const botName = user.bot_name || "LOMAD Assistant";

        const createRes = await axios.post(`${RECALL_BASE_URL}/bot/`, {
            meeting_url: meetingUrl,
            bot_name: botName,
            join_at: joinTime.toISOString(),
            metadata: {
                user_id: user.id,
                event_id: eventId,
                source: 'auto_scheduler'
            },
            recording_mode: 'audio_video' // Enforce premium recording
        }, {
            headers: { Authorization: `Token ${RECALL_API_KEY}` }
        });

        log(`Scheduled bot for ${user.id} -> ${event.title} (ID: ${createRes.data.id})`);

    } catch (err) {
        if (err.response && err.response.status === 422) {
            // Already passed or invalid url
            console.warn(`[Scheduler] Skipped invalid event ${eventId}: ${JSON.stringify(err.response.data)}`);
        } else {
            console.error(`[Scheduler] Failed to schedule ${eventId}: ${err.message}`);
        }
    }
}

// Start the Cron Job
// Schedule: Every 5 minutes */5 * * * *
export const startScheduler = () => {
    log("Initializing Job Scheduler...");
    cron.schedule('*/5 * * * *', () => {
        checkUpcomingMeetings();
    });

    // Custom: Run immediately on start (optional, good for dev testing)
    // checkUpcomingMeetings();
};
