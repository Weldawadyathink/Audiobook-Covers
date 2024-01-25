import { extract } from '@extractus/feed-extractor';

import { neon } from '@neondatabase/serverless';

export default {
	async scheduled(request, env, ctx) {
		const feed = await extract('https://www.reddit.com/r/AudiobookCovers/new.rss');
		const reddit_ids = feed.entries.map((item) => {
			return item.id.split('_')[1];
		});
		const sql = neon(env.DATABASE);
		for (const id of reddit_ids) {
			await sql`
				INSERT INTO reddit_post(post_id) 
				VALUES (${id})
				ON CONFLICT DO NOTHING
			`;
		}
	},
};
