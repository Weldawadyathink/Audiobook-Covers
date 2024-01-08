/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { extract } from '@extractus/feed-extractor';

export default {
	async scheduled(request, env, ctx) {
		const feed = await extract('https://www.reddit.com/r/AudiobookCovers/new.rss');
		const reddit_ids = feed.entries.map((item) => {
			return item.id.split('_')[1];
		});
		console.log(JSON.stringify(reddit_ids));
	},
};
