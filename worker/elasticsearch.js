
export class database {
  constructor(env) {
    this.index = 'covers'
    this.baseURL = new URL(env.ELASTIC_SEARCH_URL)
  }

  async searchCloudVision(searchString) {
    const query = {
      "size": 1024,
      "query": {
        "match": {
          "cloud_vision_text": {
            "query": searchString,
            "operator": "and"
          }
        }
      }
    }
    const hits = await this.search(this.index, query)
    return hits
  }

  async getByRedditPostId(reddit_post_id){
    const query = {
      "size": 1024,
      "query": {
        "term": {
          "reddit_post_id.keyword": {
            "value": reddit_post_id
          }
        }
      }
    }
    const hits = await this.search(this.index, query)
    return hits
  }

  async search(index, query) {
    const url = new URL(this.baseURL)
    const username = url.username
    const password = url.password
    const auth = `${username}:${password}`
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(auth)
      },
      body: JSON.stringify(query)
    }
    const response = await fetch(`${this.baseURL}/${index}/_search`, options)
    const { hits } = await response.json()
    return hits.hits
  }
  
}
