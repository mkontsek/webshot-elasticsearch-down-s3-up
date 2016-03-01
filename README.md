# webshot-elasticsearch-down-s3-up

A simple NodeJS app that creates screenshots of websites stored in Elasticsearch and uploads them to Amazon S3.

## Usage example

### Prerequisites
- An S3 account with a Bucket already created
- An Elasticsearch server with documents that contain the domain in the property "domain"

### Execution
- Add your credentials and other info in the configuration info section

### Tips
- Webshot is called one-at-a-time for sites since calling a large number of phantomjs instances can and will eat a lot of memory,
 resulting in, for example, exited Docker containers.   
