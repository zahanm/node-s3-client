var knox = require('knox')
  , EventEmitter = require('events').EventEmitter
  , fs = require('fs');

exports.createClient = function(options) {
  var client = new Client();
  client.knox = knox.createClient(options);
  return client;
};

exports.fromKnox = function(knoxClient) {
  var client = new Client();
  client.knox = knoxClient;
  return client;
}

function Client(options) {}

Client.prototype.upload = function(localFile, remoteFile, headers) {
  
  if (typeof headers != 'object')
    headers = { };
  
  var uploader = new EventEmitter();
  var knoxUpload = this.knox.putFile(localFile, remoteFile, headers, function (err, resp) {
    if (err) {
      uploader.emit('error', err);
    } else if (resp.statusCode === 200 || resp.statusCode === 307) {
      // sometimes resp.req is undefined. nobody knows why
      uploader.emit('end', resp.req ? resp.req.url : resp.url);
    } else {
      uploader.emit('error', new Error("s3 http status code " + resp.statusCode));
    }
  });
  knoxUpload.on('progress', function (progress) {
    uploader.emit('progress', progress.written, progress.total);
  });
  return uploader;
};

Client.prototype.download = function(remoteFile, localFile) {
  var downloader = new EventEmitter();
  var headers;
  var amountDone = 0;
  var amountTotal;
  var writeStream;
  var knoxDownload = this.knox.getFile(remoteFile, function (err, resp) {
    if (err) {
      downloader.emit('error', err);
    } else if (resp.statusCode === 200 || resp.statusCode === 307) {
      amountTotal = parseInt(resp.headers['content-length'], 10);
      headers = resp.headers;
      var writeStream = fs.createWriteStream(localFile);
      writeStream.on('error', onError);
      resp.on('error', onError);
      resp.on('end', onSuccess);
      resp.on('data', onData);
      resp.pipe(writeStream);
    } else {
      downloader.emit('error', new Error("s3 http status code " + resp.statusCode));
    }
    function removeListeners() {
      writeStream.removeListener('error', onError);
      resp.removeListener('error', onError);
      resp.removeListener('end', onSuccess);
    }
    function onError(err) {
      removeListeners();
      writeStream.destroy();
      downloader.emit('error', err);
    }
    function onSuccess() {
      removeListeners();
      // make sure the stream has ended before we emit the event
      writeStream.end(null, null, function() {
        downloader.emit('end', { headers: headers });
      });
    }
    function onData(data) {
      amountDone += data.length;
      downloader.emit('progress', amountDone, amountTotal);
    }
  });
  return downloader;
};

Client.prototype.list = function(remotePath) {
  var lister = new EventEmitter();
  var knoxList = this.knox.list({ prefix: remotePath }, function (err, resp) {
    if (err) {
      lister.emit('error', err);
    } else if (resp.statusCode !== 200 && resp.statusCode !== 307) {
      lister.emit('error', new Error("s3 http status code " + resp.statusCode));
    } else {
      // successful request
      // TODO
    }
  });
};
