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
	async fetch(request, env, ctx) {
		const headers = {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
		};
		const result = await extract('https://www.reddit.com/r/AudiobookCovers/.rss');
		return new Response(JSON.stringify(result), { headers: headers });
	},
};
