import { v1 as uuidv1 } from 'uuid';

import algoliasearch from 'algoliasearch';
import { createFetchRequester } from '@algolia/requester-fetch';

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default {
	async fetch(request, env, ctx) {
		if (request.method === 'OPTIONS') {
			// Handle CORS preflight request.
			return new Response('', {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
				},
			});
		}

		const headers = {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
		};
		const url = new URL(request.url);

		if (url.pathname === '/') {
			return new Response('Hello AudiobookCover Enthusiasts!', { headers: headers });
		}

		if (url.pathname === '/cover/bytext/' || url.pathname === '/cover/bytext') {
			const index = get_algolia_index(env);
			const params = new URLSearchParams(url.search);
			const searchString = params.get('q');
			const hits = await index.search(searchString);
			const response_list = generate_response_object(hits);
			return new Response(JSON.stringify(response_list), { headers: headers });
		}

		if (url.pathname === '/upload/cover' || url.pathname === '/upload/cover/') {
			const valid_auth = 'Basic ' + btoa(env.UPLOAD_USERNAME + ':' + env.UPLOAD_PASSWORD);
			const authHeader = request.headers.get('Authorization');

			if (!authHeader || authHeader !== valid_auth) {
				return new Response('Unauthorized', {
					status: 401,
					headers: {
						'WWW-Authenticate': 'Basic realm="my realm"',
					},
				});
			}

			const params = new URLSearchParams(url.search);
			let source_url;
			try {
				source_url = new URL(params.get('source'));
			} catch (_) {
				return new Response('Improperly formatted source url', {
					status: 422,
					statusText: 'Improperly formatted source url',
					headers: headers,
				});
			}
			const extension = params.get('extension');
			console.log(extension);
			const mime_type = params.get('mime_type');

			if (source_url === null || extension === null || mime_type === null) {
				return new Response('Missing url parameters', { status: 422, statusText: 'Missing url parameters', headers: headers });
			}

			const valid_mime_types = ['image/png', 'image/jpeg', 'image/webp'];

			if (!valid_mime_types.includes(mime_type)) {
				return new Response('Invalid mime type', { status: 422, statusText: 'Invalid mime type', headers: headers });
			}

			const index = get_algolia_index(env);
			let unique = false;
			let newUUID = null;
			while (!unique) {
				newUUID = uuidv1();
				unique = await check_uuid_in_algolia(index, newUUID);
			}

			const s3 = new S3Client({
				region: 'us-west-1',
				credentials: {
					accessKeyId: env.AWS_ACCESS_KEY_ID,
					secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
				},
			});

			const expiration = 60 * 60 * 24;

			const s3_url_params = {
				Bucket: 'com-audiobookcovers-uploads',
				Key: `${extension}|${newUUID}|${source_url}`,
				ContentType: mime_type,
			};
			const command = new PutObjectCommand(s3_url_params);
			const response = {
				url: await getSignedUrl(s3, command, { expiresIn: expiration }),
			};
			return new Response(JSON.stringify(response), { headers: headers });
		}

		if (url.pathname === '/cover/id' || url.pathname === '/cover/id/') {
			const params = new URLSearchParams(url.search);
			let search_id;
			try {
				search_id = params.get('id');
			} catch (_) {
				return new Response('Incorrect or missing cover id', {
					status: 422,
					statusText: 'Incorrect or missing cover id',
					headers: headers,
				});
			}
			const index = get_algolia_index(env);
			let hit;
			try {
				hit = await index.getObject(search_id);
			} catch (error) {
				if (error.message.includes('ObjectID does not exist')) {
					return new Response('Cover ID not found', { status: 404, statusText: 'Cover ID not found', headers: headers });
				} else {
					throw error;
				}
			}
			const base_download_url = 'https://download.dev.audiobookcovers.com';
			const cover_info = {
				filename: `${base_download_url}/original/${hit['objectID']}.${hit['extension']}`,
				versions: {
					webp: {
						200: `${base_download_url}/webp/200/${hit['objectID']}.webp`,
						500: `${base_download_url}/webp/500/${hit['objectID']}.webp`,
						1000: `${base_download_url}/webp/1000/${hit['objectID']}.webp`,
						original: `${base_download_url}/webp/original/${hit['objectID']}.webp`,
					},
					jpeg: {
						200: `${base_download_url}/jpg/200/${hit['objectID']}.jpg`,
						500: `${base_download_url}/jpg/500/${hit['objectID']}.jpg`,
						1000: `${base_download_url}/jpg/1000/${hit['objectID']}.jpg`,
						original: `${base_download_url}/jpg/original/${hit['objectID']}.jpg`,
					},
					png: {
						200: `${base_download_url}/png/200/${hit['objectID']}.png`,
						500: `${base_download_url}/png/500/${hit['objectID']}.png`,
						1000: `${base_download_url}/png/1000/${hit['objectID']}.png`,
						original: `${base_download_url}/png/original/${hit['objectID']}.png`,
					},
				},
				id: hit['objectID'],
				permalink: `https://audiobookcovers.com/?id=${hit['objectID']}`,
				source: hit['source'],
			};
			return new Response(JSON.stringify(cover_info), { headers: headers });
		}

		return new Response('404 not found', { status: 404, statusText: 'Not Found', headers: headers });
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
	try {
		const response = await index.getObject(uuid, {
			attributesToRetrieve: ['objectID'],
		});
	} catch (error) {
		if (!error.message.includes('ObjectID does not exist')) {
			throw error;
		} else {
			// If it errors, uuid is not in index and therefore is valid
			return true;
		}
	}
	// If error was not thrown, the uuid exists in the index, and therefore is not valid
	return false;
}

function get_algolia_index(env) {
	const client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_SEARCH_KEY, {
		requester: createFetchRequester(),
	});
	return client.initIndex('bookCoverIndex');
}

function generate_response_object(hits) {
	const base_download_url = 'https://download.dev.audiobookcovers.com';
	let response_list = [];
	for (const hit of hits['hits']) {
		response_list.push({
			filename: `${base_download_url}/original/${hit['objectID']}.${hit['extension']}`,
			versions: {
				webp: {
					200: `${base_download_url}/webp/200/${hit['objectID']}.webp`,
					500: `${base_download_url}/webp/500/${hit['objectID']}.webp`,
					1000: `${base_download_url}/webp/1000/${hit['objectID']}.webp`,
					original: `${base_download_url}/webp/original/${hit['objectID']}.webp`,
				},
				jpeg: {
					200: `${base_download_url}/jpg/200/${hit['objectID']}.jpg`,
					500: `${base_download_url}/jpg/500/${hit['objectID']}.jpg`,
					1000: `${base_download_url}/jpg/1000/${hit['objectID']}.jpg`,
					original: `${base_download_url}/jpg/original/${hit['objectID']}.jpg`,
				},
				png: {
					200: `${base_download_url}/png/200/${hit['objectID']}.png`,
					500: `${base_download_url}/png/500/${hit['objectID']}.png`,
					1000: `${base_download_url}/png/1000/${hit['objectID']}.png`,
					original: `${base_download_url}/png/original/${hit['objectID']}.png`,
				},
			},
			id: hit['objectID'],
			permalink: `https://audiobookcovers.com/id?id=${hit['objectID']}`,
			source: hit['source'],
		});
	}
	return response_list;
}