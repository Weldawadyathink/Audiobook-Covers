
import { ResponseManager } from './responseManager';

export default {
  async fetch(request, env) {
    const manager = new ResponseManager(env)
    const url = new URL(request.url)
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
    }
    if (url.pathname === '/') {
      return new Response('Hello AudiobookCover Enthusiasts!', {headers: headers})
    }
    if (url.pathname === '/cover/bytext/' || url.pathname === '/cover/bytext') {
      const params = new URLSearchParams(url.search)
      const searchString = params.get('q')
      const covers = await manager.getCoversByText(searchString)
      return new Response(JSON.stringify(covers), {headers: headers})
    }
    if (url.pathname === '/cover/byredditpostid/' || url.pathname === '/cover/byredditpostid') {
      const params = new URLSearchParams(url.search)
      const postId = params.get('q')
      const covers = await manager.getCoversByRedditId(postId)
      return new Response(JSON.stringify(covers), {headers: headers})
    }
    return new Response('Not found', {status: 404, statusText: 'Not Found'})
  }
}
