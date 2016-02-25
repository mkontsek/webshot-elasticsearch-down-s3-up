var config = require('./config');
var webshot = require('webshot');
var fs = require('fs');
var _ = require('lodash');
var AWS = require('aws-sdk');
var elasticsearch = require('elasticsearch');
var jQuery = require('jquery-deferred');

// load file names of S3 bucket
var s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey
});

s3.listObjects({Bucket: config.awsTargetBucket}, function (err, data) {
    if (err)
        console.log(err, err.stack);
    else {
        var sortedDescending = sortDataByLastUpdate(data);
        var lastUpdated = undefined;
        if (!_.isEmpty(sortedDescending))
            lastUpdated = sortedDescending[0].LastModified;

        console.log('Last updated S3 file date: ' + lastUpdated);
        processSitesFromEsSinceLastUpdate(lastUpdated);
    }
});

function sortDataByLastUpdate(data) {
    var files = data.Contents;

    if (_.isEmpty(files))
        return files;

    return _.sortBy(files, ['LastModified']).reverse();
}

function processSitesFromEsSinceLastUpdate(lastUpdated) {
    var client = new elasticsearch.Client({
        host: config.elasticsearchHost,
        log: 'warning'
    });
    if (lastUpdated !== undefined) {
        var date = new Date(lastUpdated);
        console.log('Looking into Elasticsearch docs for hits since ' + date.toISOString());
        client.search({
            index: config.elasticsearchIndex,
            type: config.elasticsearchType,
            body: {
                "query": {
                    "range": {
                        "lastUpdated": {
                            "gte": date.toISOString().split('T')[0]
                        }
                    }
                },
                "size": config.elasticsearchSizeLimit
            }
        }).then(processEsResults, function (err) {
            console.trace(err.message);
        });
    } else
        client.search({
            index: config.elasticsearchIndex,
            type: config.elasticsearchType,
            body: {
                "size": config.elasticsearchSizeLimit
            }
        }).then(processEsResults, function (err) {
            console.trace(err.message);
        });
}

// use site counter, else you'll have a ton of phantomjs instances, eating your memory and maybe killing some docker container :-/
var siteCounter = 0;
var sites = [];
var finishedWebshotSites = [];
function processEsResults(resp) {
    sites = _.uniq(_.map(resp.hits.hits, function (el) {
        return el._source.domain;
    }));

    if (sites.length > 0)
        iterateThroughSites();
    else
        console.log("No sites to go through.");
}

function iterateThroughSites() {
    if (siteCounter > sites.length - 1)
        return;

    // wait for phantomjs to exit or you may have leftover instances finishing, still eating memory
    _.delay(function () {
        makeWebshotAndUpload(sites[siteCounter]);
    }, 8000);
}

var deferredBigImage, deferredSmallImage;
function makeWebshotAndUpload(domain) {
    var imageName = domain + '.png';
    var imageNameSmall = domain + '-mobile.png';
    var timeout = 100 * 1000;
    deferredBigImage = jQuery.Deferred();
    deferredSmallImage = jQuery.Deferred();

    console.log("Making webshot of " + imageName);
    doWebshot(domain, imageName, {
        timeout: timeout,
        screenSize: {
            width: 1024
            , height: 768
        }
        , shotSize: {
            width: 1024
            , height: 768
        }
    });

    deferredBigImage.done(function () {
        console.log("Making webshot of " + imageNameSmall);

        doWebshot(domain, imageNameSmall, {
            timeout: timeout,
            screenSize: {
                width: 320
                , height: 480
            }
            , shotSize: {
                width: 320
                , height: 480
            }
            , userAgent: 'Mozilla/5.0 (iPhone; U; CPU iPhone OS 3_2 like Mac OS X; en-us)'
            + ' AppleWebKit/531.21.20 (KHTML, like Gecko) Mobile/7B298g'
        });

    });

    deferredSmallImage.done(function () {
        siteCounter++;
        console.log('Iterating through site ' + siteCounter);
        iterateThroughSites();
    });
}

function doWebshot(domain, imageName, options) {
    webshot(domain, imageName, options, function (err) {
        // this callback get called more times for one domain/imageName ... why?....
        if (finishedWebshotSites.indexOf(imageName) !== -1)
            return;
        else
            finishedWebshotSites.push(imageName);

        if (err)
            console.log('For ' + imageName + ' err:' + err);
        else
            uploadToS3(imageName);

        if (deferredBigImage.state() === 'resolved')
            deferredSmallImage.resolve();
        else
            deferredBigImage.resolve();

    });
}

function uploadToS3(imageName) {
    try {
        if (!fs.statSync(imageName)) {
            console.log(imageName + ' not found, no upload.');
            return;
        }

        var body = fs.createReadStream(imageName);

        s3.upload({
            Body: body,
            Bucket: config.awsTargetBucket,
            Key: imageName,
            ACL: 'public-read',
            ContentType: 'image/png'
        }, function (err, data) {
            console.log(err, data);
            try {
                if (fs.statSync(imageName))
                    fs.unlink(imageName);
                else
                    console.log("Couldn't delete file " + imageName);
            } catch (e) {
                console.log("Couldn't delete file " + imageName + ' with error:' + e);
            }
        });
    } catch (e) {
        console.log(e);
    }
}