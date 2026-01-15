#!/usr/bin/env node
/**
 * Genre Maintenance Script
 *
 * This script handles:
 * 1. Importing new genres from the full genre list
 * 2. Processing missing genres collected during app runtime
 * 3. Maintaining the genre blacklist
 *
 * Usage:
 *   npm run genre-maintenance
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { processGenres } from '../src/lib/data/genre-classifier.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const MISSING_GENRES_PATH = path.resolve(APP_ROOT, './src/lib/data/missing-genres.txt');
const BLACKLIST_PATH = path.resolve(APP_ROOT, './src/lib/data/genre-blacklist.txt');
// Create RL interface for user interaction
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});
// Ensure directories exist
const ensureDirectories = () => {
	const dataDir = path.resolve(APP_ROOT, 'data');
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
};
// Process missing genres collected during runtime
const processMissingGenres = async () => {
	if (!fs.existsSync(MISSING_GENRES_PATH)) {
		console.log('No missing genres file found. Creating empty file.');
		fs.writeFileSync(MISSING_GENRES_PATH, '');
		return;
	}
	const missingGenresContent = fs.readFileSync(MISSING_GENRES_PATH, 'utf8');
	const missingGenres = new Set(
		missingGenresContent
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
	);
	if (missingGenres.size === 0) {
		console.log('No missing genres to process.');
		return;
	}
	console.log(`Found ${missingGenres.size} missing genres to process.`);
	// Create a temporary CSV file with the missing genres
	const tempCsvPath = path.resolve(APP_ROOT, 'data/temp_missing_genres.csv');
	fs.writeFileSync(tempCsvPath, 'genre\n' + Array.from(missingGenres).join('\n'));
	// Temporarily swap the full genre list path to process only missing genres
	const originalFullGenreListPath = process.env.FULL_GENRE_LIST_PATH;
	process.env.FULL_GENRE_LIST_PATH = tempCsvPath;
	try {
		// Process the missing genres
		const result = await processGenres();
		console.log(`Processed ${result.processed} missing genres`);
		if (result.unmatched > 0) {
			console.log(`${result.unmatched} genres could not be automatically matched.`);
			await promptForBlacklisting();
		}
		// Clear the missing genres file after processing
		fs.writeFileSync(MISSING_GENRES_PATH, '');
	} finally {
		// Restore the original path
		process.env.FULL_GENRE_LIST_PATH = originalFullGenreListPath;
		// Clean up temp file
		if (fs.existsSync(tempCsvPath)) {
			fs.unlinkSync(tempCsvPath);
		}
	}
};
// Interactive prompt to blacklist unmatched genres
const promptForBlacklisting = async () => {
	const unmatchedPath = path.resolve(APP_ROOT, '/src/lib/data/unmatched_genres.txt');
	if (!fs.existsSync(unmatchedPath)) {
		return;
	}
	const unmatchedContent = fs.readFileSync(unmatchedPath, 'utf8');
	const unmatchedGenres = unmatchedContent
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (unmatchedGenres.length === 0) {
		return;
	}
	console.log('\nThe following genres could not be matched:');
	unmatchedGenres.forEach((genre, index) => {
		console.log(`${index + 1}. ${genre}`);
	});
	const askQuestion = (question) => {
		return new Promise((resolve) => {
			rl.question(question, (answer) => {
				resolve(answer.trim());
			});
		});
	};
	const answer = await askQuestion(
		'\nWould you like to blacklist any of these genres? (Enter numbers separated by commas, or "all" to blacklist all): '
	);
	if (answer.toLowerCase() === 'all') {
		// Add all to blacklist
		appendToBlacklist(unmatchedGenres);
		console.log('All unmatched genres have been added to the blacklist.');
	} else if (answer.length > 0) {
		// Add selected items to blacklist
		const selectedIndices = answer
			.split(',')
			.map((index) => parseInt(index.trim(), 10) - 1)
			.filter((index) => !isNaN(index) && index >= 0 && index < unmatchedGenres.length);
		const selectedGenres = selectedIndices.map((index) => unmatchedGenres[index]);
		appendToBlacklist(selectedGenres);
		console.log(`Added ${selectedGenres.length} genres to the blacklist.`);
	}
};
// Append genres to the blacklist
const appendToBlacklist = (genres) => {
	if (!genres.length) return;
	let blacklistContent = '';
	if (fs.existsSync(BLACKLIST_PATH)) {
		blacklistContent = fs.readFileSync(BLACKLIST_PATH, 'utf8');
		if (!blacklistContent.endsWith('\n')) {
			blacklistContent += '\n';
		}
	}
	// Add the new genres
	blacklistContent += genres.join('\n') + '\n';
	// Save the updated blacklist
	fs.writeFileSync(BLACKLIST_PATH, blacklistContent);
};
// Main function
const main = async () => {
	try {
		console.log('Starting genre maintenance...');
		ensureDirectories();
		// First, process any missing genres collected during runtime
		await processMissingGenres();
		// Then process the full genre list
		console.log('\nProcessing full genre list...');
		const result = await processGenres();
		console.log(`Genre processing complete:
- Processed: ${result.processed}
- Unmatched: ${result.unmatched}
- Total new: ${result.total}`);
		if (result.unmatched > 0) {
			await promptForBlacklisting();
		}
		console.log('\nGenre maintenance completed successfully.');
	} catch (error) {
		console.error('Error during genre maintenance:', error);
	} finally {
		rl.close();
	}
};
// Run the script
main();
//# sourceMappingURL=genre-maintenance.js.map
