var grunt = require('grunt');
var log = require('grunt-legacy-log');
var stream = require('readable-stream');
var inherits = require('inherits');
var multiTasks = [];

function BufferStream(done, options) {
  stream.Writable.call(this, options);

  var data = [];

  this._write = function (chunk, encoding, callback) {
    data.push(chunk);
    callback();
  };
  this.on('finish', function () {
    done(null, Buffer.concat(data));
  });
  this.on('error', function (err) {
    done(err);
  });
}
inherits(BufferStream, stream.Writable);

grunt.registerMultiTask = (function (obj, method) {
  return function (name) {
    multiTasks.push(name);
    method.apply(obj, arguments);
  };
})(grunt.task, grunt.task.registerMultiTask);

function Task(name, config) {
  if (!(this instanceof Task)) {
    return new Task(name, config);
  }

  var args = name.split(':');

  this.grunt = grunt;
  this.grunt.log = new log.Log({muted: true});
  this.grunt.verbose = this.grunt.log.verbose;
  this.name = args.shift();
  this.multi = multiTasks.indexOf(name) >= 0;
  this.target = this.multi ? args.shift() : null;
  this.args = args;
  this.config = {};
  this.files = [];
  this.stdout = null;

  var c = {};
  c[this.name] = config || {};

  this.grunt.initConfig(c);
}

Task.prototype.run = function (/* [arguments...], done */) {
  var args = this.args.concat([].slice.apply(arguments));
  var task = this;

  if (task.target) {
    args.unshift(task.target);
  } else if (task.multi) {
    args.unshift('');
  }
  args.unshift(task.name);

  function run(done) {
    var warn = task.grunt.fail.warn;
    var fatal = task.grunt.fail.fatal;
    var outStream = task.grunt.log.outStream;
    var config = task.grunt.config.get(task.name);
    var finished = false;

    function end() {
      if (!finished) {
        end = true;

        task.grunt.log.options.outStream.end();
        task.grunt.log.options.outStream = outStream;
        task.grunt.fail.warn = warn;
        task.grunt.fail.fatal = fatal;

        done.apply(this, arguments);
      }
    }

    task.target = task.multi ? (tark.target || Object.keys(config)[0] || 'default') : null;
    task.config = task.multi ? config[task.target] : config;
    task.files = task.grunt.task.normalizeMultiTaskFiles(task.config);

    task.grunt.log.options.outStream = new BufferStream(function (err, data) {
      task.stdout = data;
    });

    task.grunt.fail.warn = end;
    task.grunt.fail.fatal = end;

    task.grunt.task.options({
      error: end,
      done: end
    });

    task.grunt.task.run(args.join(':'));
    task.grunt.task.start({asyncDone: true});
  }

  if (typeof args[args.length-1] === 'function') {
    run(args.pop());
    return this;
  } else {
    return run;
  }
};

Task.prototype.fail = function() {
  var args = [].slice.apply(arguments);
  var task = this;

  function expectError(done) {
    return function (err) {
      if (!err) {
        done(new Error('Expected ' + task.name + ' task to fail'));
      } else {
        done(null, err);
      }
    };
  }

  if (typeof args[args.length-1] === 'function') {
    args.push(expectError(args.pop()));
    return task.run.apply(task, args);
  } else {
    return function(done) {
      args.push(expectError(done));
      task.run.apply(task, args);
    };
  }
};

Task.prototype.clean = function(/* [files...], [done] */) {
  var args = [].slice.apply(arguments);
  var task = this;

  function clean(done) {
    console.log(task.files);
    done();
  }

  if (typeof args[args.length-1] === 'function') {
    clean(args.pop());
    return this;
  } else {
    return clean;
  }
};

function runTask(name, config /* [arguments...], [done] */) {
  var task = new Task(name, config);

  return task.run.apply(task, [].slice.call(arguments, 2));
}

runTask.task = function create(name, config) {
  return new Task(name, config);
};

[ 'initConfig',
  'registerTask',
  'registerMultiTask',
  'renameTask',
  'loadTasks',
  'loadNpmTasks' ].forEach(function (fn) {
  runTask[fn] = grunt[fn].bind(grunt);
});

module.exports = runTask;
