var env = require('dotenv');
var async = require('async');
var merge = require('deepmerge');
var Suite = require('./lib/suite');

// Each test run can generate many event handlers, so let's shut off Node's
// too-many-listeners warning.
process.setMaxListeners(0);

// Capture environment variables set in .env files
env.load();

var currentRunner;
var errors = [];

/**
 * Handle any remaining logic after all suites have been completed
 */
var complete = function() {
  if (currentRunner.device) {
    currentRunner.reportTest();
    currentRunner.device.log.stop();
  }

  currentRunner.log('Testing complete');

  if (!errors.length) {
    return;
  }

  currentRunner.log('Error summary:');

  errors.forEach(function(err) {
    console.error('\n' + (err instanceof Error ? err.stack : err));
  });

  process.exit(1);
};

/**
 * Factory to instantiate a test suite. Sets up error and ready notification.
 * @param {object} options options to pass through to suite
 * @param {function} callback
 * @returns {Suite}
 */
var createRunner = function(options, callback) {
  return currentRunner = new Suite(options)
    .once('ready', function() {
      callback(currentRunner);
    });
};

/**
 *
 * @param {object} options Suite options, e.g. appPath, runs, retries
 * @param {function} callback
 */
var raptor = function(options, callback) {
  if (process.env.RUNS) {
    options.runs = parseInt(process.env.RUNS, 10);
  }

  if (process.env.RAPTOR_EMULATOR) {
    options.emulator = true;
  }

  if (!options.time) {
    options.time = Date.now();
  }

  // Skip parsing for application paths if our runner doesn't require it
  if (!options.apps && !process.env.APP && !process.env.APPS) {
    createRunner(options, callback)
      .on('error', function(err) {
        errors.push(err);
        currentRunner.log('Suite aborted due to error');
        complete();
      })
      .on('end', function() {
        currentRunner.logStats();
        complete();
      });
    return;
  }

  var apps;

  /**
   * Order of operations for getting the applications to test:
   * 1. Single application specified using APP environment variable
   * 2. Multiple applications specified using APPS environment variable
   * 3. Applications passed via `apps` array option
   */
  if (process.env.APP) {
    apps = [ process.env.APP ];
  } else if (process.env.APPS) {
    apps = process.env.APPS.split(',');
  } else {
    apps = options.apps;
  }

  // Instantiate a suite runner for each application
  async.eachSeries(apps, function(app, next) {
    var settings = merge(options, {
      appPath: app
    });

    // Once this suite runner has completed all its runs and the test runner is
    // done working with this app, move on to the next application's test runs
    createRunner(settings, callback)
      .on('error', function(err) {
        errors.push(err);
        currentRunner.log('Suite aborted due to error');
        next();
      })
      .on('end', function() {
        currentRunner.logStats();
        next();
      });
  }, complete);
};

module.exports = raptor;