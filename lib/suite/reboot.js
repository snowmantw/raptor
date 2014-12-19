var Phase = require('./phase');
var Dispatcher = require('../dispatcher');
var Device = require('../device');
var Promise = require('promise');
var util = require('util');
var performanceParser = require('../parsers/performance');
var debug = require('debug')('raptor:reboot');
var merge = require('deepmerge');
var envParse = require('../parsers/parse-env');
var noop = function() {};

/**
 * Create a suite runner which achieves a ready state when the device has been
 * rebooted
 * @param {{
 *   runs: Number,
 *   timeout: Number,
 *   retries: Number
 * }} options
 * @constructor
 */
var Reboot = function(options) {
  // The connection to the dispatcher is ADB-based, so rebooting the device will
  // kill the ADB stream. Prevent the base runner from instantiating so we can
  // control the dispatcher lifecycle
  options.preventDispatching = true;

  Phase.call(this, options);

  this.start();
};

util.inherits(Reboot, Phase);

/**
 * Manually instantiate a Dispatcher and listen for performance entries
 */
Reboot.prototype.setup = function() {
  this.dispatcher = new Dispatcher();
  this.registerParser(performanceParser);
  this.capture('performanceentry');
};

/**
 * Perform a device reboot
 * @returns {Promise}
 */
Reboot.prototype.reboot = function() {
  return Device
    .clearLog()
    .then(Device.reboot);
};

/**
 * Stand up a device reboot for each individual test run. Will denote the run
 * has completed its work when the System marks the end of the logo screen.
 * @returns {Promise}
 */
Reboot.prototype.testRun = function() {
  var runner = this;

  return new Promise(function(resolve) {
    var start = Date.now();

    runner
      .reboot()
      .then(function() {
        runner.setup();
        runner.dispatcher.on('performanceentry', function handler(entry) {
          // Due to a bug in the Flame's ability to keep consistent time after
          // a reboot, we are currently overriding the time of the event. Not
          // very accurate, but it's better than nothing
          entry.epoch = entry.name === 'deviceReboot' ?
            start : Date.now();

          debug('Received performance entry `%s`', entry.name);

          if (entry.context !== 'System') {
            return;
          }

          if (entry.name !== 'osLogoEnd') {
            return;
          }

          runner.dispatcher.removeListener('performanceentry', handler);
          resolve();
        });
      });
  });
};

/**
 * Retry handler which is invoked if a test run fails to complete. Currently
 * does nothing to handle a retry.
 * @returns {Promise}
 */
Reboot.prototype.retry = noop;

/**
 * Write the given entries to a format suitable for reporting
 * @param {Array} entries
 * @returns {object}
 */
Reboot.prototype.format = function(entries) {
  var runner = this;
  var deviceReboot = entries.filter(function(entry) {
    return entry.name === 'deviceReboot';
  })[0];

  var results = {};

  entries.forEach(function(entry) {
    if (entry.name === 'deviceReboot') {
      return;
    }

    var series = util.format('Suites.Reboot.%s.%s',
      entry.context, entry.name);
    var point = merge({
      name: entry.name,
      time: runner.time,
      epoch: entry.epoch,
      value: entry.entryType === 'mark' ?
      entry.epoch - deviceReboot.epoch : entry.duration
    }, envParse());

    if (!results[series]) {
      results[series] = [];
    }

    results[series].push(point);
  });

  return results;
};

/**
 * Report the results for an individual test run
 * @returns {Promise}
 */
Reboot.prototype.handleRun = function() {
  var results = this.format(this.results);
  return this.report(results);
};

module.exports = Reboot;