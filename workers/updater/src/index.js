import { extract } from '@extractus/feed-extractor';

import { Client, fql, ServiceError } from 'fauna';

export default {
	async scheduled(request, env, ctx) {
		const feed = await extract('https://www.reddit.com/r/AudiobookCovers/new.rss');
		const reddit_ids = feed.entries.map((item) => {
			return item.id.split('_')[1];
		});
		// const index = get_algolia_index(env);
		// reddit_ids.filter(check_id_in_algolia).map((id) => insert_into_algolia(index, id));
		const fauna = new Client({
			secret: env.FAUNA_SECRET,
		});

		reddit_ids.map((id) => insert_into_fauna(fauna, id));
	},
};

async function insert_into_fauna(fauna, post_id) {
	const query = fql`
		RedditPost.create({
			"postId": ${post_id},
			"status": "new",
		})
	`;
	await fauna.query(query);
}

async function insert_into_algolia(index, id) {
	index.saveObject({
		objectID: id,
		downloaded: false,
	});
}

function get_algolia_index(env) {
	const client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_SEARCH_KEY, {
		requester: createFetchRequester(),
	});
	return client.initIndex('redditPosts');
}

async function check_id_in_algolia(index, id) {
	/**
	 * Checks if a given UUID exists in the Algolia index.
	 *
	 * @param {object} index - The Algolia index object.
	 * @param {string} id - The UUID to check.
	 * @returns {boolean} True if the UUID is valid and usable, false if it is a duplicate.
	 */
	try {
		const response = await index.getObject(id, {
			attributesToRetrieve: ['objectID'],
		});
	} catch (error) {
		if (!error.message.includes('ObjectID does not exist')) {
			throw error;
		} else {
			// If it errors, id is not in index and therefore is valid
			return true;
		}
	}
	// If error was not thrown, the id exists in the index, and therefore is not valid
	return false;
}
