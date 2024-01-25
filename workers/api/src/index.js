import { v1 as uuidv1 } from 'uuid';

import { neon } from '@neondatabase/serverless';

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

		const path = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
		console.log(path);

		if (path === '/') {
			return new Response('Hello AudiobookCover Enthusiasts!', { headers: headers });
		}

		if (path === '/cover/bytext') {
			const params = new URLSearchParams(url.search);
			const searchString = params.get('q');
			const sql = neon(env.DATABASE);
			const hits = await sql`
				SELECT
					id,
					extension,
					source
				FROM image
				WHERE 
					to_tsvector('english', cloud_vision_text) @@
					to_tsquery('english', ${searchString})`;
			const response_list = hits.map(generate_response_object);
			return new Response(JSON.stringify(response_list), { headers: headers });
		}

		if (path === '/cover/ai-search') {
			const params = new URLSearchParams(url.search);
			const searchString = params.get('q');
			const top_k = params.get('k') || 50;

			const clip_api_url = new URL(env.CLIP_API_URL);
			clip_api_url.pathname = '/text';
			clip_api_url.searchParams.append('q', searchString);
			clip_api_url.searchParams.append('k', top_k);
			const clip_response = await fetch(clip_api_url);
			const clip_response_json = await clip_response.json();
			const response_list = clip_response_json.matches.map(generate_response_object);
			return new Response(JSON.stringify(response_list), { headers: headers });
		}

		if (path === '/cover/random') {
			const params = new URLSearchParams(url.search);
			const top_k = params.get('k') || 50;

			const clip_api_url = new URL(env.CLIP_API_URL);
			clip_api_url.pathname = '/random';
			clip_api_url.searchParams.append('k', top_k);
			const clip_response = await fetch(clip_api_url);
			const clip_response_json = await clip_response.json();
			const response_list = clip_response_json.matches.map(generate_response_object);
			return new Response(JSON.stringify(response_list), { headers: headers });
		}

		if (path === '/upload/cover') {
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

		if (path === '/cover/id') {
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
			const sql = neon(env.DATABASE);
			const hit = await sql`
				SELECT
					id,
					extension,
					source
				FROM image
				WHERE
					id = ${search_id}`;
			let cover_info
			if (hit.length == 0) {
				cover_info = hit
			} else {
				cover_info = generate_response_object(hit[0]);
			}
			return new Response(JSON.stringify(cover_info), { headers: headers });
		}

		if (path === '/cover/similar-to') {
			const params = new URLSearchParams(url.search);
			const top_k = params.get('k') || 50;
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
			const sql = neon(env.DATABASE);
			const hits = await sql`
				SELECT ID,
					EXTENSION,
					SOURCE
				FROM image
				ORDER BY embedding <=> (
					SELECT embedding
					FROM image
					WHERE ID = ${search_id}
				)
				LIMIT ${top_k}
			`;
			const response_list = hits.map(generate_response_object);
			return new Response(JSON.stringify(response_list), { headers: headers });
		}

	},
};

function generate_response_object(item) {
	/**
	 * Returns a javascript object with all required data included
	 * Designed to have an algolia or pinecone database response
	 */
	const base_download_url = 'https://download.audiobookcovers.com';
	const id = item.id;
	const ext = item.extension || item.metadata.extension;
	const source = item.source || item.metadata.source;
	return {
		filename: `${base_download_url}/original/${id}.${ext}`,
		versions: {
			webp: {
				200: `${base_download_url}/webp/200/${id}.webp`,
				500: `${base_download_url}/webp/500/${id}.webp`,
				1000: `${base_download_url}/webp/1000/${id}.webp`,
				original: `${base_download_url}/webp/original/${id}.webp`,
			},
			jpeg: {
				200: `${base_download_url}/jpg/200/${id}.jpg`,
				500: `${base_download_url}/jpg/500/${id}.jpg`,
				1000: `${base_download_url}/jpg/1000/${id}.jpg`,
				original: `${base_download_url}/jpg/original/${id}.jpg`,
			},
			png: {
				200: `${base_download_url}/png/200/${id}.png`,
				500: `${base_download_url}/png/500/${id}.png`,
				1000: `${base_download_url}/png/1000/${id}.png`,
				original: `${base_download_url}/png/original/${id}.png`,
			},
		},
		id: id,
		permalink: `https://audiobookcovers.com/?id=${id}`,
		source: source,
	};
}
