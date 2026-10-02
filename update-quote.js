const fs = require('node:fs');
const path = require('node:path');

const README_PATH = path.join(__dirname, 'README.md');
const API = 'https://citation.lecog.fr/public/api';
const START = '<!-- START_QUOTE_SECTION -->';
const END = '<!-- END_QUOTE_SECTION -->';
const MAX_LENGTH = 200;
const MAX_ATTEMPTS = 10;

async function fetchQuote(endpoint) {
	const response = await fetch(`${API}/${endpoint}`, { signal: AbortSignal.timeout(10_000) });
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	const body = await response.json();
	if (!body.success) {
		throw new Error('Réponse en échec');
	}
	return body.data;
}

// Short single-line quotes only: poems and multi-line texts do not fit a README quote.
function isUsable({ text }) {
	return text.length <= MAX_LENGTH && !/<br|[\r\n]/i.test(text);
}

// The quote of the day first, then random ones until a usable quote comes up.
async function pickQuote() {
	let quote = await fetchQuote('quote-of-the-day.php');
	for (let attempt = 0; !isUsable(quote) && attempt < MAX_ATTEMPTS; attempt++) {
		quote = await fetchQuote('random-quote.php');
	}
	if (!isUsable(quote)) {
		throw new Error('Aucune citation exploitable trouvée.');
	}
	return quote;
}

function formatQuote({ text, author, source }) {
	const name = [author.forename, author.name].filter(Boolean).join(' ');
	return `> « ${text.trim()} »\n>\n> **${name}**${source?.title ? `, *${source.title}*` : ''}`;
}

function replaceSection(readme, block) {
	const start = readme.indexOf(START);
	const end = readme.indexOf(END);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`Repères ${START} et ${END} introuvables dans le README.`);
	}
	return `${readme.slice(0, start + START.length)}\n${block}\n${readme.slice(end)}`;
}

async function main() {
	let quote;
	try {
		quote = await pickQuote();
	} catch (error) {
		// API unavailable: keep the current quote instead of failing the workflow.
		console.warn(`Citation inchangée, API indisponible : ${error.message}`);
		return;
	}

	const readme = fs.readFileSync(README_PATH, 'utf8');
	const updated = replaceSection(readme, formatQuote(quote));
	if (updated !== readme) {
		fs.writeFileSync(README_PATH, updated);
	}
	console.log(`Citation de la semaine : ${quote.author.name} (${updated === readme ? 'inchangée' : 'mise à jour'})`);
}

main();
