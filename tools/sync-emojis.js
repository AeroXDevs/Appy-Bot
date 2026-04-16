import fs   from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { REST } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const col = {
    reset:  '\x1b[0m',
    bright: '\x1b[1m',
    purple: '\x1b[35m',
    white:  '\x1b[97m',
    gray:   '\x1b[90m',
    green:  '\x1b[92m',
    yellow: '\x1b[93m',
    red:    '\x1b[91m',
    cyan:   '\x1b[96m',
};

const tag  = `${col.purple}${col.bright}  [EmojiSync]${col.reset}`;
const line = `${col.purple}${col.bright}  ─────────────────────────────────────${col.reset}`;

const ICON_DIR  = path.join(__dirname, '../src/assets/icons');
const EMOJIS_JS = path.join(__dirname, '../src/lib/emojis.js');

const CUSTOM_KEYS = ['mail', 'automod', 'gift', 'setting', 'earth'];

async function syncEmojis(token) {
    if (!token) {
        console.log(`${tag} ${col.yellow}Usage: node tools/sync-emojis.js <BOT_TOKEN>${col.reset}`);
        return;
    }

    // ── Load current state from emojis.js ──────────────────────────────────────
    let E;
    try {
        const mod = await import(pathToFileURL(EMOJIS_JS).href);
        E = mod.E;
    } catch (err) {
        console.log(`${tag} ${col.red}Failed to load emojis.js: ${err.message}${col.reset}`);
        return;
    }

    console.log(line);
    console.log(`${tag} ${col.white}${col.bright}Starting emoji sync...${col.reset}`);

    const rest = new REST({ version: '10' }).setToken(token);

    // ── Fetch application info ──────────────────────────────────────────────────
    let appId;
    try {
        const app = await rest.get('/applications/@me');
        appId = app.id;
        console.log(`${tag} ${col.gray}Application: ${col.white}${app.name}${col.gray} (${appId})${col.reset}`);
    } catch (err) {
        console.log(`${tag} ${col.red}Failed to fetch application info: ${err.message}${col.reset}`);
        console.log(line);
        return;
    }

    // ── Fetch existing application emojis ──────────────────────────────────────
    let appEmojis = [];
    try {
        const res = await rest.get(`/applications/${appId}/emojis`);
        appEmojis = Array.isArray(res) ? res : (res.items ?? []);
        console.log(`${tag} ${col.gray}Config: ${col.white}${CUSTOM_KEYS.length}${col.gray} emojis  |  Application: ${col.white}${appEmojis.length}${col.gray} emojis${col.reset}`);
    } catch (err) {
        console.log(`${tag} ${col.red}Failed to fetch application emojis: ${err.message}${col.reset}`);
        console.log(line);
        return;
    }

    console.log(line);

    let skipped  = 0;
    let fixed    = 0;
    let uploaded = 0;
    let failed   = 0;
    let updated  = false;

    let content = fs.readFileSync(EMOJIS_JS, 'utf8');

    for (const key of CUSTOM_KEYS) {
        const current = E[key];
        if (!current || typeof current !== 'object') {
            console.log(`${tag} ${col.yellow}  ? ${col.white}${key}${col.yellow} — not a custom emoji entry in emojis.js, skipping${col.reset}`);
            continue;
        }

        const { id: currentId, name: currentName } = current;

        // Check by current ID first, then fall back to name match
        const existing =
            appEmojis.find(e => e.id === currentId) ??
            appEmojis.find(e => e.name.toLowerCase() === currentName.toLowerCase());

        if (existing) {
            const correctStr = `<:${existing.name}:${existing.id}>`;

            if (existing.id !== currentId || existing.name !== currentName) {
                // ID or name drifted — fix it
                content = patchEntry(content, key, existing.id, existing.name);
                updated = true;
                fixed++;
                console.log(`${tag} ${col.yellow}  ↻ ${col.white}${currentName}${col.yellow} — ID corrected (${existing.id})${col.reset}`);
            } else {
                skipped++;
                console.log(`${tag} ${col.green}  ✓ ${col.white}${currentName}${col.gray} — already present${col.reset}`);
            }
            continue;
        }

        // Not on the portal — upload from local PNG
        const pngPath = path.join(ICON_DIR, `${key}.png`);
        if (!fs.existsSync(pngPath)) {
            console.log(`${tag} ${col.red}  ✗ ${col.white}${currentName}${col.red} — no PNG at ${pngPath}, skipping${col.reset}`);
            failed++;
            continue;
        }

        console.log(`${tag} ${col.cyan}  ↑ ${col.white}${currentName}${col.cyan} — not found, uploading from ${key}.png...${col.reset}`);

        try {
            const imgBuffer = fs.readFileSync(pngPath);
            const image     = `data:image/png;base64,${imgBuffer.toString('base64')}`;
            const newEmoji  = await rest.post(`/applications/${appId}/emojis`, {
                body: { name: currentName, image },
            });
            content = patchEntry(content, key, newEmoji.id, newEmoji.name);
            updated = true;
            uploaded++;
            console.log(`${tag} ${col.green}  ✓ ${col.white}${currentName}${col.green} — uploaded (${newEmoji.id})${col.reset}`);
        } catch (err) {
            console.log(`${tag} ${col.red}  ✗ ${col.white}${currentName}${col.red} — upload failed: ${err.message}${col.reset}`);
            failed++;
        }
    }

    console.log(line);

    if (updated) {
        try {
            fs.writeFileSync(EMOJIS_JS, content, 'utf8');
            console.log(`${tag} ${col.green}${col.bright}  src/lib/emojis.js saved with updated IDs.${col.reset}`);
        } catch (err) {
            console.log(`${tag} ${col.red}  Failed to save emojis.js: ${err.message}${col.reset}`);
        }
    } else {
        console.log(`${tag} ${col.gray}  No changes — emojis.js left untouched.${col.reset}`);
    }

    const parts = [
        skipped  ? `${col.green}${skipped} present${col.reset}`   : null,
        fixed    ? `${col.yellow}${fixed} fixed${col.reset}`       : null,
        uploaded ? `${col.cyan}${uploaded} uploaded${col.reset}`   : null,
        failed   ? `${col.red}${failed} failed${col.reset}`        : null,
    ].filter(Boolean);

    console.log(`${tag}  ${parts.join('  ')}`);
    console.log(line);
}

function patchEntry(content, key, id, name) {
    const regex = new RegExp(
        `(${key}\\s*:\\s*\\{\\s*id\\s*:\\s*)"[^"]+"(\\s*,\\s*name\\s*:\\s*)"[^"]+"(\\s*,\\s*str\\s*:\\s*)"[^"]+"`
    );
    return content.replace(regex, `$1"${id}"$2"${name}"$3"<:${name}:${id}>"`);
}

export { syncEmojis };

// Run standalone: node tools/sync-emojis.js <token>
const isMain = process.argv[1] &&
    fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');
if (isMain) syncEmojis(process.argv[2]);
