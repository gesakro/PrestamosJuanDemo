import { createApp } from '../server/server.js';

let app;

export default async function handler(req, res) {
    if (!app) {
        app = await createApp();
    }
    // Vercel serverless function expects (req, res) handling.
    // Express 'app' is a function (req, res) => verify.
    app(req, res);
}
