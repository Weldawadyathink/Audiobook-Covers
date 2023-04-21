import { database as ElasticSearch } from './elasticsearch'

export class ResponseManager {

  constructor(env) {
    this._env = env
    this._es = new ElasticSearch(env)
  }

  async logSearchInfo(searchText, numresults) {
    const info = await this._env.DB.prepare("INSERT INTO search_log (date_time, search_text, num_results) VALUES (?, ?, ?)")
                .bind(new Date(), searchText, numresults)
                .run()
    console.log(`Search for ${searchText} returned ${numresults} results. ${info.success ? 'Saved in database.' : 'Database error.'}`)
  }

  async getCoversByText(searchText) {
    const es_results = await this._es.searchCloudVision(searchText)
    const results = es_results.map(item => ({
      source: `https://redd.it/${item._source.reddit_post_id}`,
      filename: `https://r2.audiobookcovers.com/covers/${item._source.filename}`
    }))
    await this.logSearchInfo(searchText, results.length)
    return results
  }

  async getCoversByRedditId(reddit_post_id) {
    const es_results = await this._es.getByRedditPostId(reddit_post_id)
    const results = es_results.map(item => ({
      source: `https://redd.it/${item._source.reddit_post_id}`,
      filename: `https://r2.audiobookcovers.com/covers/${item._source.filename}`
    }))
    await this.logSearchInfo(`Reddit Post ID: ${reddit_post_id}`, results.length)
    return results
  }

}
