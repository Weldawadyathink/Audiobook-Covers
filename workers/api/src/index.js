/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import algoliasearch from 'algoliasearch';
import { createFetchRequester } from '@algolia/requester-fetch';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export default {
	async fetch(request, env, ctx) {
		const headers = {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
		}
		const url = new URL(request.url)




		if (url.pathname === '/') {
			return new Response('Hello AudiobookCover Enthusiasts!', {headers: headers})
		}





		const client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_SEARCH_KEY, {
			requester: createFetchRequester(),
		});
		const index = client.initIndex('bookCoverIndex')

		if (url.pathname === '/cover/bytext/' || url.pathname === '/cover/bytext') {
			const params = new URLSearchParams(url.search)
			const searchString = params.get('q')
			const hits = await index.search(searchString)
			const response_list = generate_response_object(hits)
			return new Response(JSON.stringify(response_list), {headers: headers})
		}
		return new Response('404 not found', {status: 404, statusText: 'Not Found'})
	},
};


function generate_response_object(hits) {
	const base_download_url = "https://download-v2.audiobookcovers.com"
	let response_list = []
	for (const hit of hits["hits"]) {
		response_list.push({
			"filename": `${base_download_url}/original/${hit["objectID"]}.${hit["extension"]}`,
			"versions": {
				"webp": {
					"200": `${base_download_url}/webp/200/${hit["objectID"]}.webp`,
					"500": `${base_download_url}/webp/500/${hit["objectID"]}.webp`,
					"1000": `${base_download_url}/webp/1000/${hit["objectID"]}.webp`,
					"original": `${base_download_url}/webp/original/${hit["objectID"]}.webp`
				},
				"jpeg": {
					"200": `${base_download_url}/jpg/200/${hit["objectID"]}.jpg`,
					"500": `${base_download_url}/jpg/500/${hit["objectID"]}.jpg`,
					"1000": `${base_download_url}/jpg/1000/${hit["objectID"]}.jpg`,
					"original": `${base_download_url}/jpg/original/${hit["objectID"]}.jpg`
				},
				"png": {
					"200": `${base_download_url}/png/200/${hit["objectID"]}.png`,
					"500": `${base_download_url}/png/500/${hit["objectID"]}.png`,
					"1000": `${base_download_url}/png/1000/${hit["objectID"]}.png`,
					"original": `${base_download_url}/png/original/${hit["objectID"]}.png`
				}
			},
			"source": "URL Source not yet implemented"
		})
	}
	console.log(response_list)
	return response_list
}