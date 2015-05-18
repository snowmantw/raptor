var Phase = require('./phase');
var Dispatcher = require('../dispatcher');
var Promise = require('promise');
var util = require('util');
var performanceParser = require('../parsers/performance');
var debug = require('debug')('raptor:marionette');
var noop = function() {};

/**
 * Create a suite runner which combines Marionette with Raptor.
 * @param {{
 *   runs: Number,
 *   timeout: Number,
 *   retries: Number
 * }} options
 * @constructor
 */
var Marionette = function(options) {
  Phase.call(this, options);

  this.endMark = options.marks.end;
  if (!this.endMark) {
    throw new Error('Can\'t determinate when to flush logs');
  }
  this.title = 'Marionette';
  this.start();
};

util.inherits(Marionette, Phase);

/**
 * Manually instantiate a Dispatcher and listen for performance entries
 */
Marionette.prototype.setupLogs = function() {
  var runner = this;

  return this.getDevice()
    .then(function() {
      return runner.device.log.clear();
    })
    .then(function(time) {
      return runner.device.log.mark('deviceMarionette', time);
    });
};

Marionette.prototype.setup = function() {
  this.device.log.restart();
  this.dispatcher = new Dispatcher(this.device);
  this.registerParser(performanceParser);
  this.capture('performanceentry');
};

/**
 * Setup the logger.
 * @returns {Promise}
 */
Marionette.prototype.testRun = function() {
  var runner = this;
  return new Promise(function(resolve) {
    runner.setupLogs().then(function() {
      runner.setup();
      runner.dispatcher.on('performanceentry', function handler(entry) {
        entry.epoch = Date.now();
        // When our last mark comes, end it and resolve
        // this promise to flush the logs.
        if (entry.name === runner.endMark) {
          runner.dispatcher.removeListener('performanceentry', handler);
          resolve();
        }
      });
    });
  });
};

/**
 * Retry handler which is invoked if a test run fails to complete. Currently
 * does nothing to handle a retry.
 * @returns {Promise}
 */
Marionette.prototype.retry = noop;

/**
 * Report the results for an individual test run
 * @returns {Promise}
 */
Marionette.prototype.handleRun = function() {
  var results = this.format(this.results, 'marionette', 'deviceMarionette');
  return this.report(results);
};

module.exports = Marionette;
