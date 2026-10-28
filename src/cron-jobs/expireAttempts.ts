import cron from "node-cron";
import { expireOverdueAttempts } from "../attempts/attempts.controller.js";

cron.schedule('0 11-19 * * *', async () => {
    console.log('Running expiry cron at ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    await expireOverdueAttempts().catch(console.error);
    console.log('Done expiring attempts')
})
