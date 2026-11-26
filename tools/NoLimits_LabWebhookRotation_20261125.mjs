// NoLimits LAB only: new CAL_WEBHOOK_SECRET for nolimits-alias-staging and its
// webhook on the hidden Cal.com LAB event type. Never touches the regular Worker,
// its webhook or any other event type. Runs only in the operator's own terminal.
//
//   node tools/NoLimits_LabWebhookRotation_20261125.mjs preflight
//   node tools/NoLimits_LabWebhookRotation_20261125.mjs rotate --execute
//
// The LAB Worker must be closed (workers.dev and previews off), so no delivery can be
// lost and one secret change is enough. The new secret exists only in this process.
// Existing webhooks are never listed or read: all webhooks OF THE LAB EVENT TYPE are
// deleted blindly and one new webhook is created. Response bodies are discarded unread.
// Repeating the command is safe. Delivery is proven only by a later LAB test booking.
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { Abort, CONFIG, checkConnections, createContext, describeError, promptHidden, unsafeEnvironment }
  from './NoLimits_WebhookSecretRotation_20261125.mjs';

export const LAB = Object.freeze({
  script: 'nolimits-alias-staging',
  eventTypeId: 7982460,
  webhookUrl: 'https://nolimits-alias-staging.broken-haze-6cad.workers.dev/api/webhooks/cal',
  triggers: CONFIG.triggers,
  secretName: 'CAL_WEBHOOK_SECRET',
});
const stop = (message) => { throw new Abort(message); };
const webhooksPath = '/event-types/' + LAB.eventTypeId + '/webhooks';

export function labContext(options) {
  return createContext({ ...options, config: LAB });
}
async function closed(ctx) {
  const s = await ctx.cf('/workers/scripts/' + LAB.script + '/subdomain');
  if (s?.enabled !== false || s?.previews_enabled !== false) {
    stop('LAB-Worker ist nicht vollstaendig geschlossen (workers.dev/Previews). Erst schliessen.');
  }
}
async function latest(ctx) {
  const v = await ctx.version('latest');
  if (!v.bindings.some((b) => b.name === LAB.secretName && b.type === 'secret_text')) stop('LAB: Secret-Binding fehlt.');
  if (!v.bindings.some((b) => b.name === 'NL_ALIAS_STAGING_ONLY' && b.text === 'true')) stop('LAB: NL_ALIAS_STAGING_ONLY ist nicht true. Falscher Worker?');
  // A secret change deploys the newest version: it must already be the active one.
  const live = await ctx.active();
  if (live !== v.id) stop('LAB: neueste Version ' + v.id + ' ist nicht die aktive (' + live + '). Erst klaeren.');
  return v;
}
export async function labPreflight(ctx) {
  await closed(ctx);
  const v = await latest(ctx);
  ctx.log('OK LAB geschlossen, aktiv und neueste Version: ' + v.id);
  if (ctx.env.CAL_API_KEY) {
    // Proves that the key belongs to the account that owns the LAB event type.
    const res = await ctx.discard(await ctx.fetch('https://api.cal.com/v2/event-types/' + LAB.eventTypeId, {
      method: 'GET', redirect: 'error',
      headers: { Authorization: 'Bearer ' + ctx.env.CAL_API_KEY, 'cal-api-version': '2024-06-14' } }));
    if (!res.ok) stop('LAB-Eventtyp mit diesem Cal.com-Key nicht lesbar (HTTP ' + res.status + '). Falsches Konto?');
    ctx.log('OK Cal.com-Key sieht den LAB-Eventtyp ' + LAB.eventTypeId);
  }
  return v;
}
export async function labRotate(ctx) {
  if (!ctx.env.CAL_API_KEY) stop('CAL_API_KEY fehlt.');
  await labPreflight(ctx);
  await ctx.confirm('LAB-ROTIEREN', 'NUR LAB: neues Secret auf ' + LAB.script + ' setzen (deployt den LAB-Worker neu), ' +
    'ALLE Webhooks des Eventtyps ' + LAB.eventTypeId + ' loeschen und einen neuen anlegen?');
  const secret = crypto.randomBytes(32).toString('hex');
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  for (;;) {
    try {
      await closed(ctx);
      await ctx.cf('/workers/scripts/' + LAB.script + '/secrets', { method: 'PUT',
        body: { type: 'secret_text', name: LAB.secretName, text: secret } });
      const v = await latest(ctx);
      ctx.log('OK neues LAB-Secret gesetzt, aktive Version: ' + v.id);
      const removed = await ctx.discard(await ctx.cal(webhooksPath, 'DELETE'));
      if (!removed.ok && removed.status !== 404) stop('Alte LAB-Webhooks nicht geloescht (HTTP ' + removed.status + ').');
      const created = await ctx.discard(await ctx.cal(webhooksPath, 'POST', {
        subscriberUrl: LAB.webhookUrl + '?k=' + stamp, triggers: LAB.triggers, active: true, secret, version: '2021-10-20' }));
      if (!created.ok) stop('Neuer LAB-Webhook nicht angelegt (HTTP ' + created.status + ').');
      await closed(ctx);
      ctx.log('FERTIG. LAB-Zustellung erst beim naechsten freigegebenen LAB-Test nachgewiesen.');
      return { version: v.id };
    } catch (e) { ctx.log('FEHLER ' + (e instanceof Abort ? e.message : describeError(e, ctx.progress.step))); }
    await ctx.confirm('ERNEUT', 'LAB bleibt geschlossen. Mit demselben neuen Secret wiederholen?');
  }
}

let running = { step: 'Start' };
async function main() {
  const [command = 'preflight', ...args] = process.argv.slice(2);
  if (!['preflight', 'rotate'].includes(command)) stop('Unbekannter Befehl.');
  if (command === 'rotate' && !args.includes('--execute')) stop('Aendernder Befehl: nur mit --execute.');
  const unsafe = unsafeEnvironment(process.env, process.execArgv);
  if (unsafe.length) stop('Unsichere Einstellungen aktiv: ' + unsafe.join(', ') + '. Variablen entfernen oder neues Terminal verwenden.');
  if (!process.stdin.isTTY) stop('Nur interaktiv in einem Terminal ausfuehren (Windows: PowerShell).');
  running.step = 'Verbindungspruefung';
  await checkConnections(['api.cloudflare.com', 'api.cal.com']);
  running.step = 'Eingabe der Zugangsdaten';
  const env = {
    CF_ACCOUNT_ID: await promptHidden('Cloudflare Account-ID (Eingabe bleibt unsichtbar), dann Enter: '),
    CLOUDFLARE_API_TOKEN: await promptHidden('Cloudflare API-Token (Eingabe bleibt unsichtbar), dann Enter: '),
    CAL_API_KEY: await promptHidden('Cal.com API-Key (Eingabe bleibt unsichtbar), dann Enter: '),
  };
  const ctx = labContext({ env, confirm: async (word, question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
    const answer = await new Promise((resolve) => rl.question(question + '\nZum Fortfahren ' + word + ' eingeben: ', resolve));
    rl.close();
    if (answer.trim() !== word) stop('Nicht bestaetigt. Abbruch.');
  } });
  running = ctx.progress;
  if (command === 'preflight') await labPreflight(ctx);
  else await labRotate(ctx);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const unexpected = (e) => { console.error('ABBRUCH: ' + (e instanceof Abort ? e.message : 'unerwarteter ' + describeError(e, running.step))); process.exit(1); };
  process.on('uncaughtException', unexpected);
  process.on('unhandledRejection', unexpected);
  main().catch(unexpected);
}
