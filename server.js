var githubhook = require('githubhook');
var servers = {
  'cmo': 'https://github.com/ryanrolds/apts.git'
};

githubhook(3000, servers, function(error, payload) {
  if (error) {
    return console.log(err);
  }

  console.log(payload);
});