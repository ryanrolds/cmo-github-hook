
var childProcess = require('child_process');
var path = require('path');
var fs = require('fs');
var util = require('util');

var async = require('async');
var semver = require('semver');
var render = require('render');
var express = require('express');
var running = false;

var incCommitMsg = "[Deployinating] Inc version";
var port = process.argv[2] || 3000;
var app = express();

app.use(express.bodyParser());

app.post('/', function(req, res, next) {
  if (req.body && req.body.payload) {
    // Github sends a urlencoded form post with a payload var containing JSON
    try {
      var msg = JSON.parse(req.body.payload);
    } catch (e) {
      return next(e);
    }

    // Only do this on changes to apts repo
    if (msg.repository.url === 'https://github.com/ryanrolds/apts' &&
       msg.head_commit.message !== incCommitMsg) {
      // Prevent multiples
      if (running) {
        return res.end();
      }

      var running = true;    

      // Repo location so we can run commands in the right dir
      var repo = path.resolve(process.env.HOME, 'repos/apts');
      var opts = {
        'cwd': repo
      };

      var version;

      async.series(
        [
          function(callback) { // Update repo
            childProcess.exec('git pull', opts, callback);
          },
          function(callback) { // Get version
            fs.readFile(path.resolve(repo, 'cast.json'), 'utf8', function(error, data) {
              if (error) {
                return callback(error);
              }

              try {
                var json = JSON.parse(data);
              } catch (e) {
                return callback(e);
              }

              if (!semver.valid(json.version)) {
                return callback(new Error('Invalid version in cast.json'));
              }

              version = json.version;
              callback(null, version);
            });
          },
          function(callback) { // Create bundle
            childProcess.exec('cast bundles create', opts, callback);
          },
          function(callback) { // Upload bundle to dev server
            childProcess.exec('cast bundles upload -r checkmeonce-dev', opts, callback);
          },
          function(callback) { // Upgrade checkmeonce instance on dev server to version
            childProcess.exec('cast instances upgrade -r checkmeonce-dev checkmeonce ' + version, opts, callback);
          },
          function(callback) {
            version = semver.inc(version, 'patch');
            callback(null, version);
          },
          function(callback) { // Increment cast.json version
            var fullPath = path.resolve(repo, 'cast.json');
            incVersion(fullPath, version, callback);
          },
          function(callback) { // Increment package.json version
            var fullPath = path.resolve(repo, 'package.json');
            incVersion(fullPath, version, callback);
          },
          function(callback) { // Commit changes
            childProcess.exec('git commit -m "[Deployinating] Inc version" package.json cast.json', opts, callback);
          },
          function(callback) { // Push changes
            childProcess.exec('git push', opts, callback);
          }
        ],
        function(error, results) {
          running = false;

          if (error) {
            console.log(error, results);
            next(error);
          }

          res.end();
        }
      );
    }
  }

  res.end();
})

app.listen(3000, function(error) {
  if (error) {
    throw error;
  }

  console.log('Started on', port);
});

function incVersion(file, version, callback) {
  fs.readFile(file, 'utf8', function(error, data) {
    if (error) {
      return callback(error);
    }

    try {
      var json = JSON.parse(data);
    } catch (e) {
      return callback(e);
    }

    json.version = version;
    fs.writeFile(file, render.json.ctbn(json), callback);
  });
}