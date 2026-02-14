import { isDemoMode } from './config/demoMode.js';
import store from './repositories/inMemoryStore.js';
import fs from 'fs';

const logError = (err) => {
    const msg = `ERROR: ${err.message}\nSTACK: ${err.stack}\n`;
    fs.writeFileSync('debug-error.log', msg);
    console.error(msg);
};

const run = async () => {
    try {
        console.log('Starting debug...');
        if (isDemoMode) {
            console.log('Initializing store...');
            await store.init();
            console.log('Store initialized.');
        } else {
            console.log('Not in demo mode?');
        }
    } catch (err) {
        logError(err);
    }
};

run();
