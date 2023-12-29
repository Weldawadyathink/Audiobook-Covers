/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { v1 as uuidv1 } from 'uuid';

import algoliasearch from 'algoliasearch';
import { createFetchRequester } from '@algolia/requester-fetch';

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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





		if (url.pathname === '/cover/bytext/' || url.pathname === '/cover/bytext') {
			index = get_algolia_index(env)
			const params = new URLSearchParams(url.search)
			const searchString = params.get('q')
			const hits = await index.search(searchString)
			const response_list = generate_response_object(hits)
			return new Response(JSON.stringify(response_list), {headers: headers})
		}






		if (url.pathname === '/upload/cover' || url.pathname === '/upload/cover/') {
			const params = new URLSearchParams(url.search)
			const source_url = new URL(params.get('source'))
			const extension = params.get('extension')

			if (source_url === '' || extension === ''){
				return new Response('Missing url parameters', {status: 422, statusText: 'Missing url parameters'})
			}

			const index = get_algolia_index(env)
			let unique = false
			let newUUID = null
			while (!unique) {
				newUUID = uuidv1()
				unique = await check_uuid_in_algolia(index, newUUID)
				console.log(unique)
				unique = true
			}

			const s3 = new S3Client({
				region: "us-west-1",
				credentials: {
					accessKeyId: env.AWS_ACCESS_KEY_ID,
					secretAccessKey: env.AWS_SECREST_ACCESS_KEY
				}
			})

			const s3_url_params = {
				Bucket: 'com-audiobookcovers-uploads',
				Key: `${extension}|${newUUID}|${source_url}`,
				ACL: 'bucket-owner-full-control'
			}
			const command = new GetObjectCommand(s3_url_params)
			const signed_url = await getSignedUrl(s3, command, { expiresIn: 60*5 })
			const response = {
				key: s3_url_params['Key'],
				url: signed_url
			}
			return new Response(response)
		}





		return new Response('404 not found', {status: 404, statusText: 'Not Found'})
	},
};




async function check_uuid_in_algolia(index, uuid) {
	/**
     * Checks if a given UUID exists in the Algolia index.
     * 
     * @param {object} index - The Algolia index object.
     * @param {string} uuid - The UUID to check.
     * @returns {boolean} True if the UUID is valid and usable, false if it is a duplicate.
     */
	try{
		const response = await index.getObject(uuid, {
			attributesToRetrieve: ['objectID']
		});
	} catch(error) {
		if (!error.message.includes("ObjectID does not exist")) {
			throw error
		} else {
			// If it errors, uuid is not in index and therefore is valid
			return true
		}
	}
	// If error was not thrown, the uuid exists in the index, and therefore is not valid
	return false
}





function get_algolia_index(env) {
	const client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_SEARCH_KEY, {
		requester: createFetchRequester(),
	});
	return client.initIndex('bookCoverIndex')
}







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
	return response_list
}