import boto3
from botocore.exceptions import ClientError
from algoliasearch.search_client import SearchClient
from algoliasearch.exceptions import RequestException
import json
import uuid
from fauna import fql
from fauna.client import Client
from fauna.encoding import QuerySuccess
from fauna.errors import FaunaException

def get_algolia_client():
    secret_name = "audiobookcovers/algolia/key/write"
    region_name = "us-west-1"

    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        # For a list of exceptions thrown, see
        # https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
        raise e

    secret = json.loads(get_secret_value_response['SecretString'])
    return SearchClient.create(secret['Application_ID'], secret['API_Key'])

def download_algolia_objects():
    client = get_algolia_client()
    index = client.init_index('bookCoverIndex')
    objects = index.browse_objects()
    fauna_client = get_fauna_client()
    for object in objects:
        post_id = object["source"].split("/")[-1]
        add_to_fauna(fauna_client, post_id)

def add_to_fauna(fauna_client, post_id):
    query = fql(
        """
            RedditPost.create({
                "postId": ${post_id},
                "status": "new",
            })
        """,
        post_id = post_id
    )
    try:
        fauna_client.query(query)
        print(f"Added {post_id} to fauna")
    except:
        print(f"{post_id} already in fauna")

def get_fauna_client():
    secret_name = "audiobookcovers/fauna/key/write"
    region_name = "us-west-1"

    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        # For a list of exceptions thrown, see
        # https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
        raise e

    secret = get_secret_value_response['SecretString']
    return Client(secret=secret)

def fix_fauna():
    read_client = get_fauna_client()
    write_client = get_fauna_client()
    query = fql("RedditPost.all()")
    results = read_client.query(query).data
    after = results.after
    count = fix_set(results, write_client)
    while True:
        query = fql("Set.paginate(${after})", after=after)
        results = read_client.query(query).data
        try:
            after = results["after"]
        except:
            results = results["data"]
            count = count + fix_set(results, write_client)
            print(f"Stoopid api, but {count} processed")
            break
        results = results["data"]
        count = count + fix_set(results, write_client)
    

def fix_set(set, write_client):
    count = 0
    for item in set:
        if "_" in item["postId"]:
            new_post_id = item["postId"].replace("_", "")
            write_query = fql("RedditPost.byId(${item_id}).updateData({postId: ${new_post_id}})", item_id=item.id, new_post_id=new_post_id)
            write_client.query(write_query)
            print(f"Fixed {new_post_id}")
        else:
            print(f"Skipping {item['postId']}")
        count = count + 1
    return count
    
    

if __name__ == "__main__":
    client = get_fauna_client()
    query = fql('RedditPost.where(.status == "downloaded").count()')
    finished = client.query(fql('RedditPost.where(.status == "downloaded").count()')).data
    unfinished = client.query(fql('RedditPost.where(.status == "new").count()')).data
    print(f"Downloaded {finished} of {finished+unfinished}, {unfinished} to go")
    
    